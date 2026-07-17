import { NodeHttpServer } from "@effect/platform-node";
import { CoveApi } from "@cove/protocol";
import { Config, Layer } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { HttpApiBuilder, HttpApiScalar } from "effect/unstable/httpapi";
import { createServer } from "node:http";
import { HealthApiLive } from "./health/index.ts";

const ApiRoutes = HttpApiBuilder.layer(CoveApi, { openapiPath: "/openapi.json" }).pipe(
  Layer.provide(HealthApiLive),
);

export const HttpRoutes = Layer.mergeAll(ApiRoutes, HttpApiScalar.layer(CoveApi));

export const HttpLive = HttpRouter.serve(HttpRoutes);

export const NodeServerLive = NodeHttpServer.layerConfig(createServer, {
  host: Config.string("HOST").pipe(Config.withDefault("0.0.0.0")),
  port: Config.port("PORT").pipe(Config.withDefault(3000)),
});
