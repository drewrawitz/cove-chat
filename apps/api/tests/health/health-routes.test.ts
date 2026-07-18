import { expect, layer } from "@effect/vitest";
import { PostgresRepositories } from "@cove/infrastructure-postgres";
import { TestDatabase } from "@cove/infrastructure-postgres/test";
import { HealthOkResponse, HealthUnavailableResponse } from "@cove/protocol";
import { Effect, Layer } from "effect";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";
import { DatabaseReadiness, PostgresDatabaseReadiness } from "../../src/health/index.ts";
import { makeHttpApiTestLayer } from "../support/http-api-test-layer.ts";

const AvailableServices = Layer.mergeAll(PostgresDatabaseReadiness, PostgresRepositories).pipe(
  Layer.provide(TestDatabase),
);
const AvailableApi = makeHttpApiTestLayer({ exposeAppApiDocs: false }, AvailableServices);

const UnavailableDatabase = Layer.succeed(
  DatabaseReadiness,
  DatabaseReadiness.of({
    check: Effect.fn("DatabaseReadiness.Test.unavailable")(() => Effect.succeed(false)),
  }),
);
const UnavailableApi = makeHttpApiTestLayer({ exposeAppApiDocs: false }, UnavailableDatabase);

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
