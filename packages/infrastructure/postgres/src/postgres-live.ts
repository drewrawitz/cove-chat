import { PgClient } from "@effect/sql-pg";
import { Config, Layer } from "effect";
import {
  PostgresAuditEventWriter,
  PostgresMagicLinkRepository,
  PostgresSessionRepository,
  PostgresUserRepository,
} from "./auth/index.ts";
import { PostgresChannelAccess, PostgresChannelRepository } from "./channels/index.ts";
import { PostgresMembershipRepository } from "./memberships/index.ts";
import { PostgresTransactionManager } from "./transaction-manager.ts";
import { PostgresWorkspaceAccess } from "./workspaces/index.ts";

export const PostgresClientLive = PgClient.layerConfig({
  url: Config.redacted("DATABASE_URL"),
});

export const PostgresRepositories = Layer.mergeAll(
  PostgresAuditEventWriter,
  PostgresMagicLinkRepository,
  PostgresSessionRepository,
  PostgresUserRepository,
  PostgresChannelRepository,
  PostgresChannelAccess,
  PostgresMembershipRepository,
  PostgresWorkspaceAccess,
  PostgresTransactionManager,
);

export const PostgresLive = PostgresRepositories.pipe(Layer.provide(PostgresClientLive));
