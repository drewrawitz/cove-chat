import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";

const execFileAsync = promisify(execFile);
const databasePackageDirectory = fileURLToPath(new URL("../../../../db", import.meta.url));
const prismaExecutable = fileURLToPath(
  new URL("../../../../db/node_modules/.bin/prisma", import.meta.url),
);

let container: StartedPostgreSqlContainer | undefined;
let client: Client | undefined;

const runModerateSeed = async (databaseUrl: string): Promise<void> => {
  try {
    await execFileAsync(process.execPath, ["prisma/seed-moderate.ts"], {
      cwd: databasePackageDirectory,
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });
  } catch (cause) {
    const failure = cause as { readonly stderr?: string; readonly stdout?: string };
    throw new Error(
      [
        "Moderate fixture seed failed.",
        `stdout:\n${failure.stdout ?? ""}`,
        `stderr:\n${failure.stderr ?? ""}`,
      ].join("\n"),
      { cause },
    );
  }
};

const readFixtureShape = async () => {
  if (client === undefined) throw new Error("Moderate fixture database is unavailable.");

  const result = await client.query<{
    channels: number;
    busiest_channel_topics: number;
    messages: number;
    long_topic_replies: number;
    long_topic_latest_message: string;
    last_topic_latest_message: string;
  }>(`
    SELECT
      (SELECT count(*)::int FROM channels WHERE workspace_id = 'demo-workspace') AS channels,
      (
        SELECT count(*)::int
        FROM topics
        WHERE workspace_id = 'demo-workspace'
          AND channel_id = 'general'
      ) AS busiest_channel_topics,
      (SELECT count(*)::int FROM messages WHERE workspace_id = 'demo-workspace') AS messages,
      (
        SELECT count(*)::int
        FROM messages
        WHERE workspace_id = 'demo-workspace'
          AND topic_id = 'moderate-topic-0001'
          AND position > 1
      ) AS long_topic_replies,
      (
        SELECT latest_message_id
        FROM topics
        WHERE workspace_id = 'demo-workspace'
          AND id = 'moderate-topic-0001'
      ) AS long_topic_latest_message,
      (
        SELECT latest_message_id
        FROM topics
        WHERE workspace_id = 'demo-workspace'
          AND id = 'moderate-topic-0500'
      ) AS last_topic_latest_message
  `);

  return result.rows[0];
};

describe("moderate growth-readiness fixture", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18.4-alpine")
      .withCommand(["postgres", "-c", "wal_level=logical"])
      .start();
    const databaseUrl = container.getConnectionUri();
    await execFileAsync(prismaExecutable, ["migrate", "deploy"], {
      cwd: databasePackageDirectory,
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });
    await runModerateSeed(databaseUrl);
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
  }, 120_000);

  afterAll(async () => {
    await client?.end();
    await container?.stop();
  });

  it("creates the exact deterministic shape without duplicating it on a repeated run", async () => {
    if (container === undefined) throw new Error("Moderate fixture database is unavailable.");

    const firstShape = await readFixtureShape();
    await runModerateSeed(container.getConnectionUri());
    const repeatedShape = await readFixtureShape();

    const expectedShape = {
      channels: 20,
      busiest_channel_topics: 500,
      messages: 10_000,
      long_topic_replies: 1_000,
      long_topic_latest_message: "moderate-message-0001-1001",
      last_topic_latest_message: "moderate-message-0500-0018",
    };
    expect(firstShape).toEqual(expectedShape);
    expect(repeatedShape).toEqual(expectedShape);
  }, 120_000);
});
