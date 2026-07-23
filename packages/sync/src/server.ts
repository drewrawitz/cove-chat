import { handleQueryRequest } from "@rocicorp/zero/server";
import { mustGetQuery } from "@rocicorp/zero";
import { queries, schema, type QueryContext } from "./index.ts";

export interface CoveQueryRequest {
  readonly request: Request;
  readonly userID: string;
}

export class InvalidCoveQueryRequestError extends Error {
  readonly _tag = "CoveQueryRequest.Invalid";

  constructor(
    readonly reason: "QueryNotFound" | "InputValidation",
    cause: unknown,
  ) {
    super("Invalid Cove query request.", { cause });
    this.name = "InvalidCoveQueryRequestError";
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

export const handleCoveQueryRequest = async ({ request, userID }: CoveQueryRequest) => {
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
    request,
    schema,
    userID,
  });

  if (handlerFailure !== undefined) throw handlerFailure.cause;
  return result;
};

export { queries, schema, type QueryContext };
