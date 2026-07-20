import {
  RequestMagicLinkInput,
  VerifyMagicLinkInput,
  getCurrentUser,
  logout,
  makeCsrfToken,
  makeEmailAddress,
  makeMagicLinkToken,
  makeSessionToken,
  requestMagicLink,
  verifyMagicLink,
} from "@cove/application";
import {
  AuthErrorResponses,
  AuthenticatedSession,
  CoveAppApi,
  CsrfCookie,
  MagicLinkAcceptedResponse,
  SessionCookie,
} from "@cove/protocol";
import { Effect, Redacted } from "effect";
import { HttpEffect, HttpServerResponse } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { setAuthenticationCookies } from "./authentication-cookies.ts";
import { currentUserResponse } from "./current-user-response.ts";

const expireAuthenticationCookies = HttpEffect.appendPreResponseHandler((_request, response) =>
  Effect.succeed(
    HttpServerResponse.setCookieUnsafe(
      HttpServerResponse.setCookieUnsafe(response, SessionCookie.key, "", {
        expires: new Date(0),
        httpOnly: true,
        maxAge: 0,
        path: "/",
        sameSite: "strict",
        secure: true,
      }),
      CsrfCookie.key,
      "",
      {
        expires: new Date(0),
        httpOnly: false,
        maxAge: 0,
        path: "/",
        sameSite: "strict",
        secure: true,
      },
    ),
  ),
);

export const AuthApiLive = HttpApiBuilder.group(CoveAppApi, "auth", (handlers) =>
  handlers
    .handle("login", ({ payload }) =>
      requestMagicLink(
        RequestMagicLinkInput.make({
          email: makeEmailAddress(payload.email),
        }),
      ).pipe(
        Effect.mapError(() => AuthErrorResponses.internalServerError),
        Effect.as(MagicLinkAcceptedResponse.make({ status: "accepted" })),
      ),
    )
    .handle("verifyMagicLink", ({ payload }) =>
      verifyMagicLink(
        VerifyMagicLinkInput.make({
          token: makeMagicLinkToken(payload.token),
        }),
      ).pipe(
        Effect.mapError((error) =>
          error._tag === "Application.InvalidMagicLink"
            ? AuthErrorResponses.invalidMagicLink
            : AuthErrorResponses.internalServerError,
        ),
        Effect.tap(({ session }) =>
          setAuthenticationCookies(session.token, session.csrfToken, session.expiresAt),
        ),
        Effect.map(({ user }) => currentUserResponse(user)),
      ),
    )
    .handle("logout", ({ headers }) =>
      Effect.gen(function* () {
        const session = yield* AuthenticatedSession;
        const csrfHeader = headers["x-csrf-token"];

        if (csrfHeader === undefined) {
          return yield* Effect.fail(AuthErrorResponses.csrfValidationFailed);
        }

        yield* logout(
          makeSessionToken(Redacted.value(session.token)),
          makeCsrfToken(csrfHeader),
        ).pipe(
          Effect.mapError((error) =>
            error._tag === "Application.InvalidCsrfToken"
              ? AuthErrorResponses.csrfValidationFailed
              : AuthErrorResponses.internalServerError,
          ),
        );
        yield* expireAuthenticationCookies;
      }),
    )
    .handle("me", () =>
      Effect.gen(function* () {
        const session = yield* AuthenticatedSession;
        const user = yield* getCurrentUser(makeSessionToken(Redacted.value(session.token))).pipe(
          Effect.mapError((error) =>
            error._tag === "Application.Unauthenticated"
              ? AuthErrorResponses.unauthorized
              : AuthErrorResponses.internalServerError,
          ),
        );

        return currentUserResponse(user);
      }),
    ),
);
