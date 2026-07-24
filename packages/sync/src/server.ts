import { handleQueryRequest } from "@rocicorp/zero/server";
import { mustGetQuery } from "@rocicorp/zero";
import { queries, schema, type QueryContext } from "./index.ts";

export interface CoveQueryRequest {
  readonly request: Request;
  readonly userID: string;
}

export const COVE_QUERY_REQUEST_MAX_BYTES = 256 * 1024;

export class CoveQueryRequestTooLargeError extends Error {
  readonly _tag = "CoveQueryRequest.TooLarge";

  constructor() {
    super("Cove query request exceeds 256 KiB.");
    this.name = "CoveQueryRequestTooLargeError";
  }
}

export class InvalidCoveQueryRequestError extends Error {
  readonly _tag = "CoveQueryRequest.Invalid";
  readonly reason: "QueryNotFound" | "InputValidation";

  constructor(reason: "QueryNotFound" | "InputValidation", cause: unknown) {
    super("Invalid Cove query request.", { cause });
    this.name = "InvalidCoveQueryRequestError";
    this.reason = reason;
  }
}

const isInputValidationError = (
  error: unknown,
): error is { readonly details: { readonly type: "InputValidationError" } } =>
  typeof error === "object" &&
  error !== null &&
  "details" in error &&
  typeof error.details === "object" &&
  error.details !== null &&
  "type" in error.details &&
  error.details.type === "InputValidationError";

const getCoveQuery = (name: string) => {
  try {
    return mustGetQuery(queries, name);
  } catch (cause) {
    throw new InvalidCoveQueryRequestError("QueryNotFound", cause);
  }
};

const boundedRequest = async (request: Request): Promise<Request> => {
  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength !== null &&
    Number.isFinite(Number(declaredLength)) &&
    Number(declaredLength) > COVE_QUERY_REQUEST_MAX_BYTES
  ) {
    throw new CoveQueryRequestTooLargeError();
  }
  if (request.body === null) return request;

  const reader = request.body.getReader();
  const chunks: Array<Uint8Array> = [];
  let byteLength = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    byteLength += chunk.value.byteLength;
    if (byteLength > COVE_QUERY_REQUEST_MAX_BYTES) {
      await reader.cancel();
      throw new CoveQueryRequestTooLargeError();
    }
    chunks.push(chunk.value);
  }

  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body,
    signal: request.signal,
  });
};

export const handleCoveQueryRequest = async ({ request, userID }: CoveQueryRequest) => {
  const requestWithinBounds = await boundedRequest(request);
  let handlerFailure: { readonly cause: unknown } | undefined;
  const result = await handleQueryRequest({
    handler: (name, args) => {
      try {
        const query = getCoveQuery(name);
        try {
          return query.fn({
            args,
            ctx: { userID } satisfies QueryContext,
          });
        } catch (cause) {
          if (isInputValidationError(cause)) {
            throw new InvalidCoveQueryRequestError("InputValidation", cause);
          }
          throw cause;
        }
      } catch (cause) {
        handlerFailure ??= { cause };
        throw cause;
      }
    },
    request: requestWithinBounds,
    schema,
    userID,
  });

  if (handlerFailure !== undefined) throw handlerFailure.cause;
  return result;
};

export { queries, schema, type QueryContext };
