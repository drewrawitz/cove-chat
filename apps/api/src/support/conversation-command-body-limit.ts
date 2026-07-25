import { Context, Effect, FileSystem, Result } from "effect";
import { HttpServerError, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

export const CONVERSATION_COMMAND_REQUEST_MAX_BYTES = 64 * 1024;

const requestTooLarge = HttpServerResponse.jsonUnsafe(
  { error: "Conversation command request too large" },
  { status: 413 },
);

const requestUnreadable = HttpServerResponse.jsonUnsafe(
  { error: "Conversation command request body could not be read" },
  { status: 400 },
);

const isConversationCommand = (request: HttpServerRequest.HttpServerRequest): boolean => {
  if (request.method !== "POST" && request.method !== "PATCH") return false;
  const pathname = new URL(request.originalUrl, "http://cove.local").pathname;
  return (
    /^\/api\/app\/v1\/workspaces\/[^/]+\/channels(?:\/private)?$/.test(pathname) ||
    /^\/api\/app\/v1\/workspaces\/[^/]+\/channels\/[^/]+\/topics$/.test(pathname) ||
    /^\/api\/app\/v1\/workspaces\/[^/]+\/channels\/[^/]+\/topics\/[^/]+\/messages(?:\/[^/]+)?$/.test(
      pathname,
    )
  );
};

const exceededBodyLimit = (error: HttpServerError.HttpServerError): boolean =>
  error.reason._tag === "RequestParseError" &&
  error.reason.cause instanceof Error &&
  error.reason.cause.message === "maxBytes exceeded";

export const withConversationCommandBodyLimit = <A, E, R>(httpEffect: Effect.Effect<A, E, R>) =>
  Effect.withFiber((fiber) => {
    const request = Context.getUnsafe(fiber.context, HttpServerRequest.HttpServerRequest);
    return Effect.gen(function* () {
      if (!isConversationCommand(request)) return yield* httpEffect;

      const declaredLength = Number(request.headers["content-length"]);
      if (
        Number.isFinite(declaredLength) &&
        declaredLength > CONVERSATION_COMMAND_REQUEST_MAX_BYTES
      ) {
        return requestTooLarge;
      }

      const maxBodySize = FileSystem.Size(CONVERSATION_COMMAND_REQUEST_MAX_BYTES);
      const body = yield* Effect.result(
        request.text.pipe(Effect.provideService(HttpServerRequest.MaxBodySize, maxBodySize)),
      );
      if (Result.isFailure(body)) {
        if (exceededBodyLimit(body.failure)) return requestTooLarge;
        return requestUnreadable;
      }

      return yield* httpEffect.pipe(
        Effect.provideService(HttpServerRequest.MaxBodySize, maxBodySize),
      );
    });
  });
