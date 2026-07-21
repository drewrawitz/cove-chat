import {
  Channel,
  ChannelId,
  ChannelName,
  ChannelPurpose,
  UserId,
  WorkspaceAvatarUrl,
  WorkspaceId,
  WorkspaceIdentityId,
  WorkspaceIdentityName,
  type Channel as ChannelType,
} from "@cove/domain";
import {
  ChannelAccessLive,
  ChannelAccessPersistence,
  ChannelAccessPersistenceFailure,
  ChannelMaintainerView,
  CreatePublicChannelPersistenceResult,
  PublicChannelView,
  CreatePublicChannelCommand,
} from "@cove/application";
import { Effect, Layer, Option, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";

const ActorWorkspaceRequest = Schema.Struct({
  actorAccountId: UserId,
  workspaceId: WorkspaceId,
});

const IdentityChannelRequest = Schema.Struct({
  workspaceId: WorkspaceId,
  actorIdentityId: WorkspaceIdentityId,
  channelId: ChannelId,
});

const IdentityWorkspaceRequest = Schema.Struct({
  workspaceId: WorkspaceId,
  actorIdentityId: WorkspaceIdentityId,
});

const MaintainerRequest = Schema.Struct({
  workspaceId: WorkspaceId,
  maintainerIdentityId: WorkspaceIdentityId,
});

const ActiveFullMemberIdentityRow = Schema.Struct({
  id: WorkspaceIdentityId,
  name: WorkspaceIdentityName,
  avatarUrl: WorkspaceAvatarUrl,
});
interface ActiveFullMemberIdentityRow extends Schema.Schema.Type<
  typeof ActiveFullMemberIdentityRow
> {}

const ActiveWorkspaceActorRow = Schema.Struct({ id: WorkspaceIdentityId });
interface ActiveWorkspaceActorRow extends Schema.Schema.Type<typeof ActiveWorkspaceActorRow> {}

const PublicChannelRow = Schema.Struct({
  id: ChannelId,
  workspaceId: WorkspaceId,
  name: ChannelName,
  purpose: ChannelPurpose,
  visibility: Schema.Literal("public"),
  maintainerIdentityId: WorkspaceIdentityId,
  maintainerName: WorkspaceIdentityName,
  maintainerAvatarUrl: WorkspaceAvatarUrl,
  hasChannelMembership: Schema.Boolean,
});
interface PublicChannelRow extends Schema.Schema.Type<typeof PublicChannelRow> {}

const publicChannelViewFromRow = (row: PublicChannelRow): PublicChannelView =>
  PublicChannelView.make({
    channel: Channel.make({
      id: row.id,
      workspaceId: row.workspaceId,
      name: row.name,
      purpose: row.purpose,
      visibility: row.visibility,
      maintainerIdentityId: row.maintainerIdentityId,
    }),
    maintainer: ChannelMaintainerView.make({
      id: row.maintainerIdentityId,
      name: row.maintainerName,
      avatarUrl: row.maintainerAvatarUrl,
    }),
    hasChannelMembership: row.hasChannelMembership,
  });

const persistenceFailure = (operation: string, cause: unknown) =>
  new ChannelAccessPersistenceFailure({ operation, cause });

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const readActiveWorkspaceActor = SqlSchema.findOneOption({
    Request: ActorWorkspaceRequest,
    Result: ActiveWorkspaceActorRow,
    execute: ({ actorAccountId, workspaceId }) => sql<ActiveWorkspaceActorRow>`
      SELECT identity.id
      FROM workspace_identities AS identity
      WHERE identity.account_id = ${actorAccountId}
        AND identity.workspace_id = ${workspaceId}
        AND identity.membership_ended_at IS NULL
      LIMIT 1
    `,
  });

  const lockActiveFullMemberIdentity = SqlSchema.findOneOption({
    Request: ActorWorkspaceRequest,
    Result: ActiveFullMemberIdentityRow,
    execute: ({ actorAccountId, workspaceId }) => sql<ActiveFullMemberIdentityRow>`
      SELECT
        identity.id,
        identity.name,
        identity.avatar_url AS "avatarUrl"
      FROM workspace_identities AS identity
      WHERE identity.account_id = ${actorAccountId}
        AND identity.workspace_id = ${workspaceId}
        AND identity.membership_ended_at IS NULL
        AND identity.role IN ('owner', 'admin', 'member')
      LIMIT 1
      FOR UPDATE
    `,
  });

  const lockMaintainer = SqlSchema.findOneOption({
    Request: MaintainerRequest,
    Result: ActiveFullMemberIdentityRow,
    execute: ({ workspaceId, maintainerIdentityId }) => sql<ActiveFullMemberIdentityRow>`
      SELECT
        identity.id,
        identity.name,
        identity.avatar_url AS "avatarUrl"
      FROM workspace_identities AS identity
      WHERE identity.workspace_id = ${workspaceId}
        AND identity.id = ${maintainerIdentityId}
        AND identity.membership_ended_at IS NULL
        AND identity.role IN ('owner', 'admin', 'member')
      LIMIT 1
      FOR UPDATE
    `,
  });

  const listMaintainerRows = SqlSchema.findAll({
    Request: ActorWorkspaceRequest,
    Result: ActiveFullMemberIdentityRow,
    execute: ({ actorAccountId, workspaceId }) => sql<ActiveFullMemberIdentityRow>`
      WITH actor AS (
        SELECT identity.workspace_id
        FROM workspace_identities AS identity
        WHERE identity.account_id = ${actorAccountId}
          AND identity.workspace_id = ${workspaceId}
          AND identity.membership_ended_at IS NULL
          AND identity.role IN ('owner', 'admin', 'member')
      )
      SELECT
        maintainer.id,
        maintainer.name,
        maintainer.avatar_url AS "avatarUrl"
      FROM actor
      INNER JOIN workspace_identities AS maintainer
        ON maintainer.workspace_id = actor.workspace_id
        AND maintainer.membership_ended_at IS NULL
        AND maintainer.role IN ('owner', 'admin', 'member')
      ORDER BY lower(maintainer.name), maintainer.id
    `,
  });

  const listPublicChannelRows = SqlSchema.findAll({
    Request: IdentityWorkspaceRequest,
    Result: PublicChannelRow,
    execute: ({ workspaceId, actorIdentityId }) => sql<PublicChannelRow>`
      SELECT
        channel.id,
        channel.workspace_id AS "workspaceId",
        channel.name,
        channel.purpose,
        channel.visibility,
        channel.maintainer_identity_id AS "maintainerIdentityId",
        maintainer.name AS "maintainerName",
        maintainer.avatar_url AS "maintainerAvatarUrl",
        actor_membership.identity_id IS NOT NULL AS "hasChannelMembership"
      FROM channels AS channel
      INNER JOIN workspace_identities AS actor
        ON actor.workspace_id = channel.workspace_id
        AND actor.id = ${actorIdentityId}
        AND actor.membership_ended_at IS NULL
      INNER JOIN workspace_identities AS maintainer
        ON maintainer.workspace_id = channel.workspace_id
        AND maintainer.id = channel.maintainer_identity_id
      LEFT JOIN channel_memberships AS actor_membership
        ON actor_membership.workspace_id = channel.workspace_id
        AND actor_membership.channel_id = channel.id
        AND actor_membership.identity_id = actor.id
      WHERE channel.workspace_id = ${workspaceId}
        AND channel.visibility = 'public'
        AND (
          actor.role IN ('owner', 'admin', 'member')
          OR actor_membership.identity_id IS NOT NULL
        )
      ORDER BY "hasChannelMembership" DESC, lower(channel.name), channel.id
    `,
  });

  const readPublicChannelRow = SqlSchema.findOneOption({
    Request: IdentityChannelRequest,
    Result: PublicChannelRow,
    execute: ({ workspaceId, actorIdentityId, channelId }) => sql<PublicChannelRow>`
      SELECT
        channel.id,
        channel.workspace_id AS "workspaceId",
        channel.name,
        channel.purpose,
        channel.visibility,
        channel.maintainer_identity_id AS "maintainerIdentityId",
        maintainer.name AS "maintainerName",
        maintainer.avatar_url AS "maintainerAvatarUrl",
        actor_membership.identity_id IS NOT NULL AS "hasChannelMembership"
      FROM channels AS channel
      INNER JOIN workspace_identities AS actor
        ON actor.workspace_id = channel.workspace_id
        AND actor.id = ${actorIdentityId}
        AND actor.membership_ended_at IS NULL
      INNER JOIN workspace_identities AS maintainer
        ON maintainer.workspace_id = channel.workspace_id
        AND maintainer.id = channel.maintainer_identity_id
      LEFT JOIN channel_memberships AS actor_membership
        ON actor_membership.workspace_id = channel.workspace_id
        AND actor_membership.channel_id = channel.id
        AND actor_membership.identity_id = actor.id
      WHERE channel.workspace_id = ${workspaceId}
        AND channel.id = ${channelId}
        AND channel.visibility = 'public'
        AND (
          actor.role IN ('owner', 'admin', 'member')
          OR actor_membership.identity_id IS NOT NULL
        )
      LIMIT 1
    `,
  });

  const insertPublicChannel = SqlSchema.findOne({
    Request: CreatePublicChannelCommand,
    Result: Channel,
    execute: ({ channelId, workspaceId, name, purpose, maintainerIdentityId }) => sql<ChannelType>`
      INSERT INTO channels (
        id,
        workspace_id,
        name,
        purpose,
        visibility,
        maintainer_identity_id
      )
      VALUES (
        ${channelId},
        ${workspaceId},
        ${name},
        ${purpose},
        'public',
        ${maintainerIdentityId}
      )
      RETURNING
        id,
        workspace_id AS "workspaceId",
        name,
        purpose,
        visibility,
        maintainer_identity_id AS "maintainerIdentityId"
    `,
  });

  const createPublic = Effect.fn("PostgresChannelAccess.createPublic")(
    (command: CreatePublicChannelCommand) =>
      sql
        .withTransaction(
          Effect.gen(function* () {
            const actor = yield* lockActiveFullMemberIdentity({
              actorAccountId: command.actorAccountId,
              workspaceId: command.workspaceId,
            });
            if (Option.isNone(actor)) {
              return CreatePublicChannelPersistenceResult.cases.ActorUnavailable.make({});
            }

            const maintainer = yield* lockMaintainer({
              workspaceId: command.workspaceId,
              maintainerIdentityId: command.maintainerIdentityId,
            });
            if (Option.isNone(maintainer)) {
              return CreatePublicChannelPersistenceResult.cases.MaintainerUnavailable.make({});
            }

            const inserted = yield* insertPublicChannel(command);

            return CreatePublicChannelPersistenceResult.cases.Created.make({
              channel: PublicChannelView.make({
                channel: inserted,
                maintainer: maintainer.value,
                hasChannelMembership: false,
              }),
            });
          }),
        )
        .pipe(
          Effect.mapError((cause) =>
            persistenceFailure("ChannelAccessPersistence.createPublic", cause),
          ),
        ),
  );

  return ChannelAccessPersistence.of({
    listPublicForActor: Effect.fn("PostgresChannelAccess.listPublicForActor")(
      function* (actorAccountId, workspaceId) {
        const actor = yield* readActiveWorkspaceActor({ actorAccountId, workspaceId });
        if (Option.isNone(actor)) return undefined;
        const rows = yield* listPublicChannelRows({
          workspaceId,
          actorIdentityId: actor.value.id,
        });
        return rows.map(publicChannelViewFromRow);
      },
      (effect) =>
        effect.pipe(
          Effect.mapError((cause) =>
            persistenceFailure("ChannelAccessPersistence.listPublicForActor", cause),
          ),
        ),
    ),
    listMaintainersForActor: Effect.fn("PostgresChannelAccess.listMaintainersForActor")(
      function* (actorAccountId, workspaceId) {
        const actor = yield* readActiveWorkspaceActor({ actorAccountId, workspaceId });
        if (Option.isNone(actor)) return undefined;
        const rows = yield* listMaintainerRows({ actorAccountId, workspaceId });
        return rows.map((row) => ChannelMaintainerView.make(row));
      },
      (effect) =>
        effect.pipe(
          Effect.mapError((cause) =>
            persistenceFailure("ChannelAccessPersistence.listMaintainersForActor", cause),
          ),
        ),
    ),
    getPublicForActor: Effect.fn("PostgresChannelAccess.getPublicForActor")(
      function* (actorAccountId, workspaceId, channelId) {
        const actor = yield* readActiveWorkspaceActor({ actorAccountId, workspaceId });
        if (Option.isNone(actor)) return undefined;
        const row = yield* readPublicChannelRow({
          workspaceId,
          actorIdentityId: actor.value.id,
          channelId,
        });
        return Option.isSome(row) ? publicChannelViewFromRow(row.value) : undefined;
      },
      (effect) =>
        effect.pipe(
          Effect.mapError((cause) =>
            persistenceFailure("ChannelAccessPersistence.getPublicForActor", cause),
          ),
        ),
    ),
    createPublic,
    joinPublic: Effect.fn("PostgresChannelAccess.joinPublic")(
      (actorAccountId, workspaceId, channelId) =>
        sql
          .withTransaction(
            Effect.gen(function* () {
              const actor = yield* lockActiveFullMemberIdentity({ actorAccountId, workspaceId });
              if (Option.isNone(actor)) return undefined;
              const existing = yield* readPublicChannelRow({
                workspaceId,
                actorIdentityId: actor.value.id,
                channelId,
              });
              if (Option.isNone(existing)) return undefined;

              yield* sql`
              INSERT INTO channel_memberships (workspace_id, channel_id, identity_id)
              VALUES (${workspaceId}, ${channelId}, ${actor.value.id})
              ON CONFLICT DO NOTHING
            `;

              return PublicChannelView.make({
                ...publicChannelViewFromRow(existing.value),
                hasChannelMembership: true,
              });
            }),
          )
          .pipe(
            Effect.mapError((cause) =>
              persistenceFailure("ChannelAccessPersistence.joinPublic", cause),
            ),
          ),
    ),
  });
});

export const PostgresChannelAccessPersistence = Layer.effect(ChannelAccessPersistence, make);

export const PostgresChannelAccess = ChannelAccessLive.pipe(
  Layer.provide(PostgresChannelAccessPersistence),
);
