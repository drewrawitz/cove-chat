import { execFile, spawn, type ChildProcess } from "node:child_process";
import { lstat, mkdtemp, readdir, realpath, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { chromium, type Browser, type Page } from "playwright";
import { Context, Effect, Layer, Schedule } from "effect";

const execFileAsync = promisify(execFile);
const repositoryDirectory = fileURLToPath(new URL("../../../../", import.meta.url));
const acceptanceDirectory = join(repositoryDirectory, "apps/acceptance");
const dbPackageDirectory = join(repositoryDirectory, "packages/db");
const prismaExecutable = join(dbPackageDirectory, "node_modules/.bin/prisma");
const zeroCacheExecutable = join(acceptanceDirectory, "node_modules/.bin/zero-cache-dev");
const webDirectory = join(repositoryDirectory, "apps/web");
const webExecutable = join(webDirectory, "node_modules/.bin/vp");
const expectedZeroReplicaFiles = new Set(
  ["zero.db", "zero.db-serving-copy"].flatMap((file) =>
    ["", "-wal", "-wal2", "-shm", "-journal"].map((suffix) => `${file}${suffix}`),
  ),
);
const processOutputTailLength = 2_000;

interface ProcessSpec {
  readonly args: ReadonlyArray<string>;
  readonly command: string;
  readonly options: { readonly cwd: string; readonly env: NodeJS.ProcessEnv };
  readonly output: Array<string>;
}

const spawnProcess = ({ args, command, options, output }: ProcessSpec): ChildProcess => {
  const child = spawn(command, [...args], {
    cwd: options.cwd,
    detached: process.platform !== "win32",
    env: options.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => output.push(chunk));
  child.stderr?.on("data", (chunk: string) => output.push(chunk));
  return child;
};

const allocatePort = Effect.fn("BrowserAcceptance.allocatePort")(() =>
  Effect.tryPromise({
    try: () =>
      new Promise<number>((resolve, reject) => {
        const server = createServer();
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
          const address = server.address();
          if (address === null || typeof address === "string") {
            server.close();
            reject(new Error("Could not allocate an acceptance-test port."));
            return;
          }
          server.close((error) => (error === undefined ? resolve(address.port) : reject(error)));
        });
      }),
    catch: (cause) => new Error("Could not allocate an acceptance-test port.", { cause }),
  }),
);

const stopProcess = Effect.fn("BrowserAcceptance.stopProcess")((child: ChildProcess) =>
  Effect.promise(
    () =>
      new Promise<void>((resolve) => {
        const killProcessTree = async (signal: NodeJS.Signals): Promise<void> => {
          if (child.pid === undefined) return;

          try {
            if (process.platform === "win32") {
              await execFileAsync("taskkill", [
                "/PID",
                String(child.pid),
                "/T",
                ...(signal === "SIGKILL" ? ["/F"] : []),
              ]);
            } else {
              process.kill(-child.pid, signal);
            }
          } catch {
            // The process group has already exited.
          }
        };

        const streamsClosed =
          (child.stdout === null || child.stdout.closed) &&
          (child.stderr === null || child.stderr.closed);
        if ((child.exitCode !== null || child.signalCode !== null) && streamsClosed) {
          void killProcessTree("SIGTERM").then(resolve);
          return;
        }

        let treeTermination = Promise.resolve();
        const forceStop = setTimeout(() => {
          treeTermination = killProcessTree("SIGKILL");
        }, 5_000);
        child.once("close", () => {
          clearTimeout(forceStop);
          void treeTermination.then(resolve);
        });
        treeTermination = killProcessTree("SIGTERM");
      }),
  ),
);

const startProcess = Effect.fn("BrowserAcceptance.startProcess")((spec: ProcessSpec) =>
  Effect.acquireRelease(
    Effect.sync(() => spawnProcess(spec)),
    stopProcess,
  ),
);

interface RestartableProcess {
  readonly start: () => Promise<void>;
  readonly stop: () => Promise<void>;
}

const startRestartableProcess = Effect.fn("BrowserAcceptance.startRestartableProcess")(
  (spec: ProcessSpec) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        let child: ChildProcess | undefined;
        const manager: RestartableProcess = {
          start: async () => {
            if (child !== undefined) throw new Error("Process is already running.");
            child = spawnProcess(spec);
          },
          stop: async () => {
            const running = child;
            child = undefined;
            if (running !== undefined) await Effect.runPromise(stopProcess(running));
          },
        };
        return manager;
      }).pipe(Effect.tap((manager) => Effect.promise(manager.start))),
      (manager) => Effect.promise(manager.stop),
    ),
);

