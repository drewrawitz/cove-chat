import { expect, it } from "@effect/vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../../..", import.meta.url));
const ignoredDirectories = new Set([".output", "dist", "generated", "node_modules"]);

const sourceFiles = (directory: string): ReadonlyArray<string> =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return ignoredDirectories.has(entry.name) ? [] : sourceFiles(path);
    }
    return entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))
      ? [path]
      : [];
  });

it("exports and consumes one exact Workspace Access internal subpath", () => {
  const applicationManifest = readFileSync(
    join(repositoryRoot, "packages/application/package.json"),
    "utf8",
  );
  const internalWorkspaceExports = applicationManifest.match(/"\.\/workspaces\/[^"]+"/g) ?? [];
  expect(internalWorkspaceExports).toEqual(['"./workspaces/internal"']);

  const applicationDeepImporters = ["apps", "packages"]
    .flatMap((root) => sourceFiles(join(repositoryRoot, root)))
    .filter((path) => readFileSync(path, "utf8").includes("@cove/application/workspaces/internal"));

  expect(applicationDeepImporters.map((path) => relative(repositoryRoot, path)).sort()).toEqual(
    [
      "packages/application/tests/architecture/workspace-access-internal-imports.test.ts",
      "packages/infrastructure/postgres/src/workspaces/workspace-access-persistence.ts",
      "packages/infrastructure/postgres/tests/workspaces/workspace-access-persistence.integration.test.ts",
    ].sort(),
  );
  expect(
    applicationDeepImporters.every((path) =>
      readFileSync(path, "utf8").includes('"@cove/application/workspaces/internal"'),
    ),
  ).toBe(true);
});
