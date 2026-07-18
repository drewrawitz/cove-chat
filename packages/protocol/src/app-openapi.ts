import { OpenApi } from "effect/unstable/httpapi";
import { CoveAppApi } from "./app-api.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function preserveParentTypeInAllOf(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) preserveParentTypeInAllOf(item);
    return;
  }

  if (!isRecord(value)) return;

  if (typeof value.type === "string" && Array.isArray(value.allOf)) {
    for (const branch of value.allOf) {
      if (isRecord(branch) && branch.type === undefined && branch.$ref === undefined) {
        branch.type = value.type;
      }
    }
  }

  for (const child of Object.values(value)) preserveParentTypeInAllOf(child);
}

export function makeCoveAppOpenApi() {
  const document = OpenApi.fromApi(CoveAppApi);
  preserveParentTypeInAllOf(document);
  return document;
}
