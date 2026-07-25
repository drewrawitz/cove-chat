import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const argumentsToForward = process.argv.slice(2);
const packageDirectory = fileURLToPath(new URL("..", import.meta.url));
const isWindows = process.platform === "win32";
const vitePlusExecutable = isWindows ? "vp.cmd" : "vp";

if (argumentsToForward.includes("--help") || argumentsToForward.includes("-h")) {
  console.log(`Reset the local Cove database and replay all migrations.

Usage:
  vp run @cove/db#migrate:reset

The command drops Cove's database-level Zero publication before Prisma resets
the configured schema. It also removes inactive Zero replication slots and
internal metadata. Stop @cove/sync#dev before running it.

It is destructive and does not ask for confirmation.`);
  process.exit(0);
}

if (argumentsToForward.length > 0) {
  console.error(`Unknown argument: ${argumentsToForward[0]}`);
  process.exit(1);
}

const runPrisma = (arguments_: ReadonlyArray<string>): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(vitePlusExecutable, ["exec", "prisma", ...arguments_], {
      cwd: packageDirectory,
      shell: isWindows,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Prisma exited with status ${String(code)}.`));
      }
    });
  });

try {
  await runPrisma(["db", "execute", "--file", "prisma/reset-before-migrate.sql"]);
  await runPrisma(["migrate", "reset", "--force"]);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Database reset failed: ${message}`);
  process.exitCode = 1;
}
