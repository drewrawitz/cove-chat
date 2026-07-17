import { NodeHttpServer } from "@effect/platform-node";
import { expect, layer } from "@effect/vitest";
import { makeCsrfToken, makeMagicLinkToken, makeSessionToken } from "@cove/application";
import { PostgresRepositories } from "@cove/infrastructure-postgres";
import { TestDatabase } from "@cove/infrastructure-postgres/test";
import {
  MagicLinkDelivery,
  MagicLinkRepository,
  SessionRepository,
  TransactionManager,
  UserRepository,
  AuditEventWriter,
} from "@cove/ports";
import { HealthOkResponse, HealthUnavailableResponse } from "@cove/protocol";
import { Effect, Layer, Option } from "effect";
import { HttpClient, HttpClientResponse, HttpRouter } from "effect/unstable/http";
import { DatabaseReadiness, PostgresDatabaseReadiness } from "../../src/health/index.ts";
import { HttpRoutes } from "../../src/http-live.ts";

const Server = HttpRouter.serve(HttpRoutes, {
  disableListenLog: true,
  disableLogger: true,
});

const AuthPortsTest = Layer.mergeAll(
  Layer.succeed(
    MagicLinkDelivery,
    MagicLinkDelivery.of({
      send: Effect.fn("MagicLinkDelivery.Test.send")(() => Effect.void),
    }),
  ),
  Layer.succeed(
    MagicLinkRepository,
    MagicLinkRepository.of({
      issue: Effect.fn("MagicLinkRepository.Test.issue")(() =>
        Effect.succeed(makeMagicLinkToken("unused")),
      ),
      consume: Effect.fn("MagicLinkRepository.Test.consume")(() => Effect.succeed(Option.none())),
    }),
  ),
  Layer.succeed(
    SessionRepository,
    SessionRepository.of({
      create: Effect.fn("SessionRepository.Test.create")((_userId, expiresAt) =>
        Effect.succeed({
          token: makeSessionToken("unused-session"),
          csrfToken: makeCsrfToken("unused-csrf"),
          expiresAt,
        }),
      ),
      findCurrentUser: Effect.fn("SessionRepository.Test.findCurrentUser")(() =>
        Effect.succeed(Option.none()),
      ),
      revoke: Effect.fn("SessionRepository.Test.revoke")(() => Effect.succeed(true)),
    }),
  ),
  Layer.succeed(
    UserRepository,
    UserRepository.of({
      findByEmail: Effect.fn("UserRepository.Test.findByEmail")(() =>
        Effect.succeed(Option.none()),
      ),
    }),
  ),
  Layer.succeed(
    AuditEventWriter,
    AuditEventWriter.of({
      writeSignIn: Effect.fn("AuditEventWriter.Test.writeSignIn")(() => Effect.void),
    }),
  ),
  Layer.succeed(
    TransactionManager,
    TransactionManager.of({
      run: (effect) => effect,
    }),
  ),
);

const apiWithDependencies = <R, E>(dependencies: Layer.Layer<R, E>) =>
  Server.pipe(Layer.provide(dependencies), Layer.provideMerge(NodeHttpServer.layerTest));

const AvailableServices = Layer.mergeAll(PostgresDatabaseReadiness, PostgresRepositories).pipe(
  Layer.provide(TestDatabase),
  Layer.provideMerge(AuthPortsTest),
);
const AvailableApi = apiWithDependencies(AvailableServices);

const UnavailableDatabase = Layer.succeed(
  DatabaseReadiness,
  DatabaseReadiness.of({
    check: Effect.fn("DatabaseReadiness.Test.unavailable")(() => Effect.succeed(false)),
  }),
);
const UnavailableApi = apiWithDependencies(
  UnavailableDatabase.pipe(Layer.provideMerge(AuthPortsTest)),
);

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
          "/api/v1/auth/login": {},
          "/api/v1/auth/login/verify": {},
          "/api/v1/auth/logout": {},
          "/api/v1/me": {},
          "/health/live": {},
          "/health/ready": {},
        },
        components: {
          securitySchemes: {
            sessionCookie: {
              type: "apiKey",
              in: "cookie",
              name: "cove_session",
            },
          },
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
