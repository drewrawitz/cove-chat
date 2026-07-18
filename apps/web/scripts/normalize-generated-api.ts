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
const generatedErrorType = /globalThis\.Error & \{[^}]*\}/g;
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

let normalizedClient = generatedClient
  .replaceAll(unsafeHeadersSpread, safeHeadersSpread)
  .replaceAll(generatedDefaultFetch, "fetchFn ?? coveFetch")
  .replace(
    generatedErrorBlock,
    "  if (!res.ok) throw new CoveApiError(res.status, parseApiError(body));",
  )
  .replace(generatedValidatedResponse, "const data = $1.parse(parsedBody);")
  .replace(
    generatedVoidResponse,
    '  if (body !== null) throw new TypeError("Expected an empty API response.");\n  return undefined;',
  )
  .replace(/\b([A-Z]\w+Response)Success\b/g, "$1")
  .replaceAll("voidSuccess", "void")
  .replace(generatedErrorType, "CoveApiError");

const parsedSchemas = [...normalizedClient.matchAll(/\b(\w+Response)\.parse\(parsedBody\)/g)].map(
  (match) => match[1],
);

normalizedClient = normalizedClient.replace(
  /import type \{([^}]*)\} from ["']\.\/schemas["'];/,
  (match: string, imports: string, offset: number, source: string) => {
    const sourceWithoutImport = source.slice(0, offset) + source.slice(offset + match.length);
    const usedSchemas = [...imports.matchAll(/^  (\w+),?$/gm)]
      .map((importMatch) => importMatch[1])
      .filter((name) => new RegExp(`\\b${name}\\b`).test(sourceWithoutImport));
    return usedSchemas
      .map((name) => {
        const importName = parsedSchemas.includes(name) ? name : `type ${name}`;
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
