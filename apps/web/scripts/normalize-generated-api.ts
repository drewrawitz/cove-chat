import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const generatedClientPath = fileURLToPath(
  new URL("../src/api/generated/cove-app.ts", import.meta.url),
);
const generatedClient = await readFile(generatedClientPath, "utf8");
const unsafeHeadersSpread = "...options?.headers";
const safeHeadersSpread = "...Object.fromEntries(new Headers(options?.headers))";
const generatedDefaultFetch = "fetchFn ?? fetch";
const generatedErrorBlock = /  if \(!res\.ok\) \{[\s\S]*?    throw err;\n  \}/g;
const generatedErrorInfo =
  /TError = globalThis\.Error & \{\s*info\?:([\s\S]*?);\s*status\?: number;\s*\}/;
const generatedErrorType = /globalThis\.Error & \{\s*info\?:([\s\S]*?);\s*status\?: number;\s*\}/g;
const generatedValidatedResponse =
  /const data = contentType\.includes\(["']json["']\)\s*\?\s*(\w+)\.parse\(parsedBody\)\s*:\s*parsedBody;?/g;
const generatedVoidResponse =
  /  const data\s*:\s*voidSuccess = body \? JSON\.parse\(body\) : undefined;?\s*return data;?/g;

function occurrences(pattern: string): number {
  return generatedClient.split(pattern).length - 1;
}

if (occurrences(unsafeHeadersSpread) === 0 || occurrences(generatedDefaultFetch) === 0) {
  throw new Error("Generated client no longer contains the expected request expressions.");
}

function responseSchemas(source: string): ReadonlyArray<string> {
  return [...source.matchAll(/\b([A-Z]\w+Response)\b/g)].map((match) => match[1]);
}

const runtimeSchemas = new Set<string>();

let normalizedClient = generatedClient
  .replaceAll(unsafeHeadersSpread, safeHeadersSpread)
  .replaceAll(generatedDefaultFetch, "fetchFn ?? coveFetch")
  .replace(generatedErrorBlock, (_block, offset: number) => {
    const remainingClient = generatedClient.slice(offset);
    const nextOperationOffset = remainingClient.slice(1).search(/\nexport const \w+ = async/);
    const operationSource = remainingClient.slice(
      0,
      nextOperationOffset === -1 ? undefined : nextOperationOffset + 1,
    );
    const errorInfo = operationSource.match(generatedErrorInfo)?.[1];
    if (errorInfo === undefined) {
      throw new Error("Generated operation no longer exposes its error response types.");
    }

    const schemas = [...new Set(responseSchemas(errorInfo))];
    if (schemas.length === 0) {
      throw new Error("Generated operation has no named error response schemas.");
    }
    schemas.forEach((schema) => runtimeSchemas.add(schema));
    const schema = schemas.slice(1).reduce((union, member) => `${union}.or(${member})`, schemas[0]);
    return `  if (!res.ok) throw new CoveApiError(res.status, parseApiError(body, ${schema}));`;
  })
  .replace(generatedValidatedResponse, "const data = $1.parse(parsedBody);")
  .replace(
    generatedVoidResponse,
    '  if (body !== null) throw new TypeError("Expected an empty API response.");\n  return undefined;',
  )
  .replace(/\b([A-Z]\w+Response)Success\b/g, "$1")
  .replaceAll("voidSuccess", "void")
  .replace(generatedErrorType, (_errorType, errorInfo: string) => {
    const errorTypes = [...new Set(responseSchemas(errorInfo))];
    if (errorTypes.length === 0) {
      throw new Error("Generated query error has no named response types.");
    }
    return `CoveApiError<${errorTypes.join(" | ")}>`;
  });

for (const match of normalizedClient.matchAll(/\b(\w+Response)\.parse\(parsedBody\)/g)) {
  runtimeSchemas.add(match[1]);
}

normalizedClient = normalizedClient.replace(
  /import type \{([^}]*)\} from ["']\.\/schemas["'];/,
  (match: string, imports: string, offset: number, source: string) => {
    const sourceWithoutImport = source.slice(0, offset) + source.slice(offset + match.length);
    const usedSchemas = [...imports.matchAll(/^  (\w+),?$/gm)]
      .map((importMatch) => importMatch[1])
      .filter((name) => new RegExp(`\\b${name}\\b`).test(sourceWithoutImport));
    return usedSchemas
      .map((name) => {
        const importName = runtimeSchemas.has(name) ? name : `type ${name}`;
        const fileName = `${name.charAt(0).toLowerCase()}${name.slice(1)}.zod.ts`;
        return `import { ${importName} } from "./schemas/${fileName}";`;
      })
      .join("\n");
  },
);

normalizedClient = `import { CoveApiError, coveFetch, parseApiError } from "../cove-fetch.ts";\n${normalizedClient}`;

if (
  normalizedClient.includes(unsafeHeadersSpread) ||
  normalizedClient.includes(generatedDefaultFetch) ||
  generatedErrorBlock.test(normalizedClient) ||
  /\b(?:void|[A-Z]\w+Response)(?:Success|Error)\b/.test(normalizedClient)
) {
  throw new Error("Generated client normalization left an unsafe response expression behind.");
}

await writeFile(generatedClientPath, normalizedClient);
