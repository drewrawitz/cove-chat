import { PostgresClientLive } from "@cove/infrastructure-postgres";
import { Layer } from "effect";
import { PostgresDatabaseReadiness } from "./health/index.ts";
import { HttpLive, NodeServerLive } from "./http-live.ts";

const PostgresHealthLive = PostgresDatabaseReadiness.pipe(Layer.provide(PostgresClientLive));

const InfrastructureLive = Layer.mergeAll(NodeServerLive, PostgresHealthLive);

export const ApiLive = HttpLive.pipe(Layer.provide(InfrastructureLive));
