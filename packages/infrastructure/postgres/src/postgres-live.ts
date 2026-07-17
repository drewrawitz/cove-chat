import { PgClient } from "@effect/sql-pg";
import { Config, Layer } from "effect";
import { PostgresChannelRepository } from "./channels/index.ts";
import { PostgresMembershipRepository } from "./memberships/index.ts";

export const PostgresClientLive = PgClient.layerConfig({
  url: Config.redacted("DATABASE_URL"),
});

export const PostgresRepositories = Layer.mergeAll(
  PostgresChannelRepository,
  PostgresMembershipRepository,
);

export const PostgresLive = PostgresRepositories.pipe(Layer.provide(PostgresClientLive));
