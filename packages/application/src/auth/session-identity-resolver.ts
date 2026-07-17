import type { User } from "@cove/domain";
import { SessionRepository, type PersistenceError, type SessionToken } from "@cove/ports";
import { Context, Effect, Layer } from "effect";
import { getCurrentUser, type Unauthenticated } from "./get-current-user.ts";

export interface SessionIdentityResolverService {
  readonly resolve: (
    token: SessionToken,
  ) => Effect.Effect<User, Unauthenticated | PersistenceError>;
}

export class SessionIdentityResolver extends Context.Service<
  SessionIdentityResolver,
  SessionIdentityResolverService
>()("@cove/application/SessionIdentityResolver") {}

const make = Effect.gen(function* () {
  const sessions = yield* SessionRepository;

  return SessionIdentityResolver.of({
    resolve: (token) =>
      getCurrentUser(token).pipe(Effect.provideService(SessionRepository, sessions)),
  });
});

export const SessionIdentityResolverLive = Layer.effect(SessionIdentityResolver, make);