const startDatabase = Effect.fn("BrowserAcceptance.startDatabase")(() =>
  Effect.acquireRelease(
    Effect.tryPromise({
      try: () =>
        new PostgreSqlContainer("postgres:18.4-alpine")
          .withCommand(["postgres", "-c", "wal_level=logical"])
          .start(),
      catch: (cause) => new Error("Could not start acceptance PostgreSQL.", { cause }),
    }),
    (running) => Effect.promise(() => running.stop()),
  ),
);

const makeZeroReplicaDirectory = Effect.fn("BrowserAcceptance.makeZeroReplicaDirectory")(() =>
  Effect.acquireRelease(
    Effect.tryPromise({
      try: () => mkdtemp(join(tmpdir(), "cove-zero-acceptance-")),
      catch: (cause) => new Error("Could not create the Zero replica directory.", { cause }),
    }),
    (directory) => Effect.promise(() => rm(directory, { recursive: true, force: true })),
  ),
);

const prepareDatabase = Effect.fn("BrowserAcceptance.prepareDatabase")(
  (databaseUrl: string, moderateFixture: boolean) =>
    Effect.tryPromise({
      try: async () => {
        const env = { ...process.env, DATABASE_URL: databaseUrl };
        await execFileAsync(prismaExecutable, ["migrate", "deploy"], {
          cwd: dbPackageDirectory,
          env,
        });
        if (moderateFixture) {
          await execFileAsync(process.execPath, ["prisma/seed-moderate.ts"], {
            cwd: dbPackageDirectory,
            env,
          });
          return;
        }
        await execFileAsync(prismaExecutable, ["db", "seed"], {
          cwd: dbPackageDirectory,
          env,
        });
      },
      catch: (cause) => new Error("Could not prepare the acceptance database.", { cause }),
    }),
);

const removeConfiguredZeroReplica = Effect.fn("BrowserAcceptance.removeConfiguredZeroReplica")(
  (replicaDirectory: string, replicaFile: string) =>
    Effect.tryPromise({
      try: async () => {
        const [configuredDirectory, targetDirectory, configuredFile, directoryEntries] =
          await Promise.all([
            realpath(replicaDirectory),
            realpath(dirname(replicaFile)),
            lstat(replicaFile),
            readdir(replicaDirectory),
          ]);
        if (
          configuredDirectory !== targetDirectory ||
          basename(replicaFile) !== "zero.db" ||
          configuredFile.isSymbolicLink() ||
          !configuredFile.isFile()
        ) {
          throw new Error("Configured Zero replica target is not the expected regular file.");
        }

        const replicaFiles = await Promise.all(
          directoryEntries
            .filter((entry) => expectedZeroReplicaFiles.has(entry))
            .map(async (entry) => {
              const candidate = join(configuredDirectory, entry);
              const file = await lstat(candidate);
              if (
                dirname(candidate) !== configuredDirectory ||
                file.isSymbolicLink() ||
                !file.isFile()
              ) {
                throw new Error(`Zero replica companion ${entry} is not an expected regular file.`);
              }
              return { candidate, size: file.size };
            }),
        );
        const replicaBytes = replicaFiles.reduce((total, file) => total + file.size, 0);
        await Promise.all(replicaFiles.map(({ candidate }) => rm(candidate)));
        return { replicaBytes };
      },
      catch: (cause) =>
        new Error("Could not safely remove the configured Zero replica.", { cause }),
    }),
);

const launchBrowser = Effect.fn("BrowserAcceptance.launchBrowser")(() =>
  Effect.acquireRelease(
    Effect.tryPromise({
      try: () => chromium.launch({ headless: true }),
      catch: (cause) => new Error("Could not launch Chromium.", { cause }),
    }),
    (running) => Effect.promise(() => running.close()),
  ),
);

const openPage = Effect.fn("BrowserAcceptance.openPage")(function* (browser: Browser) {
  const context = yield* Effect.acquireRelease(
    Effect.promise(() => browser.newContext()),
    (running) => Effect.promise(() => running.close()),
  );
  return yield* Effect.promise(() => context.newPage());
});

