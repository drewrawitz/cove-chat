import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { PgClient } from "@effect/sql-pg";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { Effect, Layer, Redacted } from "effect";
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

export const TestPostgres = PostgresRepositories.pipe(Layer.provideMerge(TestDatabase));
