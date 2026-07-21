import { PgClient } from "@effect/sql-pg";
import { Config, Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

const seed = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    INSERT INTO users (id, email, display_name)
    VALUES
      ('demo-alice', 'alice@cove.local', 'Alice Demo'),
      ('demo-bob', 'bob@cove.local', 'Bob Demo'),
      ('demo-carol', 'carol@cove.local', 'Carol Demo')
    ON CONFLICT (id) DO UPDATE
    SET
      email = EXCLUDED.email,
      display_name = EXCLUDED.display_name
  `;
  yield* sql`
    INSERT INTO workspaces (id, name)
    VALUES ('demo-workspace', 'Cove Demo')
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
  `;
  yield* sql`
    INSERT INTO workspace_identities (id, workspace_id, account_id, name, avatar_url, role)
    VALUES
      ('demo-alice-identity', 'demo-workspace', 'demo-alice', 'Alice in Cove', '/avatars/alice.svg', 'member'),
      ('demo-bob-identity', 'demo-workspace', 'demo-bob', 'Bob in Cove', '/avatars/bob.svg', 'owner')
    ON CONFLICT (workspace_id, id) DO UPDATE
    SET
      account_id = EXCLUDED.account_id,
      name = EXCLUDED.name,
      role = EXCLUDED.role,
      avatar_url = EXCLUDED.avatar_url,
      membership_ended_at = NULL
  `;
});

const program = Effect.gen(function* () {
  const databaseUrl = yield* Config.redacted("DATABASE_URL");
  yield* seed.pipe(Effect.provide(PgClient.layer({ url: databaseUrl })));
});

await Effect.runPromise(program);