const waitForServer = Effect.fn("BrowserAcceptance.waitForServer")(
  (url: string, processOutput: ReadonlyArray<string>) =>
    Effect.tryPromise({
      try: async () => {
        const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
        if (!response.ok) throw new Error(`${url} returned ${response.status}.`);
      },
      catch: (cause) => new Error(`Waiting for ${url} failed.`, { cause }),
    }).pipe(
      Effect.retry(Schedule.spaced("100 millis")),
      Effect.timeout("15 seconds"),
      Effect.mapError((cause) => {
        const outputLineCount = processOutput.reduce(
          (total, chunk) => total + chunk.split("\n").length - 1,
          0,
        );
        const outputTail = processOutput
          .join("")
          .slice(-processOutputTailLength * 2)
          .replaceAll(String.fromCharCode(27), "")
          .replace(/("(?:body|draft|email|message|token|userID)"\s*:\s*")[^"]*"/gi, '$1[redacted]"')
          .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
          .replace(/([?&](?:token|code)=)[^&\s]+/gi, "$1[redacted]")
          .slice(-processOutputTailLength)
          .trim();
        const outputContext =
          outputTail === "" ? "" : `\nTruncated process-output tail:\n${outputTail}`;
        return new Error(
          `Waiting for ${new URL(url).origin} failed after ${outputLineCount} process-output lines.${outputContext}`,
          { cause },
        );
      }),
    ),
);

export interface BrowserAcceptanceService {
  readonly browser: Browser;
  readonly page: Page;
  readonly webUrl: string;
  readonly zeroUrl: string;
  readonly makeWorkspaceInvitationResendable: (inviteeEmail: string) => Effect.Effect<void, Error>;
  readonly restartZero: () => Effect.Effect<{ readonly rebuildMs: number }, Error>;
  readonly stopAndRemoveZeroReplica: () => Effect.Effect<{ readonly replicaBytes: number }, Error>;
  readonly takeMagicLink: () => Effect.Effect<string, Error>;
  readonly takeWorkspaceInvitationLink: () => Effect.Effect<string, Error>;
}

export class BrowserAcceptance extends Context.Service<
  BrowserAcceptance,
  BrowserAcceptanceService
>()("@cove/acceptance/BrowserAcceptance") {}

const browserAcceptanceLive = (moderateFixture: boolean) =>
  Layer.effect(
    BrowserAcceptance,
    Effect.gen(function* () {
      const container = yield* startDatabase();
      const databaseUrl = container.getConnectionUri();

      yield* prepareDatabase(databaseUrl, moderateFixture);

      const apiPort = yield* allocatePort();
      let webPort = yield* allocatePort();
      while (webPort === apiPort) webPort = yield* allocatePort();
      let zeroPort = yield* allocatePort();
      while (zeroPort === apiPort || zeroPort === webPort) zeroPort = yield* allocatePort();
      let changeStreamerPort = yield* allocatePort();
      while (
        changeStreamerPort === apiPort ||
        changeStreamerPort === webPort ||
        changeStreamerPort === zeroPort
      ) {
        changeStreamerPort = yield* allocatePort();
      }
      const zeroReplicaDirectory = yield* makeZeroReplicaDirectory();
      const zeroReplicaFile = join(zeroReplicaDirectory, "zero.db");
      const apiUrl = `http://127.0.0.1:${apiPort}`;
      const webUrl = `http://localhost:${webPort}`;
      const zeroUrl = `http://localhost:${zeroPort}`;
      const apiOutput: Array<string> = [];
      const zeroOutput: Array<string> = [];
      const webOutput: Array<string> = [];
      let takenMagicLinkCount = 0;
      let takenWorkspaceInvitationLinkCount = 0;

      yield* startProcess({
        command: process.execPath,
        args: ["--conditions=development", "apps/api/src/main.ts"],
        options: {
          cwd: repositoryDirectory,
          env: {
            ...process.env,
            DATABASE_URL: databaseUrl,
            EXPOSE_APP_API_DOCS: "false",
            HOST: "127.0.0.1",
            PORT: String(apiPort),
            PUBLIC_WEB_ORIGIN: webUrl,
            TOPIC_ARCHIVE_CURSOR_SIGNING_KEY: "acceptance-topic-archive-cursor-signing-key",
          },
        },
        output: apiOutput,
      });
      yield* waitForServer(`${apiUrl}/health/ready`, apiOutput);

      const zeroProcess = yield* startRestartableProcess({
        command: zeroCacheExecutable,
        args: [],
        options: {
          cwd: acceptanceDirectory,
          env: {
            ...process.env,
            NODE_ENV: "development",
            ZERO_APP_ID: "cove_acceptance",
            ZERO_APP_PUBLICATIONS: "cove_zero_data",
            ZERO_CHANGE_STREAMER_PORT: String(changeStreamerPort),
            ZERO_ENABLE_CRUD_MUTATIONS: "false",
            ZERO_PORT: String(zeroPort),
            ZERO_QUERY_FORWARD_COOKIES: "true",
            ZERO_QUERY_URL: `${apiUrl}/api/zero/query`,
            ZERO_REPLICA_FILE: zeroReplicaFile,
            ZERO_UPSTREAM_DB: databaseUrl,
          },
        },
        output: zeroOutput,
      });
      yield* waitForServer(zeroUrl, zeroOutput);

      yield* startProcess({
        command: webExecutable,
        args: ["dev", "--host", "localhost", "--port", String(webPort)],
        options: {
          cwd: webDirectory,
          env: {
            ...process.env,
            COVE_API_ORIGIN: apiUrl,
            VITE_ZERO_CACHE_URL: zeroUrl,
          },
        },
        output: webOutput,
      });
      yield* waitForServer(webUrl, webOutput);

      const browser = yield* launchBrowser();
      const page = yield* openPage(browser);
      page.setDefaultTimeout(10_000);

      const takeMagicLink = Effect.fn("BrowserAcceptance.takeMagicLink")(() =>
        Effect.try({
          try: () => {
            const links = [
              ...apiOutput
                .join("")
                .matchAll(/http:\/\/localhost:\d+\/auth\/verify\?token=[A-Za-z0-9_-]+/g),
            ];
            const link = links[takenMagicLinkCount]?.[0];
            if (link === undefined)
              throw new Error("No development magic link has been delivered.");
            takenMagicLinkCount += 1;
            return link;
          },
          catch: (cause) => new Error("No development magic link has been delivered.", { cause }),
        }).pipe(
          Effect.retry(Schedule.spaced("50 millis")),
          Effect.timeout("10 seconds"),
          Effect.mapError(
            (cause) =>
              new Error("No development magic link has been delivered within 10 seconds.", {
                cause,
              }),
          ),
        ),
      );

      const takeWorkspaceInvitationLink = Effect.fn(
        "BrowserAcceptance.takeWorkspaceInvitationLink",
      )(() =>
        Effect.try({
          try: () => {
            const links = [
              ...apiOutput
                .join("")
                .matchAll(
                  /http:\/\/localhost:\d+\/workspace-invitations\/redeem\?token=[A-Za-z0-9_-]+/g,
                ),
            ];
            const link = links[takenWorkspaceInvitationLinkCount]?.[0];
            if (link === undefined) {
              throw new Error("No development Workspace invitation link has been delivered.");
            }
            takenWorkspaceInvitationLinkCount += 1;
            return link;
          },
          catch: (cause) =>
            new Error("No development Workspace invitation link has been delivered.", { cause }),
        }).pipe(
          Effect.retry(Schedule.spaced("50 millis")),
          Effect.timeout("10 seconds"),
          Effect.mapError(
            (cause) =>
              new Error(
                "No development Workspace invitation link has been delivered within 10 seconds.",
                { cause },
              ),
          ),
        ),
      );

      const makeWorkspaceInvitationResendable = Effect.fn(
        "BrowserAcceptance.makeWorkspaceInvitationResendable",
      )((inviteeEmail: string) =>
        Effect.tryPromise({
          try: async () => {
            const result = await container.exec([
              "psql",
              "--username",
              container.getUsername(),
              "--dbname",
              container.getDatabase(),
              "--command",
              `UPDATE workspace_invitations SET invited_at = NOW() - INTERVAL '61 seconds' WHERE invitee_email = '${inviteeEmail.replaceAll("'", "''")}';`,
            ]);
            if (result.exitCode !== 0 || !result.stdout.includes("UPDATE 1")) {
              throw new Error(result.stderr || result.stdout);
            }
          },
          catch: (cause) =>
            new Error(`Could not age the Workspace invitation for ${inviteeEmail}.`, { cause }),
        }),
      );

      const stopAndRemoveZeroReplica = Effect.fn("BrowserAcceptance.stopAndRemoveZeroReplica")(() =>
        Effect.gen(function* () {
          yield* Effect.tryPromise({
            try: zeroProcess.stop,
            catch: (cause) => new Error("Could not stop the configured Zero cache.", { cause }),
          });
          const removed = yield* removeConfiguredZeroReplica(zeroReplicaDirectory, zeroReplicaFile);
          console.log("[growth-readiness] synchronizationAvailable=false");
          return removed;
        }),
      );

      const restartZero = Effect.fn("BrowserAcceptance.restartZero")(() =>
        Effect.gen(function* () {
          const startedAt = performance.now();
          yield* Effect.tryPromise({
            try: zeroProcess.start,
            catch: (cause) => new Error("Could not restart the configured Zero cache.", { cause }),
          });
          yield* waitForServer(zeroUrl, zeroOutput);
          const rebuildMs = Math.max(0, performance.now() - startedAt);
          console.log("[growth-readiness] synchronizationAvailable=true");
          return { rebuildMs };
        }),
      );

      return BrowserAcceptance.of({
        browser,
        page,
        webUrl,
        zeroUrl,
        makeWorkspaceInvitationResendable,
        restartZero,
        stopAndRemoveZeroReplica,
        takeMagicLink,
        takeWorkspaceInvitationLink,
      });
    }),
  );

export const BrowserAcceptanceLive = browserAcceptanceLive(false);
export const GrowthReadinessBrowserAcceptanceLive = browserAcceptanceLive(true);
