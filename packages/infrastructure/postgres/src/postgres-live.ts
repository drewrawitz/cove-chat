import { PgClient } from "@effect/sql-pg";
import { Config, Layer } from "effect";
import {
  PostgresAuditEventWriter,
  PostgresMagicLinkRepository,
  PostgresSessionRepository,
  PostgresUserRepository,
} from "./auth/index.ts";
import { PostgresChannelAccessRepository, PostgresChannelRepository } from "./channels/index.ts";
import { PostgresMembershipRepository } from "./memberships/index.ts";
import { PostgresTransactionManager } from "./transaction-manager.ts";
import { PostgresTopicRepository } from "./topics/index.ts";
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
  PostgresChannelAccessRepository,
  PostgresMembershipRepository,
  PostgresWorkspaceAccess,
  PostgresTransactionManager,
  PostgresTopicRepository,
);

export const PostgresLive = PostgresRepositories.pipe(Layer.provide(PostgresClientLive));
