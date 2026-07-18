import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { chromium, type Browser, type Page } from "playwright";
import { Context, Effect, Layer, Schedule } from "effect";

const execFileAsync = promisify(execFile);
const repositoryDirectory = fileURLToPath(new URL("../../../../", import.meta.url));
const dbPackageDirectory = join(repositoryDirectory, "packages/db");
const prismaExecutable = join(dbPackageDirectory, "node_modules/.bin/prisma");
const webDirectory = join(repositoryDirectory, "apps/web");
const webExecutable = join(webDirectory, "node_modules/.bin/vp");

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
        if (child.exitCode !== null || child.signalCode !== null) {
          resolve();
          return;
        }

        const forceStop = setTimeout(() => child.kill("SIGKILL"), 5_000);
        child.once("exit", () => {
          clearTimeout(forceStop);
          resolve();
        });
        child.kill("SIGTERM");
      }),
  ),
);

const startProcess = Effect.fn("BrowserAcceptance.startProcess")(
  (
    command: string,
    args: ReadonlyArray<string>,
    options: { readonly cwd: string; readonly env: NodeJS.ProcessEnv },
    output: Array<string>,
  ) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const child = spawn(command, args, {
          cwd: options.cwd,
          env: options.env,
          stdio: ["ignore", "pipe", "pipe"],
        });
        child.stdout?.setEncoding("utf8");
        child.stderr?.setEncoding("utf8");
        child.stdout?.on("data", (chunk: string) => output.push(chunk));
        child.stderr?.on("data", (chunk: string) => output.push(chunk));
        return child;
      }),
      stopProcess,
    ),
);

const startDatabase = Effect.fn("BrowserAcceptance.startDatabase")(() =>
  Effect.acquireRelease(
    Effect.tryPromise({
      try: () => new PostgreSqlContainer("postgres:18.4-alpine").start(),
      catch: (cause) => new Error("Could not start acceptance PostgreSQL.", { cause }),
    }),
    (running) => Effect.promise(() => running.stop()),
  ),
);

const prepareDatabase = Effect.fn("BrowserAcceptance.prepareDatabase")((databaseUrl: string) =>
  Effect.tryPromise({
    try: async () => {
      const env = { ...process.env, DATABASE_URL: databaseUrl };
      await execFileAsync(prismaExecutable, ["migrate", "deploy"], {
        cwd: dbPackageDirectory,
        env,
      });
      await execFileAsync(prismaExecutable, ["db", "seed"], {
        cwd: dbPackageDirectory,
        env,
      });
    },
    catch: (cause) => new Error("Could not prepare the acceptance database.", { cause }),
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
        const response = await fetch(url);
        if (!response.ok) throw new Error(`${url} returned ${response.status}.`);
      },
      catch: (cause) => new Error(`Waiting for ${url} failed.`, { cause }),
    }).pipe(
      Effect.retry(Schedule.spaced("100 millis")),
      Effect.timeout("15 seconds"),
      Effect.mapError(
        (cause) => new Error(`Waiting for ${url} failed.\n${processOutput.join("")}`, { cause }),
      ),
    ),
);

export interface BrowserAcceptanceService {
  readonly page: Page;
  readonly webUrl: string;
  readonly takeMagicLink: () => Effect.Effect<string, Error>;
}

export class BrowserAcceptance extends Context.Service<
  BrowserAcceptance,
  BrowserAcceptanceService
>()("@cove/acceptance/BrowserAcceptance") {}

export const BrowserAcceptanceLive = Layer.effect(
  BrowserAcceptance,
  Effect.gen(function* () {
    const container = yield* startDatabase();
    const databaseUrl = container.getConnectionUri();

    yield* prepareDatabase(databaseUrl);

    const apiPort = yield* allocatePort();
    let webPort = yield* allocatePort();
    while (webPort === apiPort) webPort = yield* allocatePort();
    const apiUrl = `http://127.0.0.1:${apiPort}`;
    const webUrl = `http://localhost:${webPort}`;
    const apiOutput: Array<string> = [];
    const webOutput: Array<string> = [];
    const browserOutput: Array<string> = [];

    yield* startProcess(
      process.execPath,
      ["apps/api/src/main.ts"],
      {
        cwd: repositoryDirectory,
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
          EXPOSE_APP_API_DOCS: "false",
          HOST: "127.0.0.1",
          PORT: String(apiPort),
          PUBLIC_APP_URL: webUrl,
        },
      },
      apiOutput,
    );
    yield* waitForServer(`${apiUrl}/health/ready`, apiOutput);

    yield* startProcess(
      webExecutable,
      ["dev", "--host", "localhost", "--port", String(webPort)],
      {
        cwd: webDirectory,
        env: { ...process.env, COVE_API_ORIGIN: apiUrl },
      },
      webOutput,
    );
    yield* waitForServer(webUrl, webOutput);

    const browser = yield* launchBrowser();
    const page = yield* openPage(browser);
    page.on("console", (message) =>
      browserOutput.push(`[console:${message.type()}] ${message.text()}\n`),
    );
    page.on("pageerror", (error) =>
      browserOutput.push(`[pageerror] ${error.stack ?? error.message}\n`),
    );
    page.on("requestfailed", (request) =>
      browserOutput.push(
        `[requestfailed] ${request.method()} ${request.url()} ${request.failure()?.errorText ?? ""}\n`,
      ),
    );
    page.on("response", (response) => {
      if (response.status() >= 400) {
        browserOutput.push(
          `[response] ${response.request().method()} ${response.url()} ${response.status()}\n`,
        );
      }
    });
    page.setDefaultTimeout(10_000);

    const takeMagicLink = Effect.fn("BrowserAcceptance.takeMagicLink")(() =>
      Effect.try({
        try: () => {
          const link = apiOutput
            .join("")
            .match(/http:\/\/localhost:\d+\/auth\/verify\?token=[A-Za-z0-9_-]+/)?.[0];
          if (link === undefined) throw new Error("No development magic link has been delivered.");
          return link;
        },
        catch: (cause) => new Error("No development magic link has been delivered.", { cause }),
      }).pipe(
        Effect.retry(Schedule.spaced("50 millis")),
        Effect.timeout("10 seconds"),
        Effect.mapError(
          (cause) =>
            new Error(
              [
                "No development magic link has been delivered.",
                `API output:\n${apiOutput.join("")}`,
                `Web output:\n${webOutput.join("")}`,
                `Browser output:\n${browserOutput.join("")}`,
              ].join("\n"),
              { cause },
            ),
        ),
      ),
    );

    return BrowserAcceptance.of({ page, webUrl, takeMagicLink });
  }),
);
