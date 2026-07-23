import {
  SessionIdentityResolver,
  SessionIdentityResolverLive,
  makeSessionToken,
} from "@cove/application";
import { SessionCookie } from "@cove/protocol";
import { handleCoveQueryRequest } from "@cove/sync/server";
import { Effect } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

const unauthorized = HttpServerResponse.jsonUnsafe({ error: "Unauthorized" }, { status: 401 });
const internalServerError = HttpServerResponse.jsonUnsafe(
  { error: "Internal Server Error" },
  { status: 500 },
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
    const result = yield* Effect.tryPromise(() =>
      handleCoveQueryRequest({
        request: webRequest,
        userID: user.id,
      }),
    );
    return HttpServerResponse.jsonUnsafe(result);
  }).pipe(
    Effect.catchTag("Application.Unauthenticated", () => Effect.succeed(unauthorized)),
    Effect.catchCause((cause) => Effect.logError(cause).pipe(Effect.as(internalServerError))),
    Effect.provide(SessionIdentityResolverLive),
  );

export const ZeroQueryRoute = HttpRouter.add("POST", "/api/zero/query", handle);
