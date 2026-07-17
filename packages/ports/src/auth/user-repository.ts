import type { EmailAddress, User } from "@cove/domain";
import { Context, type Effect, type Option } from "effect";
import type { PersistenceError } from "../persistence-error.ts";

export interface UserRepositoryService {
  readonly findByEmail: (
    email: EmailAddress,
  ) => Effect.Effect<Option.Option<User>, PersistenceError>;
}

export class UserRepository extends Context.Service<UserRepository, UserRepositoryService>()(
  "@cove/ports/UserRepository",
) {}
