import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { OpenApi } from "effect/unstable/httpapi";
import { CoveApi } from "../src/index.ts";

it.effect("describes the health HTTP contract as OpenAPI", () =>
  Effect.sync(() => {
    const document = OpenApi.fromApi(CoveApi);

    expect(document.info).toMatchObject({
      title: "Cove API",
      version: "1.0.0",
    });
    expect(document.paths["/health/live"]?.get?.responses).toHaveProperty("200");
    expect(document.paths["/health/ready"]?.get?.responses).toHaveProperty("200");
    expect(document.paths["/health/ready"]?.get?.responses).toHaveProperty("503");
  }),
);
