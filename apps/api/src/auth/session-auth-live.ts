import {
  SessionIdentityResolver,
  SessionIdentityResolverLive,
  makeSessionToken,
} from "@cove/application";
import {
  AuthErrorResponses,
  AuthenticatedActor,
  AuthenticatedActorId,
  AuthenticatedSession,
  SessionAuth,
  SessionCookieToken,
  SessionCookieTokenValue,
} from "@cove/protocol";
import { Effect, Layer, Redacted } from "effect";

const make = Effect.gen(function* () {
  const identities = yield* SessionIdentityResolver;

  return SessionAuth.of({
    sessionCookie: (httpEffect, { credential }) => {
      const credentialValue = Redacted.value(credential);

      if (credentialValue.length === 0) {
        return Effect.fail(AuthErrorResponses.unauthorized);
      }

      return identities.resolve(makeSessionToken(credentialValue)).pipe(
        Effect.mapError((error) =>
          error._tag === "Application.Unauthenticated"
            ? AuthErrorResponses.unauthorized
            : AuthErrorResponses.internalServerError,
        ),
        Effect.flatMap((user) => {
          const actor = AuthenticatedActor.of({
            userId: AuthenticatedActorId.make(user.id),
          });
          const token = SessionCookieToken.make(
            Redacted.make(SessionCookieTokenValue.make(credentialValue), {
              label: "SessionCookieToken",
            }),
          );

          return httpEffect.pipe(
            Effect.provideService(AuthenticatedActor, actor),
            Effect.provideService(AuthenticatedSession, { actor, token }),
          );
        }),
      );
    },
  });
});

export const SessionAuthLive = Layer.effect(SessionAuth, make).pipe(
  Layer.provide(SessionIdentityResolverLive),
);
