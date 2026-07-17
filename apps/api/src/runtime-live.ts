import { PostgresClientLive, PostgresRepositories } from "@cove/infrastructure-postgres";
import { Layer } from "effect";
import { PostgresDatabaseReadiness } from "./health/index.ts";
import { HttpLive, NodeServerLive } from "./http-live.ts";

const PostgresServicesLive = Layer.mergeAll(PostgresDatabaseReadiness, PostgresRepositories).pipe(
  Layer.provideMerge(PostgresClientLive),
);

const InfrastructureLive = Layer.mergeAll(NodeServerLive, PostgresServicesLive);

export const ApiLive = HttpLive.pipe(Layer.provide(InfrastructureLive));
