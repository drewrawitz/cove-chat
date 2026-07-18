import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { makeCoveAppOpenApi } from "../src/app-openapi.ts";

const outputPath = fileURLToPath(new URL("../openapi/app.json", import.meta.url));
const document = makeCoveAppOpenApi();

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(document, undefined, 2)}\n`);
