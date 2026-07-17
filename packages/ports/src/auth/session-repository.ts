import type { User, UserId } from "@cove/domain";
import { Context, type Effect, type Option } from "effect";
import type { PersistenceError } from "../persistence-error.ts";
import type { CsrfToken, SessionToken } from "./tokens.ts";

export interface SessionCredentials {
  readonly token: SessionToken;
  readonly csrfToken: CsrfToken;
  readonly expiresAt: Date;
}

export interface SessionRepositoryService {
  readonly create: (
    userId: UserId,
    expiresAt: Date,
  ) => Effect.Effect<SessionCredentials, PersistenceError>;
  readonly findCurrentUser: (
    token: SessionToken,
  ) => Effect.Effect<Option.Option<User>, PersistenceError>;
  readonly revoke: (
    token: SessionToken,
    csrfToken: CsrfToken,
  ) => Effect.Effect<boolean, PersistenceError>;
}

export class SessionRepository extends Context.Service<
  SessionRepository,
  SessionRepositoryService
>()("@cove/ports/SessionRepository") {}
