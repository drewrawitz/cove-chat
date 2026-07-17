import type { User, UserId } from "@cove/domain";
import { Context, type Effect, type Option } from "effect";
import type { PersistenceError } from "../persistence-error.ts";
import type { MagicLinkToken } from "./tokens.ts";

export interface MagicLinkRepositoryService {
  readonly issue: (
    userId: UserId,
    expiresAt: Date,
  ) => Effect.Effect<MagicLinkToken, PersistenceError>;
  readonly consume: (token: MagicLinkToken) => Effect.Effect<Option.Option<User>, PersistenceError>;
}

export class MagicLinkRepository extends Context.Service<
  MagicLinkRepository,
  MagicLinkRepositoryService
>()("@cove/ports/MagicLinkRepository") {}
