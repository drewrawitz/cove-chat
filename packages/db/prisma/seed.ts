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
  yield* sql`
    INSERT INTO workspaces (id, name)
    VALUES ('demo-workspace', 'Cove Demo')
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
  `;
  yield* sql`
    INSERT INTO workspace_identities (id, workspace_id, account_id, name, avatar_url)
    VALUES
      ('demo-alice-identity', 'demo-workspace', 'demo-alice', 'Alice in Cove', '/avatars/alice.svg'),
      ('demo-bob-identity', 'demo-workspace', 'demo-bob', 'Bob in Cove', '/avatars/bob.svg')
    ON CONFLICT (workspace_id, id) DO UPDATE
    SET
      account_id = EXCLUDED.account_id,
      name = EXCLUDED.name,
      avatar_url = EXCLUDED.avatar_url
  `;
  yield* sql`
    INSERT INTO workspace_memberships (workspace_id, identity_id, role)
    VALUES
      ('demo-workspace', 'demo-alice-identity', 'member'),
      ('demo-workspace', 'demo-bob-identity', 'owner')
    ON CONFLICT (workspace_id, identity_id) DO UPDATE
    SET
      role = EXCLUDED.role,
      ended_at = NULL
  `;
});

const program = Effect.gen(function* () {
  const databaseUrl = yield* Config.redacted("DATABASE_URL");
  yield* seed.pipe(Effect.provide(PgClient.layer({ url: databaseUrl })));
});

await Effect.runPromise(program);
