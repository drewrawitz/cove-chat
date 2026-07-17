import { User, type User as UserType } from "@cove/domain";
import { MagicLinkRepository, MagicLinkTokenValue } from "@cove/ports";
import { Effect, Layer, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";
import { persistenceError } from "../persistence-error.ts";
import { hashOpaqueToken, makeOpaqueToken } from "./opaque-token.ts";

const ConsumeMagicLinkRequest = Schema.Struct({
  tokenHash: Schema.String,
});

interface ConsumeMagicLinkRequest extends Schema.Schema.Type<typeof ConsumeMagicLinkRequest> {}

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const consume = SqlSchema.findOneOption({
    Request: ConsumeMagicLinkRequest,
    Result: User,
    execute: ({ tokenHash }) => sql<UserType>`
      UPDATE magic_links AS magic_link
      SET consumed_at = CURRENT_TIMESTAMP
      FROM users AS authenticated_user
      WHERE magic_link.token_hash = ${tokenHash}
        AND magic_link.user_id = authenticated_user.id
        AND magic_link.consumed_at IS NULL
        AND magic_link.expires_at > CURRENT_TIMESTAMP
      RETURNING
        authenticated_user.id,
        authenticated_user.email,
        authenticated_user.display_name AS "displayName"
    `,
  });

  return MagicLinkRepository.of({
    issue: Effect.fn("PostgresMagicLinkRepository.issue")(function* (userId, expiresAt) {
      const token = makeOpaqueToken((value) => MagicLinkTokenValue.make(value), "MagicLinkToken");
      const tokenHash = hashOpaqueToken(token);

      yield* sql`
        INSERT INTO magic_links (token_hash, user_id, expires_at)
        VALUES (${tokenHash}, ${userId}, ${expiresAt})
      `.pipe(Effect.mapError((cause) => persistenceError("MagicLinkRepository.issue", cause)));

      return token;
    }),
    consume: Effect.fn("PostgresMagicLinkRepository.consume")((token) =>
      consume({ tokenHash: hashOpaqueToken(token) }).pipe(
        Effect.mapError((cause) => persistenceError("MagicLinkRepository.consume", cause)),
      ),
    ),
  });
});

export const PostgresMagicLinkRepository = Layer.effect(MagicLinkRepository, make);
