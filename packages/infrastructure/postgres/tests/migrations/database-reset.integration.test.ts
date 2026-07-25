import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";

const execFileAsync = promisify(execFile);
const workspaceDirectory = fileURLToPath(new URL("../../../../../", import.meta.url));
const POSTGRES_IMAGE = "postgres:18.4-alpine";

let container: StartedPostgreSqlContainer | undefined;
let copiedFile = 0;

const runSql = async (sql: string, database?: string): Promise<string> => {
  if (container === undefined) throw new Error("PostgreSQL test container is not running.");
  const running = container;
  const target = `/tmp/cove-reset-test-${copiedFile++}.sql`;
  await running.copyContentToContainer([{ content: sql, target }]);
  const result = await running.exec([
    "psql",
    "-U",
    running.getUsername(),
    "-d",
    database ?? running.getDatabase(),
    "-v",
    "ON_ERROR_STOP=1",
    "-At",
    "-f",
    target,
  ]);
  if (result.exitCode !== 0) {
    throw new Error(result.output || "Could not execute database reset test SQL.");
  }
  return result.output.trim();
};

const resetDatabase = async (): Promise<void> => {
  if (container === undefined) throw new Error("PostgreSQL test container is not running.");
  await execFileAsync("vp", ["run", "@cove/db#migrate:reset"], {
    cwd: workspaceDirectory,
    env: {
      ...process.env,
      DATABASE_URL: container.getConnectionUri(),
    },
  });
};

describe("local database reset", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer(POSTGRES_IMAGE)
      .withCommand(["postgres", "-c", "wal_level=logical"])
      .start();
  }, 120_000);

  afterAll(async () => {
    await container?.stop();
  });

  it("removes stale Zero state before replaying migrations", async () => {
    await resetDatabase();
    await runSql("CREATE DATABASE cove_reset_neighbor;");
    await runSql(
      "SELECT pg_create_logical_replication_slot('cove_0_neighbor', 'pgoutput');",
      "cove_reset_neighbor",
    );
    await runSql(`
      CREATE SCHEMA "cove";
      CREATE SCHEMA "cove_0";
      CREATE SCHEMA "cove_0/cdc";
      CREATE SCHEMA "cove_0/cvr";
      CREATE PUBLICATION "_cove_public_0";
      CREATE PUBLICATION "_cove_metadata_0";
      SELECT pg_create_logical_replication_slot('cove_0_a', 'pgoutput');
    `);

    await resetDatabase();

    expect(
      await runSql(`
        SELECT count(*)
        FROM pg_replication_slots
        WHERE slot_name = 'cove_0_a';
      `),
    ).toBe("0");
    expect(
      await runSql(`
        SELECT count(*)
        FROM pg_namespace
        WHERE nspname IN ('cove', 'cove_0', 'cove_0/cdc', 'cove_0/cvr');
      `),
    ).toBe("0");
    expect(
      await runSql(`
        SELECT count(*)
        FROM pg_publication
        WHERE pubname IN ('_cove_public_0', '_cove_metadata_0');
      `),
    ).toBe("0");
    expect(
      await runSql(`
        SELECT count(*)
        FROM pg_publication_tables
        WHERE pubname = 'cove_zero_data';
      `),
    ).toBe("6");
    expect(
      await runSql(`
        SELECT count(*)
        FROM pg_replication_slots
        WHERE slot_name = 'cove_0_neighbor';
      `),
    ).toBe("1");
  }, 120_000);

  it("refuses to reset while Zero is connected", async () => {
    if (container === undefined) throw new Error("PostgreSQL test container is not running.");
    const zeroConnection = new Client({
      connectionString: container.getConnectionUri(),
      application_name: "zero-change-streamer",
    });
    await zeroConnection.connect();

    try {
      await expect(resetDatabase()).rejects.toThrow("Cannot reset Cove while Zero sync is running");
      expect(
        await runSql(`
          SELECT count(*)
          FROM pg_publication_tables
          WHERE pubname = 'cove_zero_data';
        `),
      ).toBe("6");
    } finally {
      await zeroConnection.end();
    }
  }, 120_000);
});
