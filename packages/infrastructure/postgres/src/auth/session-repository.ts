import { User, type User as UserType } from "@cove/domain";
import { CsrfTokenValue, SessionRepository, SessionTokenValue } from "@cove/ports";
import { Effect, Layer, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";
import { persistenceError } from "../persistence-error.ts";
import { hashOpaqueToken, makeOpaqueToken } from "./opaque-token.ts";

const FindCurrentUserRequest = Schema.Struct({
  tokenHash: Schema.String,
});

interface FindCurrentUserRequest extends Schema.Schema.Type<typeof FindCurrentUserRequest> {}

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const findCurrentUser = SqlSchema.findOneOption({
    Request: FindCurrentUserRequest,
    Result: User,
    execute: ({ tokenHash }) => sql<UserType>`
      SELECT
        authenticated_user.id,
        authenticated_user.email,
        authenticated_user.display_name AS "displayName"
      FROM sessions AS session
      INNER JOIN users AS authenticated_user
        ON authenticated_user.id = session.user_id
      WHERE session.token_hash = ${tokenHash}
        AND session.expires_at > CURRENT_TIMESTAMP
      LIMIT 1
    `,
  });

  return SessionRepository.of({
    create: Effect.fn("PostgresSessionRepository.create")(function* (userId, expiresAt) {
      const token = makeOpaqueToken((value) => SessionTokenValue.make(value), "SessionToken");
      const csrfToken = makeOpaqueToken((value) => CsrfTokenValue.make(value), "CsrfToken");
      const tokenHash = hashOpaqueToken(token);
      const csrfTokenHash = hashOpaqueToken(csrfToken);

      yield* sql`
        INSERT INTO sessions (token_hash, csrf_token_hash, user_id, expires_at)
        VALUES (${tokenHash}, ${csrfTokenHash}, ${userId}, ${expiresAt})
      `.pipe(Effect.mapError((cause) => persistenceError("SessionRepository.create", cause)));

      return { token, csrfToken, expiresAt };
    }),
    findCurrentUser: Effect.fn("PostgresSessionRepository.findCurrentUser")((token) =>
      findCurrentUser({ tokenHash: hashOpaqueToken(token) }).pipe(
        Effect.mapError((cause) => persistenceError("SessionRepository.findCurrentUser", cause)),
      ),
    ),
    validateCsrf: Effect.fn("PostgresSessionRepository.validateCsrf")(function* (token, csrfToken) {
      const sessions = yield* sql<{ readonly exists: boolean }>`
        SELECT EXISTS (
          SELECT 1
          FROM sessions
          WHERE token_hash = ${hashOpaqueToken(token)}
            AND csrf_token_hash = ${hashOpaqueToken(csrfToken)}
            AND expires_at > CURRENT_TIMESTAMP
        ) AS "exists"
      `.pipe(Effect.mapError((cause) => persistenceError("SessionRepository.validateCsrf", cause)));

      return sessions[0]?.exists ?? false;
    }),
    revoke: Effect.fn("PostgresSessionRepository.revoke")(function* (token, csrfToken) {
      const deleted = yield* sql<{ readonly tokenHash: string }>`
        DELETE FROM sessions
        WHERE token_hash = ${hashOpaqueToken(token)}
          AND csrf_token_hash = ${hashOpaqueToken(csrfToken)}
        RETURNING token_hash AS "tokenHash"
      `.pipe(Effect.mapError((cause) => persistenceError("SessionRepository.revoke", cause)));

      return deleted.length > 0;
    }),
  });
});

export const PostgresSessionRepository = Layer.effect(SessionRepository, make);
