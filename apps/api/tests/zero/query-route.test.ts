import { expect, layer } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { HttpClient } from "effect/unstable/http";
import { DatabaseReadiness } from "../../src/health/index.ts";
import { respondToCoveQueryRequest } from "../../src/zero/query-route.ts";
import { makeHttpApiTestLayer } from "../support/http-api-test-layer.ts";

const UnavailableDatabase = Layer.succeed(
  DatabaseReadiness,
  DatabaseReadiness.of({
    check: Effect.fn("DatabaseReadiness.Test.unavailable")(() => Effect.succeed(false)),
  }),
);

const QueryApi = makeHttpApiTestLayer({ exposeAppApiDocs: false }, UnavailableDatabase);

const queryRequest = (name: string, args: unknown) =>
  new Request("http://api.test/api/zero/query", {
    method: "POST",
    body: JSON.stringify([
      "transform",
      [
        {
          id: "query-1",
          name,
          args: [args],
        },
      ],
    ]),
    headers: { "content-type": "application/json" },
  });

layer(Layer.empty)("Zero query response", (it) => {
  it.effect("maps known query lookup and input failures to bad requests", () =>
    Effect.gen(function* () {
      for (const [name, args] of [
        ["topics.missing", {}],
        [
          "topics.byId",
          {
            workspaceId: "workspace-1",
            channelId: "channel-1",
          },
        ],
      ] as const) {
        const response = yield* respondToCoveQueryRequest(queryRequest(name, args), "account-1");
        expect(response.status).toBe(400);
      }
    }),
  );
});

layer(QueryApi)("Zero query route", (it) => {
  it.effect("rejects named query transformation without an authenticated session", () =>
    Effect.gen(function* () {
      const response = yield* HttpClient.post("/api/zero/query");

      expect(response.status).toBe(401);
      expect(yield* response.json).toEqual({ error: "Unauthorized" });
    }),
  );
});
