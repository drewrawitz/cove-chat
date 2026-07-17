import { Context, Schema } from "effect";
import { HttpApiMiddleware, HttpApiSecurity, OpenApi } from "effect/unstable/httpapi";
import { InternalServerErrorResponse, UnauthorizedResponse } from "./auth-error-response.ts";

export const SessionCookie = HttpApiSecurity.apiKey({
  key: "cove_session",
  in: "cookie",
}).pipe(
  HttpApiSecurity.annotate(
    OpenApi.Description,
    "HTTP-only session cookie issued after magic-link verification.",
  ),
);

export const CsrfCookie = HttpApiSecurity.apiKey({
  key: "cove_csrf",
  in: "cookie",
});

export const AuthenticatedActorId = Schema.NonEmptyString.pipe(
  Schema.brand("AuthenticatedActorId"),
);
export type AuthenticatedActorId = typeof AuthenticatedActorId.Type;

export interface AuthenticatedActorIdentity {
  readonly userId: AuthenticatedActorId;
}

export class AuthenticatedActor extends Context.Service<
  AuthenticatedActor,
  AuthenticatedActorIdentity
>()("@cove/protocol/AuthenticatedActor") {}

export const SessionCookieTokenValue = Schema.NonEmptyString.pipe(
  Schema.brand("SessionCookieToken"),
);
export type SessionCookieTokenValue = typeof SessionCookieTokenValue.Type;

export const SessionCookieToken = Schema.Redacted(SessionCookieTokenValue, {
  label: "SessionCookieToken",
  disallowJsonEncode: true,
});
export type SessionCookieToken = typeof SessionCookieToken.Type;

export interface AuthenticatedSessionContext {
  readonly actor: AuthenticatedActorIdentity;
  readonly token: SessionCookieToken;
}

export class AuthenticatedSession extends Context.Service<
  AuthenticatedSession,
  AuthenticatedSessionContext
>()("@cove/protocol/AuthenticatedSession") {}

export class SessionAuth extends HttpApiMiddleware.Service<
  SessionAuth,
  { provides: AuthenticatedActor | AuthenticatedSession }
>()("@cove/protocol/SessionAuth", {
  security: { sessionCookie: SessionCookie },
  error: [UnauthorizedResponse, InternalServerErrorResponse],
}) {}
