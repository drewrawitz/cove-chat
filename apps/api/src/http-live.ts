import { NodeHttpServer } from "@effect/platform-node";
import { CoveApi } from "@cove/protocol";
import { Effect, Layer } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { HttpApiBuilder, HttpApiScalar } from "effect/unstable/httpapi";
import { createServer } from "node:http";
import { ApiConfiguration } from "./api-configuration.ts";
import { AuthApiLive, SessionAuthLive } from "./auth/index.ts";
import { HealthApiLive } from "./health/index.ts";

const ApiRoutes = HttpApiBuilder.layer(CoveApi, { openapiPath: "/openapi.json" }).pipe(
  Layer.provide(AuthApiLive),
  Layer.provide(HealthApiLive),
  Layer.provide(SessionAuthLive),
);

export const HttpRoutes = Layer.mergeAll(ApiRoutes, HttpApiScalar.layer(CoveApi));

export const HttpLive = HttpRouter.serve(HttpRoutes);

export const NodeServerLive = Layer.unwrap(
  Effect.map(ApiConfiguration, ({ host, port }) =>
    NodeHttpServer.layer(createServer, {
      host,
      port,
    }),
  ),
);
