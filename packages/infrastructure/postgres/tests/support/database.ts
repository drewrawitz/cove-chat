import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { PgClient } from "@effect/sql-pg";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import {
  WorkspaceInvitationNotifier,
  WorkspaceInvitationNotificationError,
  type WorkspaceInvitationNotification,
  type WorkspaceInvitationNotifierService,
} from "@cove/ports";
import { Context, Effect, Layer, Queue, Redacted, Ref } from "effect";
import { PostgresRepositories } from "../../src/index.ts";

const execFileAsync = promisify(execFile);
const POSTGRES_IMAGE = "postgres:18.4-alpine";
const dbPackageDirectory = fileURLToPath(new URL("../../../../db", import.meta.url));
const prismaExecutable = join(dbPackageDirectory, "node_modules/.bin/prisma");

const startedContainer = Effect.acquireRelease(
  Effect.promise(() => new PostgreSqlContainer(POSTGRES_IMAGE).start()),
  (container) => Effect.promise(() => container.stop()),
);

const applyMigrations = Effect.fn("PostgresTest.applyMigrations")((databaseUrl: string) =>
  Effect.promise(() =>
    execFileAsync(prismaExecutable, ["migrate", "deploy"], {
      cwd: dbPackageDirectory,
      env: { ...process.env, DATABASE_URL: databaseUrl },
    }),
  ),
);

const seedDatabase = Effect.fn("PostgresTest.seedDatabase")((databaseUrl: string) =>
  Effect.promise(() =>
    execFileAsync(prismaExecutable, ["db", "seed"], {
      cwd: dbPackageDirectory,
      env: { ...process.env, DATABASE_URL: databaseUrl },
    }),
  ),
);

export const TestDatabase = Layer.unwrap(
  Effect.gen(function* () {
    const container = yield* startedContainer;
    const databaseUrl = container.getConnectionUri();

    yield* applyMigrations(databaseUrl);
    yield* seedDatabase(databaseUrl);

    return PgClient.layer({ url: Redacted.make(databaseUrl) });
  }),
);

export interface TestWorkspaceInvitationNotifierService extends WorkspaceInvitationNotifierService {
  readonly failNext: () => Effect.Effect<void>;
  readonly takeFailed: () => Effect.Effect<WorkspaceInvitationNotification>;
  readonly take: () => Effect.Effect<WorkspaceInvitationNotification>;
}

export class TestWorkspaceInvitationNotifier extends Context.Service<
  TestWorkspaceInvitationNotifier,
  TestWorkspaceInvitationNotifierService
>()("@cove/infrastructure-postgres/test/TestWorkspaceInvitationNotifier") {}

const TestWorkspaceInvitationNotifications = Layer.effectContext(
  Effect.gen(function* () {
    const notifications = yield* Queue.unbounded<WorkspaceInvitationNotification>();
    const failedNotifications = yield* Queue.unbounded<WorkspaceInvitationNotification>();
    const shouldFail = yield* Ref.make(false);
    const notifier = TestWorkspaceInvitationNotifier.of({
      sendInvitation: Effect.fn("TestWorkspaceInvitationNotifier.sendInvitation")(
        function* (notification) {
          if (yield* Ref.getAndSet(shouldFail, false)) {
            yield* Queue.offer(failedNotifications, notification);
            return yield* Effect.fail(
              new WorkspaceInvitationNotificationError({ cause: "simulated delivery failure" }),
            );
          }
          yield* Queue.offer(notifications, notification);
        },
      ),
      failNext: Effect.fn("TestWorkspaceInvitationNotifier.failNext")(() =>
        Ref.set(shouldFail, true),
      ),
      takeFailed: Effect.fn("TestWorkspaceInvitationNotifier.takeFailed")(() =>
        Queue.take(failedNotifications),
      ),
      take: Effect.fn("TestWorkspaceInvitationNotifier.take")(() => Queue.take(notifications)),
    });
    return Context.empty().pipe(
      Context.add(WorkspaceInvitationNotifier, notifier),
      Context.add(TestWorkspaceInvitationNotifier, notifier),
    );
  }),
);

export const TestPostgres = PostgresRepositories.pipe(
  Layer.provideMerge(TestDatabase),
  Layer.provideMerge(TestWorkspaceInvitationNotifications),
);
