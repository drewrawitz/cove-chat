import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";

const TARGET_MIGRATION = "20260723234500_bounded_channel_topic_summaries";
const migrationsDirectory = fileURLToPath(
  new URL("../../../../db/prisma/migrations/", import.meta.url),
);
const POSTGRES_IMAGE = "postgres:18.4-alpine";

let container: StartedPostgreSqlContainer | undefined;
let copiedFile = 0;

const runFile = async (source: string): Promise<void> => {
  if (container === undefined) throw new Error("PostgreSQL test container is not running.");
  const running = container;
  const target = `/tmp/cove-migration-${copiedFile++}.sql`;
  await running.copyFilesToContainer([{ source, target }]);
  const result = await running.exec([
    "psql",
    "-U",
    running.getUsername(),
    "-d",
    running.getDatabase(),
    "-v",
    "ON_ERROR_STOP=1",
    "-f",
    target,
  ]);
  if (result.exitCode !== 0) {
    throw new Error(result.output || `Could not execute ${source}.`);
  }
};

const runSql = async (sql: string): Promise<string> => {
  if (container === undefined) throw new Error("PostgreSQL test container is not running.");
  const running = container;
  const target = `/tmp/cove-test-${copiedFile++}.sql`;
  await running.copyContentToContainer([{ content: sql, target }]);
  const result = await running.exec([
    "psql",
    "-U",
    running.getUsername(),
    "-d",
    running.getDatabase(),
    "-v",
    "ON_ERROR_STOP=1",
    "-At",
    "-f",
    target,
  ]);
  if (result.exitCode !== 0) {
    throw new Error(result.output || "Could not execute migration test SQL.");
  }
  return result.output.trim();
};

describe("bounded Topic summary migration", () => {
  beforeAll(async () => {
    const migrations = (await readdir(migrationsDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && entry.name < TARGET_MIGRATION)
      .map((entry) => entry.name)
      .sort();
    container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
    for (const migration of migrations) {
      await runFile(join(migrationsDirectory, migration, "migration.sql"));
    }
  }, 120_000);

  afterAll(async () => {
    await container?.stop();
  });

  it("rejects oversized content without truncation, then backfills bounded Topic summaries", async () => {
    const multibyteLatestBody = "é".repeat(5000);
    const multibyteTitle = "é".repeat(300);
    const multibytePurpose = "é".repeat(1500);
    await runSql(`
        INSERT INTO users (id, email, display_name)
        VALUES ('migration-user', 'migration@example.test', 'Migration User');
        INSERT INTO workspaces (id, name)
        VALUES ('migration-workspace', 'Migration Workspace');
        INSERT INTO workspace_identities (
          id, workspace_id, account_id, name, avatar_url, role
        )
        VALUES (
          'migration-identity', 'migration-workspace', 'migration-user',
          'Migration User', '/migration.svg', 'owner'
        );
        INSERT INTO channels (
          id, workspace_id, name, purpose, visibility, maintainer_identity_id
        )
        VALUES (
          'migration-channel', 'migration-workspace', 'migration-channel',
          '${multibytePurpose}', 'public', 'migration-identity'
        );
        INSERT INTO topics (
          id, workspace_id, channel_id, title, opened_by_identity_id, created_at
        )
        VALUES
          (
            'active-topic', 'migration-workspace', 'migration-channel',
            '${multibyteTitle}', 'migration-identity', '2026-07-20T10:00:00Z'
          ),
          (
            'deleted-topic', 'migration-workspace', 'migration-channel',
            'Deleted Topic', 'migration-identity', '2026-07-20T11:00:00Z'
          );
        INSERT INTO messages (
          id, workspace_id, topic_id, author_identity_id, body, position, created_at, deleted_at
        )
        VALUES
          (
            'active-opening', 'migration-workspace', 'active-topic',
            'migration-identity', 'Opening', 1, '2026-07-20T10:00:00Z', NULL
          ),
          (
            'active-latest', 'migration-workspace', 'active-topic',
            'migration-identity', '${multibyteLatestBody}', 2, '2026-07-20T12:00:00Z', NULL
          ),
          (
            'deleted-latest', 'migration-workspace', 'deleted-topic',
            'migration-identity', NULL, 1, '2026-07-20T13:00:00Z', '2026-07-20T13:05:00Z'
          );
      `);

    const migration = join(migrationsDirectory, TARGET_MIGRATION, "migration.sql");
    await expect(runFile(migration)).rejects.toThrow(
      "Cannot enforce the 512-byte Topic title limit while oversized titles exist",
    );
    expect(
      await runSql(`
        SELECT concat(
          octet_length(topic.title),
          '|',
          octet_length(channel.purpose)
        )
        FROM topics AS topic
        INNER JOIN channels AS channel
          ON channel.workspace_id = topic.workspace_id
          AND channel.id = topic.channel_id
        WHERE topic.id = 'active-topic';
      `),
    ).toBe("600|3000");

    await runSql(`
      UPDATE topics
      SET title = 'Release readiness'
      WHERE workspace_id = 'migration-workspace'
        AND id = 'active-topic';
      UPDATE channels
      SET purpose = 'Coordinate migration coverage.'
      WHERE workspace_id = 'migration-workspace'
        AND id = 'migration-channel';
    `);
    await runFile(migration);

    const projections = await runSql(`
        SELECT concat_ws(
          '|',
          id,
          message_count,
          latest_message_id,
          coalesce(latest_message_preview, '<null>'),
          latest_message_author_identity_id,
          latest_message_position,
          to_char(latest_message_created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS'),
          coalesce(
            to_char(latest_message_deleted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS'),
            '<null>'
          ),
          to_char(last_activity_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS'),
          coalesce(octet_length(latest_message_preview)::text, '<null>')
        )
        FROM topics
        WHERE workspace_id = 'migration-workspace'
        ORDER BY id;
      `);
    expect(projections.split("\n")).toEqual([
      `active-topic|2|active-latest|${"é".repeat(256)}|migration-identity|2|2026-07-20T12:00:00|<null>|2026-07-20T12:00:00|512`,
      "deleted-topic|1|deleted-latest|<null>|migration-identity|1|2026-07-20T13:00:00|2026-07-20T13:05:00|2026-07-20T13:00:00|<null>",
    ]);
    expect(
      await runSql(`
          SELECT concat(
            octet_length(topic.title),
            '|',
            octet_length(channel.purpose)
          )
          FROM topics AS topic
          INNER JOIN channels AS channel
            ON channel.workspace_id = topic.workspace_id
            AND channel.id = topic.channel_id
          WHERE topic.id = 'active-topic';
        `),
    ).toBe("17|30");

    expect(
      await runSql(`
          SELECT count(*)
          FROM pg_indexes
          WHERE indexname = 'topics_channel_activity_idx';
        `),
    ).toBe("1");
    expect(
      await runSql(`
          SELECT convalidated
          FROM pg_constraint
          WHERE conname = 'messages_body_bytes';
      `),
    ).toBe("f");
    expect(
      await runSql(`
        SELECT count(*)
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('topic_activity_versions', 'topic_archive_cursors');
      `),
    ).toBe("0");
  }, 60_000);
});
