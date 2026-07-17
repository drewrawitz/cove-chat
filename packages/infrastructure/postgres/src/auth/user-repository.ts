import { User, type User as UserType } from "@cove/domain";
import { UserRepository } from "@cove/ports";
import { Effect, Layer, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";
import { persistenceError } from "../persistence-error.ts";

const FindUserByEmailRequest = Schema.Struct({
  email: Schema.String,
});

interface FindUserByEmailRequest extends Schema.Schema.Type<typeof FindUserByEmailRequest> {}

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const findByEmail = SqlSchema.findOneOption({
    Request: FindUserByEmailRequest,
    Result: User,
    execute: ({ email }) => sql<UserType>`
      SELECT
        id,
        email,
        display_name AS "displayName"
      FROM users
      WHERE lower(email) = lower(${email})
      LIMIT 1
    `,
  });

  return UserRepository.of({
    findByEmail: Effect.fn("PostgresUserRepository.findByEmail")((email) =>
      findByEmail({ email }).pipe(
        Effect.mapError((cause) => persistenceError("UserRepository.findByEmail", cause)),
      ),
    ),
  });
});

export const PostgresUserRepository = Layer.effect(UserRepository, make);
