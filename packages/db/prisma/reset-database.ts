import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const argumentsToForward = process.argv.slice(2);
const packageDirectory = fileURLToPath(new URL("..", import.meta.url));
const prismaExecutable = join(
  packageDirectory,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "prisma.cmd" : "prisma",
);

if (argumentsToForward.includes("--help") || argumentsToForward.includes("-h")) {
  console.log(`Reset the local Cove database and replay all migrations.

Usage:
  vp run @cove/db#migrate:reset

The command drops Cove's database-level Zero publication before Prisma resets
the configured schema. It is destructive and does not ask for confirmation.`);
  process.exit(0);
}

if (argumentsToForward.length > 0) {
  console.error(`Unknown argument: ${argumentsToForward[0]}`);
  process.exit(1);
}

const runPrisma = (arguments_: ReadonlyArray<string>): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(prismaExecutable, arguments_, {
      cwd: packageDirectory,
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

await runPrisma(["db", "execute", "--file", "prisma/reset-before-migrate.sql"]);
await runPrisma(["migrate", "reset", "--force"]);
