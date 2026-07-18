import { NodeHttpServer } from "@effect/platform-node";
import { CoveAppApi, CoveOperationsApi, CovePublicApi } from "@cove/protocol";
import { Effect, Layer } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { HttpApiBuilder, HttpApiScalar } from "effect/unstable/httpapi";
import { createServer } from "node:http";
import { ApiConfiguration } from "./api-configuration.ts";
import { AuthApiLive, SessionAuthLive } from "./auth/index.ts";
import { HealthApiLive } from "./health/index.ts";

const AppApiRoutes = HttpApiBuilder.layer(CoveAppApi).pipe(
  Layer.provide(AuthApiLive),
  Layer.provide(SessionAuthLive),
);

const OperationsApiRoutes = HttpApiBuilder.layer(CoveOperationsApi).pipe(
  Layer.provide(HealthApiLive),
);

const PublicApiRoutes = HttpApiBuilder.layer(CovePublicApi, {
  openapiPath: "/openapi/public.json",
});

const PublicApiDocumentation = HttpApiScalar.layer(CovePublicApi, {
  path: "/developers",
  scalar: {
    hideTestRequestButton: true,
  },
});

export const HttpRoutes = Layer.mergeAll(
  AppApiRoutes,
  OperationsApiRoutes,
  PublicApiRoutes,
  PublicApiDocumentation,
);

export const HttpLive = HttpRouter.serve(HttpRoutes);

export const NodeServerLive = Layer.unwrap(
  Effect.map(ApiConfiguration, ({ host, port }) =>
    NodeHttpServer.layer(createServer, {
      host,
      port,
    }),
  ),
);
