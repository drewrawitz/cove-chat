import { PgClient } from "@effect/sql-pg";
import { Config, Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

const seed = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    INSERT INTO users (id, email, display_name)
    VALUES
      ('demo-alice', 'alice@cove.local', 'Alice Demo'),
      ('demo-bob', 'bob@cove.local', 'Bob Demo')
    ON CONFLICT (id) DO UPDATE
    SET
      email = EXCLUDED.email,
      display_name = EXCLUDED.display_name
  `;
});

const program = Effect.gen(function* () {
  const databaseUrl = yield* Config.redacted("DATABASE_URL");
  yield* seed.pipe(Effect.provide(PgClient.layer({ url: databaseUrl })));
});

await Effect.runPromise(program);
