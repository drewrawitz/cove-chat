import { NodeHttpServer } from "@effect/platform-node";
import { expect, layer } from "@effect/vitest";
import { TestDatabase } from "@cove/infrastructure-postgres/test";
import { HealthOkResponse, HealthUnavailableResponse } from "@cove/protocol";
import { Effect, Layer } from "effect";
import { HttpClient, HttpClientResponse, HttpRouter } from "effect/unstable/http";
import { DatabaseReadiness, PostgresDatabaseReadiness } from "../../src/health/index.ts";
import { HttpRoutes } from "../../src/http-live.ts";

const Server = HttpRouter.serve(HttpRoutes, {
  disableListenLog: true,
  disableLogger: true,
});

const apiWithDatabase = <E>(database: Layer.Layer<DatabaseReadiness, E>) =>
  Server.pipe(Layer.provideMerge(Layer.mergeAll(NodeHttpServer.layerTest, database)));

const AvailableDatabase = PostgresDatabaseReadiness.pipe(Layer.provide(TestDatabase));
const AvailableApi = apiWithDatabase(AvailableDatabase);

const UnavailableDatabase = Layer.succeed(
  DatabaseReadiness,
  DatabaseReadiness.of({
    check: Effect.fn("DatabaseReadiness.Test.unavailable")(() => Effect.succeed(false)),
  }),
);
const UnavailableApi = apiWithDatabase(UnavailableDatabase);

const decodeHealthOkResponse = HttpClientResponse.schemaBodyJson(HealthOkResponse);
const decodeHealthUnavailableResponse =
  HttpClientResponse.schemaBodyJson(HealthUnavailableResponse);

layer(AvailableApi, { timeout: "2 minutes" })("health routes with PostgreSQL", (it) => {
  it.effect("reports ready after querying PostgreSQL", () =>
    Effect.gen(function* () {
      const response = yield* HttpClient.get("/health/ready");
      const body = yield* decodeHealthOkResponse(response);

      expect(response.status).toBe(200);
      expect(body).toEqual({ status: "ok" });
    }),
  );
});

layer(UnavailableApi)("health routes without PostgreSQL", (it) => {
  it.effect("serves the generated OpenAPI contract", () =>
    Effect.gen(function* () {
      const response = yield* HttpClient.get("/openapi.json");
      const document = yield* response.json;

      expect(response.status).toBe(200);
      expect(document).toMatchObject({
        openapi: "3.1.0",
        paths: {
          "/health/live": {},
          "/health/ready": {},
        },
      });
    }),
  );

  it.effect("serves interactive API documentation", () =>
    Effect.gen(function* () {
      const response = yield* HttpClient.get("/docs");
      const html = yield* response.text;

      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toContain("text/html");
      expect(html).toContain("Cove API");
    }),
  );

  it.effect("reports that the process is live", () =>
    Effect.gen(function* () {
      const response = yield* HttpClient.get("/health/live");
      const body = yield* decodeHealthOkResponse(response);

      expect(response.status).toBe(200);
      expect(body).toEqual({ status: "ok" });
    }),
  );

  it.effect("reports unavailable when the database check fails", () =>
    Effect.gen(function* () {
      const response = yield* HttpClient.get("/health/ready");
      const body = yield* decodeHealthUnavailableResponse(response);

      expect(response.status).toBe(503);
      expect(body).toEqual({ status: "unavailable" });
    }),
  );
});
