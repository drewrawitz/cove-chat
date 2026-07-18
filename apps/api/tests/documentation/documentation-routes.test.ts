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

const DocumentationApi = makeHttpApiTestLayer({ exposeAppApiDocs: false }, UnavailableDatabase);
const AppDocumentationApi = makeHttpApiTestLayer({ exposeAppApiDocs: true }, UnavailableDatabase);

layer(DocumentationApi)("public API documentation", (it) => {
  it.effect("serves only the generated public OpenAPI contract", () =>
    Effect.gen(function* () {
      const response = yield* HttpClient.get("/openapi/public.json");
      const document = yield* response.json;

      expect(response.status).toBe(200);
      expect(document).toMatchObject({
        openapi: "3.1.0",
        info: {
          title: "Cove Public API",
          version: "1.0.0",
        },
        paths: {},
      });
      expect(JSON.stringify(document)).not.toContain("sessionCookie");
    }),
  );

  it.effect("serves interactive documentation for only the public contract", () =>
    Effect.gen(function* () {
      const response = yield* HttpClient.get("/developers");
      const html = yield* response.text;

      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toContain("text/html");
      expect(html).toContain("Cove Public API");
      expect(html).not.toContain("/api/app/v1");
      expect(html).not.toContain("/health/ready");
    }),
  );

  it.effect("does not expose the former combined documentation routes", () =>
    Effect.gen(function* () {
      const openApiResponse = yield* HttpClient.get("/openapi.json");
      const scalarResponse = yield* HttpClient.get("/docs");

      expect(openApiResponse.status).toBe(404);
      expect(scalarResponse.status).toBe(404);
    }),
  );

  it.effect("does not expose app documentation by default", () =>
    Effect.gen(function* () {
      const response = yield* HttpClient.get("/internal/developers");

      expect(response.status).toBe(404);
    }),
  );
});

layer(AppDocumentationApi)("app API documentation", (it) => {
  it.effect("serves interactive documentation for only the app contract", () =>
    Effect.gen(function* () {
      const response = yield* HttpClient.get("/internal/developers");
      const html = yield* response.text;

      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toContain("text/html");
      expect(html).toContain("Cove App API");
      expect(html).toContain("/api/app/v1/auth/login");
      expect(html).not.toContain("/health/ready");
    }),
  );
});
