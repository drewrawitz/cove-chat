import { expect, layer } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { HttpClient } from "effect/unstable/http";
import { DatabaseReadiness } from "../../src/health/index.ts";
import { makeHttpApiTestLayer } from "../support/http-api-test-layer.ts";

const UnavailableDatabase = Layer.succeed(
  DatabaseReadiness,
  DatabaseReadiness.of({
    check: Effect.fn("DatabaseReadiness.Test.unavailable")(() => Effect.succeed(false)),
  }),
);

const QueryApi = makeHttpApiTestLayer({ exposeAppApiDocs: false }, UnavailableDatabase);

layer(QueryApi)("Zero query route", (it) => {
  it.effect("rejects named query transformation without an authenticated session", () =>
    Effect.gen(function* () {
      const response = yield* HttpClient.post("/api/zero/query");

      expect(response.status).toBe(401);
      expect(yield* response.json).toEqual({ error: "Unauthorized" });
    }),
  );
});
