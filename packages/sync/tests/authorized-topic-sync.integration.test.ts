import { execFile, spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer as createHttpServer, type Server } from "node:http";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { Zero } from "@rocicorp/zero";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { queries, schema } from "../src/index.ts";
import { handleCoveQueryRequest } from "../src/server.ts";

const execFileAsync = promisify(execFile);
const packageDirectory = fileURLToPath(new URL("../", import.meta.url));
const databasePackageDirectory = fileURLToPath(new URL("../../db", import.meta.url));
const prismaExecutable = join(databasePackageDirectory, "node_modules/.bin/prisma");
const zeroCacheExecutable = join(packageDirectory, "node_modules/.bin/zero-cache");

let container: StartedPostgreSqlContainer | undefined;
let pool: Pool | undefined;
let queryServer: Server | undefined;
let zeroCache: ChildProcess | undefined;
let replicaDirectory: string | undefined;
let cacheURL: string | undefined;
const zeroOutput: Array<string> = [];

const allocatePort = () =>
  new Promise<number>((resolve, reject) => {
    const server = createNetServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a Zero integration-test port."));
        return;
      }
      server.close((error) => (error === undefined ? resolve(address.port) : reject(error)));
    });
  });

const waitForServer = async (url: string): Promise<void> => {
  const deadline = Date.now() + 30_000;
  let cause: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
      cause = new Error(`${url} returned ${response.status}.`);
    } catch (error) {
      cause = error;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Zero cache did not become ready.\n${zeroOutput.join("")}`, { cause });
};

const closeServer = (server: Server | undefined) =>
  new Promise<void>((resolve, reject) => {
    if (server === undefined) {
      resolve();
      return;
    }
    server.close((error) => (error === undefined ? resolve() : reject(error)));
  });

const stopProcess = async (child: ChildProcess | undefined): Promise<void> => {
  if (child?.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
  const signal = (value: NodeJS.Signals): void => {
    if (process.platform === "win32") child.kill(value);
    else process.kill(-(child.pid as number), value);
  };
  signal("SIGTERM");
  const deadline = Date.now() + 5_000;
  while (child.exitCode === null && child.signalCode === null && Date.now() < deadline) {
    await delay(25);
  }
  if (child.exitCode === null && child.signalCode === null) {
    signal("SIGKILL");
    const forcedDeadline = Date.now() + 5_000;
    while (child.exitCode === null && child.signalCode === null && Date.now() < forcedDeadline) {
      await delay(25);
    }
    if (child.exitCode === null && child.signalCode === null) {
      throw new Error("Zero cache did not exit after SIGKILL.");
    }
  }
};

const readBody = async (request: import("node:http").IncomingMessage): Promise<string> => {
  const chunks: Array<Buffer> = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
};

const startQueryServer = async (port: number): Promise<Server> => {
  const server = createHttpServer(async (incoming, outgoing) => {
    try {
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (Array.isArray(value)) {
          for (const item of value) headers.append(name, item);
        } else if (value !== undefined) {
          headers.set(name, value);
        }
      }
      const userID = headers.get("authorization")?.replace(/^Bearer /, "");
      if (userID === undefined || userID.length === 0) {
        outgoing.writeHead(401, { "content-type": "application/json" });
        outgoing.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }

      const request = new Request(`http://127.0.0.1:${port}${incoming.url ?? "/"}`, {
        method: incoming.method,
        headers,
        body: await readBody(incoming),
      });
      const response = await handleCoveQueryRequest({ request, userID });
      outgoing.writeHead(200, { "content-type": "application/json" });
      outgoing.end(JSON.stringify(response));
    } catch (error) {
      outgoing.writeHead(500, { "content-type": "application/json" });
      outgoing.end(JSON.stringify({ error: String(error) }));
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return server;
};

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:18.4-alpine")
    .withCommand(["postgres", "-c", "wal_level=logical"])
    .start();
  const databaseURL = container.getConnectionUri();
  await execFileAsync(prismaExecutable, ["migrate", "deploy"], {
    cwd: databasePackageDirectory,
    env: { ...process.env, DATABASE_URL: databaseURL },
  });

  pool = new Pool({ connectionString: databaseURL });
  await pool.query(`
    INSERT INTO users (id, email, display_name)
    VALUES
      ('sync-alice', 'sync-alice@cove.local', 'Sync Alice'),
      ('sync-bob', 'sync-bob@cove.local', 'Sync Bob');

    INSERT INTO workspaces (id, name)
    VALUES
      ('sync-workspace', 'Sync Workspace'),
      ('other-workspace', 'Other Workspace');

    INSERT INTO workspace_identities (
      id,
      workspace_id,
      account_id,
      name,
      avatar_url,
      role
    )
    VALUES
      (
        'sync-alice-identity',
        'sync-workspace',
        'sync-alice',
        'Alice in Sync',
        '/avatars/alice.svg',
        'member'
      ),
      (
        'sync-bob-owner',
        'sync-workspace',
        'sync-bob',
        'Bob the Workspace Owner',
        '/avatars/bob.svg',
        'owner'
      ),
      (
        'other-alice-identity',
        'other-workspace',
        'sync-alice',
        'Alice Elsewhere',
        '/avatars/alice.svg',
        'member'
      );

    INSERT INTO channels (
      id,
      workspace_id,
      name,
      purpose,
      visibility,
      maintainer_identity_id
    )
    VALUES
      (
        'private-channel',
        'sync-workspace',
        'Private Channel',
        'Private synchronization authorization.',
        'private',
        'sync-alice-identity'
      ),
      (
        'other-public-channel',
        'other-workspace',
        'Other Public Channel',
        'Cross-Workspace synchronization authorization.',
        'public',
        'other-alice-identity'
      );

    INSERT INTO channel_memberships (workspace_id, channel_id, identity_id)
    VALUES ('sync-workspace', 'private-channel', 'sync-alice-identity');

    INSERT INTO topics (
      id,
      workspace_id,
      channel_id,
      title,
      opened_by_identity_id,
      message_count,
      latest_message_id,
      latest_message_preview,
      latest_message_author_identity_id,
      latest_message_position,
      latest_message_created_at,
      latest_message_edited_at,
      latest_message_deleted_at,
      last_activity_at
    )
    VALUES
      (
        'private-topic',
        'sync-workspace',
        'private-channel',
        'Private synchronization contract',
        'sync-alice-identity',
        1,
        'private-message',
        'Only explicit Channel members can synchronize this Message.',
        'sync-alice-identity',
        1,
        now(),
        NULL,
        NULL,
        now()
      ),
      (
        'other-topic',
        'other-workspace',
        'other-public-channel',
        'Cross-Workspace synchronization contract',
        'other-alice-identity',
        1,
        'other-message',
        'Cross-Workspace Message.',
        'other-alice-identity',
        1,
        now(),
        NULL,
        NULL,
        now()
      );

    INSERT INTO messages (
      id,
      workspace_id,
      topic_id,
      author_identity_id,
      body,
      position
    )
    VALUES
      (
        'private-message',
        'sync-workspace',
        'private-topic',
        'sync-alice-identity',
        'Only explicit Channel members can synchronize this Message.',
        1
      ),
      (
        'other-message',
        'other-workspace',
        'other-topic',
        'other-alice-identity',
        'Cross-Workspace Message.',
        1
      );

    INSERT INTO topics (
      id,
      workspace_id,
      channel_id,
      title,
      opened_by_identity_id,
      message_count,
      latest_message_id,
      latest_message_preview,
      latest_message_author_identity_id,
      latest_message_position,
      latest_message_created_at,
      latest_message_edited_at,
      latest_message_deleted_at,
      last_activity_at
    )
    SELECT
      'bounded-topic-' || lpad(number::text, 2, '0'),
      'sync-workspace',
      'private-channel',
      'Bounded Topic ' || lpad(number::text, 2, '0'),
      'sync-alice-identity',
      1,
      'bounded-message-' || lpad(number::text, 2, '0'),
      'Bounded summary',
      'sync-alice-identity',
      1,
      now() - make_interval(secs => number),
      NULL,
      NULL,
      now() - make_interval(secs => number)
    FROM generate_series(1, 51) AS number;

    INSERT INTO messages (
      id,
      workspace_id,
      topic_id,
      author_identity_id,
      body,
      position
    )
    SELECT
      'bounded-message-' || lpad(number::text, 2, '0'),
      'sync-workspace',
      'bounded-topic-' || lpad(number::text, 2, '0'),
      'sync-alice-identity',
      'Only one Message belongs in each synchronized summary.',
      1
    FROM generate_series(1, 51) AS number;

    INSERT INTO topics (
      id,
      workspace_id,
      channel_id,
      title,
      opened_by_identity_id,
      message_count,
      latest_message_id,
      latest_message_preview,
      latest_message_author_identity_id,
      latest_message_position,
      latest_message_created_at,
      latest_message_edited_at,
      latest_message_deleted_at,
      last_activity_at
    )
    SELECT
      'page-topic-' || reply_count,
      'sync-workspace',
      'private-channel',
      'Reply fixture ' || reply_count,
      'sync-alice-identity',
      reply_count + 1,
      CASE
        WHEN reply_count = 0 THEN 'page-opening-' || reply_count
        ELSE 'page-reply-' || reply_count || '-' || reply_count
      END,
      'Latest bounded Message',
      'sync-alice-identity',
      reply_count + 1,
      now(),
      NULL,
      NULL,
      now()
    FROM (VALUES (0), (100), (101), (1000)) AS fixture(reply_count);

    INSERT INTO messages (
      id,
      workspace_id,
      topic_id,
      author_identity_id,
      body,
      position
    )
    SELECT
      'page-opening-' || reply_count,
      'sync-workspace',
      'page-topic-' || reply_count,
      'sync-alice-identity',
      'Opening Brief for ' || reply_count || ' Replies.',
      1
    FROM (VALUES (0), (100), (101), (1000)) AS fixture(reply_count);

    INSERT INTO messages (
      id,
      workspace_id,
      topic_id,
      author_identity_id,
      body,
      position
    )
    SELECT
      'page-reply-' || reply_count || '-' || reply_number,
      'sync-workspace',
      'page-topic-' || reply_count,
      'sync-alice-identity',
      'Reply ' || reply_number || ' of ' || reply_count,
      reply_number + 1
    FROM (VALUES (100), (101), (1000)) AS fixture(reply_count)
    CROSS JOIN LATERAL generate_series(1, reply_count) AS reply_number;
  `);

  const queryPort = await allocatePort();
  let zeroPort = await allocatePort();
  while (zeroPort === queryPort) zeroPort = await allocatePort();
  let changeStreamerPort = await allocatePort();
  while (changeStreamerPort === queryPort || changeStreamerPort === zeroPort) {
    changeStreamerPort = await allocatePort();
  }

  queryServer = await startQueryServer(queryPort);
  replicaDirectory = await mkdtemp(join(tmpdir(), "cove-zero-authorization-"));
  cacheURL = `http://127.0.0.1:${zeroPort}`;
  zeroCache = spawn(zeroCacheExecutable, [], {
    cwd: packageDirectory,
    detached: process.platform !== "win32",
    env: {
      ...process.env,
      NODE_ENV: "development",
      ZERO_APP_ID: "cove_sync_test",
      ZERO_APP_PUBLICATIONS: "cove_zero_data",
      ZERO_CHANGE_MAX_CONNS: "2",
      ZERO_CHANGE_STREAMER_PORT: String(changeStreamerPort),
      ZERO_CVR_MAX_CONNS: "2",
      ZERO_ENABLE_CRUD_MUTATIONS: "false",
      ZERO_NUM_SYNC_WORKERS: "1",
      ZERO_PORT: String(zeroPort),
      ZERO_QUERY_ALLOWED_CLIENT_HEADERS: "authorization",
      ZERO_QUERY_URL: `http://127.0.0.1:${queryPort}/query`,
      ZERO_REPLICA_FILE: join(replicaDirectory, "zero.db"),
      ZERO_UPSTREAM_DB: databaseURL,
      ZERO_UPSTREAM_MAX_CONNS: "2",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  zeroCache.stdout?.setEncoding("utf8");
  zeroCache.stderr?.setEncoding("utf8");
  zeroCache.stdout?.on("data", (chunk: string) => zeroOutput.push(chunk));
  zeroCache.stderr?.on("data", (chunk: string) => zeroOutput.push(chunk));
  await waitForServer(cacheURL);
}, 120_000);

afterAll(async () => {
  await stopProcess(zeroCache);
  await closeServer(queryServer);
  await pool?.end();
  await container?.stop();
  if (replicaDirectory !== undefined) {
    await rm(replicaDirectory, { recursive: true, force: true });
  }
});

describe("authorized Topic synchronization", () => {
  it("never synchronizes private or cross-Workspace rows to an unauthorized client", async () => {
    if (cacheURL === undefined) throw new Error("Zero cache is unavailable.");
    const alice = new Zero({
      cacheURL,
      context: { userID: "sync-alice" },
      kvStore: "mem",
      queryHeaders: { authorization: "Bearer sync-alice" },
      schema,
      userID: "sync-alice",
    });
    const bob = new Zero({
      cacheURL,
      context: { userID: "sync-bob" },
      kvStore: "mem",
      queryHeaders: { authorization: "Bearer sync-bob" },
      schema,
      userID: "sync-bob",
    });

    try {
      const privateArguments = {
        workspaceId: "sync-workspace",
        channelId: "private-channel",
        topicId: "private-topic",
      };
      const privateForMember = await alice.run(queries.topics.byId(privateArguments), {
        type: "complete",
      });
      const privateForOwnerWithoutMembership = await bob.run(
        queries.topics.byId(privateArguments),
        { type: "complete" },
      );
      const crossWorkspaceForUnknownActor = await bob.run(
        queries.topics.byId({
          workspaceId: "other-workspace",
          channelId: "other-public-channel",
          topicId: "other-topic",
        }),
        { type: "complete" },
      );
      const boundedForMember = await alice.run(
        queries.topics.inChannel({
          workspaceId: "sync-workspace",
          channelId: "private-channel",
          limit: 50,
        }),
        { type: "complete" },
      );
      const boundedForOwnerWithoutMembership = await bob.run(
        queries.topics.inChannel({
          workspaceId: "sync-workspace",
          channelId: "private-channel",
          limit: 50,
        }),
        { type: "complete" },
      );
      const openingBriefForMember = await alice.run(
        queries.messages.openingBrief(privateArguments),
        { type: "complete" },
      );
      const openingBriefForOwnerWithoutMembership = await bob.run(
        queries.messages.openingBrief(privateArguments),
        { type: "complete" },
      );
      const repliesForOwnerWithoutMembership = await bob.run(
        queries.messages.replies(privateArguments),
        { type: "complete" },
      );
      expect(privateForMember?.title).toBe("Private synchronization contract");
      expect(privateForMember).not.toHaveProperty("messages");
      expect(privateForOwnerWithoutMembership).toBeUndefined();
      expect(crossWorkspaceForUnknownActor).toBeUndefined();
      expect(openingBriefForMember?.position).toBe(1);
      expect(openingBriefForOwnerWithoutMembership).toBeUndefined();
      expect(repliesForOwnerWithoutMembership).toEqual([]);
      expect(boundedForMember).toHaveLength(50);
      expect(
        boundedForMember.every(
          (topic) =>
            !("messages" in topic) && topic.latestMessageAuthor?.id === "sync-alice-identity",
        ),
      ).toBe(true);
      expect(boundedForOwnerWithoutMembership).toEqual([]);
    } finally {
      await Promise.all([alice.close(), bob.close()]);
    }
  }, 120_000);

  it.each([0, 100, 101, 1_000])(
    "loads all %i Replies through stable authorized 100-row pages",
    async (replyCount) => {
      if (cacheURL === undefined) throw new Error("Zero cache is unavailable.");
      const alice = new Zero({
        cacheURL,
        context: { userID: "sync-alice" },
        kvStore: "mem",
        queryHeaders: { authorization: "Bearer sync-alice" },
        schema,
        userID: `sync-alice-pages-${replyCount}`,
      });
      const scope = {
        workspaceId: "sync-workspace",
        channelId: "private-channel",
        topicId: `page-topic-${replyCount}`,
      };

      try {
        const topic = await alice.run(queries.topics.byId(scope), { type: "complete" });
        const openingBrief = await alice.run(queries.messages.openingBrief(scope), {
          type: "complete",
        });
        const initial = await alice.run(queries.messages.replies(scope), { type: "complete" });
        const loaded = new Map(initial.map((message) => [message.id, message]));

        expect(topic?.messageCount).toBe(replyCount + 1);
        expect(topic).not.toHaveProperty("messages");
        expect(openingBrief?.position).toBe(1);
        expect(initial).toHaveLength(Math.min(100, replyCount));
        expect(initial.every(({ position }) => position > 1)).toBe(true);
        expect(initial.map(({ position }) => position)).toEqual(
          initial.map(({ position }) => position).sort((left, right) => right - left),
        );

        while (loaded.size < replyCount) {
          const beforePosition = Math.min(...[...loaded.values()].map(({ position }) => position));
          const page = await alice.run(queries.messages.replies({ ...scope, beforePosition }), {
            type: "complete",
          });
          const repeated = await alice.run(queries.messages.replies({ ...scope, beforePosition }), {
            type: "complete",
          });

          expect(page).toHaveLength(Math.min(100, replyCount - loaded.size));
          expect(page.map(({ id }) => id)).toEqual(repeated.map(({ id }) => id));
          expect(page.every(({ position }) => position > 1 && position < beforePosition)).toBe(
            true,
          );
          for (const message of page) loaded.set(message.id, message);
        }

        expect(
          [...loaded.values()]
            .sort((left, right) => left.position - right.position)
            .map(({ position }) => position),
        ).toEqual(Array.from({ length: replyCount }, (_, index) => index + 2));
      } finally {
        await alice.close();
      }
    },
    120_000,
  );
});
