import {
  SessionIdentityResolver,
  SessionIdentityResolverLive,
  makeSessionToken,
} from "@cove/application";
import { SessionCookie } from "@cove/protocol";
import { handleCoveQueryRequest, InvalidCoveQueryRequestError } from "@cove/sync/server";
import { Effect } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

const unauthorized = HttpServerResponse.jsonUnsafe({ error: "Unauthorized" }, { status: 401 });
const badRequest = HttpServerResponse.jsonUnsafe(
  { error: "Invalid query request" },
  { status: 400 },
);
const internalServerError = HttpServerResponse.jsonUnsafe(
  { error: "Internal Server Error" },
  { status: 500 },
);

export const respondToCoveQueryRequest = (request: Request, userID: string) =>
  Effect.tryPromise(() => handleCoveQueryRequest({ request, userID })).pipe(
    Effect.map((result) => HttpServerResponse.jsonUnsafe(result)),
    Effect.catchIf(
      (error) => error.cause instanceof InvalidCoveQueryRequestError,
      () => Effect.succeed(badRequest),
    ),
  );

const handle = (request: HttpServerRequest.HttpServerRequest) =>
  Effect.gen(function* () {
    const token = request.cookies[SessionCookie.key];
    if (token === undefined || token.length === 0) {
      return unauthorized;
    }

    const identities = yield* SessionIdentityResolver;
    const user = yield* identities.resolve(makeSessionToken(token));
    const webRequest = yield* HttpServerRequest.toWeb(request);
    return yield* respondToCoveQueryRequest(webRequest, user.id);
  }).pipe(
    Effect.catchTag("Application.Unauthenticated", () => Effect.succeed(unauthorized)),
    Effect.catchCause((cause) => Effect.logError(cause).pipe(Effect.as(internalServerError))),
    Effect.provide(SessionIdentityResolverLive),
    Effect.withSpan("ZeroQueryRoute.authorizeQuery"),
  );

export const ZeroQueryRoute = HttpRouter.add("POST", "/api/zero/query", handle);
