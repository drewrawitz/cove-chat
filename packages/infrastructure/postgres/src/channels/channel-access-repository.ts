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
  WorkspaceRole,
  type Channel as ChannelType,
} from "@cove/domain";
import { ChannelAccessRecord, ChannelAccessRepository, ChannelIdentityRecord } from "@cove/ports";
import { Effect, Layer, Option, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";
import { persistenceError } from "../persistence-error.ts";

const ActorWorkspaceRequest = Schema.Struct({
  actorAccountId: UserId,
  workspaceId: WorkspaceId,
});

const IdentityWorkspaceRequest = Schema.Struct({
  workspaceId: WorkspaceId,
  actorIdentityId: WorkspaceIdentityId,
});

const IdentityChannelRequest = Schema.Struct({
  ...IdentityWorkspaceRequest.fields,
  channelId: ChannelId,
});

const WorkspaceIdentityRequest = Schema.Struct({
  workspaceId: WorkspaceId,
  workspaceIdentityId: WorkspaceIdentityId,
});

const WorkspaceChannelRequest = Schema.Struct({
  workspaceId: WorkspaceId,
  channelId: ChannelId,
});

const ChannelRow = Schema.Struct({
  id: ChannelId,
  workspaceId: WorkspaceId,
  name: ChannelName,
  purpose: ChannelPurpose,
  visibility: Channel.fields.visibility,
  maintainerIdentityId: WorkspaceIdentityId,
  maintainerName: WorkspaceIdentityName,
  maintainerAvatarUrl: WorkspaceAvatarUrl,
  maintainerRole: WorkspaceRole,
  hasChannelMembership: Schema.Boolean,
});
interface ChannelRow extends Schema.Schema.Type<typeof ChannelRow> {}

const MembershipInsertResult = Schema.Struct({ inserted: Schema.Boolean });

function accessRecord(row: ChannelRow): ChannelAccessRecord {
  return ChannelAccessRecord.make({
    channel: Channel.make({
      id: row.id,
      workspaceId: row.workspaceId,
      name: row.name,
      purpose: row.purpose,
      visibility: row.visibility,
      maintainerIdentityId: row.maintainerIdentityId,
    }),
    maintainer: ChannelIdentityRecord.make({
      id: row.maintainerIdentityId,
      name: row.maintainerName,
      avatarUrl: row.maintainerAvatarUrl,
      role: row.maintainerRole,
    }),
    hasChannelMembership: row.hasChannelMembership,
  });
}

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const readActiveActor = SqlSchema.findOneOption({
    Request: ActorWorkspaceRequest,
    Result: ChannelIdentityRecord,
    execute: ({ actorAccountId, workspaceId }) => sql<ChannelIdentityRecord>`
      SELECT
        identity.id,
        identity.name,
        identity.avatar_url AS "avatarUrl",
        identity.role
      FROM workspace_identities AS identity
      WHERE identity.account_id = ${actorAccountId}
        AND identity.workspace_id = ${workspaceId}
        AND identity.membership_ended_at IS NULL
      LIMIT 1
    `,
  });

  const lockActiveActor = SqlSchema.findOneOption({
    Request: ActorWorkspaceRequest,
    Result: ChannelIdentityRecord,
    execute: ({ actorAccountId, workspaceId }) => sql<ChannelIdentityRecord>`
      SELECT
        identity.id,
        identity.name,
        identity.avatar_url AS "avatarUrl",
        identity.role
      FROM workspace_identities AS identity
      WHERE identity.account_id = ${actorAccountId}
        AND identity.workspace_id = ${workspaceId}
        AND identity.membership_ended_at IS NULL
      LIMIT 1
      FOR UPDATE
    `,
  });

  const lockActiveIdentity = SqlSchema.findOneOption({
    Request: WorkspaceIdentityRequest,
    Result: ChannelIdentityRecord,
    execute: ({ workspaceId, workspaceIdentityId }) => sql<ChannelIdentityRecord>`
      SELECT
        identity.id,
        identity.name,
        identity.avatar_url AS "avatarUrl",
        identity.role
      FROM workspace_identities AS identity
      WHERE identity.workspace_id = ${workspaceId}
        AND identity.id = ${workspaceIdentityId}
        AND identity.membership_ended_at IS NULL
      LIMIT 1
      FOR UPDATE
    `,
  });

  const listPublicRows = SqlSchema.findAll({
    Request: IdentityWorkspaceRequest,
    Result: ChannelRow,
    execute: ({ workspaceId, actorIdentityId }) => sql<ChannelRow>`
      SELECT
        channel.id,
        channel.workspace_id AS "workspaceId",
        channel.name,
        channel.purpose,
        channel.visibility,
        channel.maintainer_identity_id AS "maintainerIdentityId",
        maintainer.name AS "maintainerName",
        maintainer.avatar_url AS "maintainerAvatarUrl",
        maintainer.role AS "maintainerRole",
        actor_membership.identity_id IS NOT NULL AS "hasChannelMembership"
      FROM channels AS channel
      INNER JOIN workspace_identities AS maintainer
        ON maintainer.workspace_id = channel.workspace_id
        AND maintainer.id = channel.maintainer_identity_id
      LEFT JOIN channel_memberships AS actor_membership
        ON actor_membership.workspace_id = channel.workspace_id
        AND actor_membership.channel_id = channel.id
        AND actor_membership.identity_id = ${actorIdentityId}
      WHERE channel.workspace_id = ${workspaceId}
        AND channel.visibility = 'public'
      ORDER BY "hasChannelMembership" DESC, lower(channel.name), channel.id
    `,
  });

  const findChannelRow = SqlSchema.findOneOption({
    Request: IdentityChannelRequest,
    Result: ChannelRow,
    execute: ({ workspaceId, actorIdentityId, channelId }) => sql<ChannelRow>`
      SELECT
        channel.id,
        channel.workspace_id AS "workspaceId",
        channel.name,
        channel.purpose,
        channel.visibility,
        channel.maintainer_identity_id AS "maintainerIdentityId",
        maintainer.name AS "maintainerName",
        maintainer.avatar_url AS "maintainerAvatarUrl",
        maintainer.role AS "maintainerRole",
        actor_membership.identity_id IS NOT NULL AS "hasChannelMembership"
      FROM channels AS channel
      INNER JOIN workspace_identities AS maintainer
        ON maintainer.workspace_id = channel.workspace_id
        AND maintainer.id = channel.maintainer_identity_id
      LEFT JOIN channel_memberships AS actor_membership
        ON actor_membership.workspace_id = channel.workspace_id
        AND actor_membership.channel_id = channel.id
        AND actor_membership.identity_id = ${actorIdentityId}
      WHERE channel.workspace_id = ${workspaceId}
        AND channel.id = ${channelId}
      LIMIT 1
    `,
  });

  const listPrivateRows = SqlSchema.findAll({
    Request: IdentityWorkspaceRequest,
    Result: ChannelRow,
    execute: ({ workspaceId, actorIdentityId }) => sql<ChannelRow>`
      SELECT
        channel.id,
        channel.workspace_id AS "workspaceId",
        channel.name,
        channel.purpose,
        channel.visibility,
        channel.maintainer_identity_id AS "maintainerIdentityId",
        maintainer.name AS "maintainerName",
        maintainer.avatar_url AS "maintainerAvatarUrl",
        maintainer.role AS "maintainerRole",
        actor_membership.identity_id IS NOT NULL AS "hasChannelMembership"
      FROM channels AS channel
      INNER JOIN workspace_identities AS maintainer
        ON maintainer.workspace_id = channel.workspace_id
        AND maintainer.id = channel.maintainer_identity_id
      LEFT JOIN channel_memberships AS actor_membership
        ON actor_membership.workspace_id = channel.workspace_id
        AND actor_membership.channel_id = channel.id
        AND actor_membership.identity_id = ${actorIdentityId}
      WHERE channel.workspace_id = ${workspaceId}
        AND channel.visibility = 'private'
      ORDER BY lower(channel.name), channel.id
    `,
  });

  const listMembers = SqlSchema.findAll({
    Request: WorkspaceChannelRequest,
    Result: ChannelIdentityRecord,
    execute: ({ workspaceId, channelId }) => sql<ChannelIdentityRecord>`
      SELECT
        identity.id,
        identity.name,
        identity.avatar_url AS "avatarUrl",
        identity.role
      FROM channel_memberships AS membership
      INNER JOIN workspace_identities AS identity
        ON identity.workspace_id = membership.workspace_id
        AND identity.id = membership.identity_id
        AND identity.membership_ended_at IS NULL
      WHERE membership.workspace_id = ${workspaceId}
        AND membership.channel_id = ${channelId}
      ORDER BY membership.created_at, identity.id
    `,
  });

  const listMemberCandidates = SqlSchema.findAll({
    Request: WorkspaceChannelRequest,
    Result: ChannelIdentityRecord,
    execute: ({ workspaceId, channelId }) => sql<ChannelIdentityRecord>`
      SELECT
        identity.id,
        identity.name,
        identity.avatar_url AS "avatarUrl",
        identity.role
      FROM workspace_identities AS identity
      LEFT JOIN channel_memberships AS membership
        ON membership.workspace_id = identity.workspace_id
        AND membership.identity_id = identity.id
        AND membership.channel_id = ${channelId}
      WHERE identity.workspace_id = ${workspaceId}
        AND identity.membership_ended_at IS NULL
        AND membership.identity_id IS NULL
      ORDER BY lower(identity.name), identity.id
    `,
  });

  const insertChannel = SqlSchema.findOne({
    Request: Channel,
    Result: Channel,
    execute: (channel) => sql<ChannelType>`
      INSERT INTO channels (
        id,
        workspace_id,
        name,
        purpose,
        visibility,
        maintainer_identity_id
      )
      VALUES (
        ${channel.id},
        ${channel.workspaceId},
        ${channel.name},
        ${channel.purpose},
        ${channel.visibility},
        ${channel.maintainerIdentityId}
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

  const addMembership = SqlSchema.findOne({
    Request: Schema.Struct({
      workspaceId: WorkspaceId,
      channelId: ChannelId,
      workspaceIdentityId: WorkspaceIdentityId,
    }),
    Result: MembershipInsertResult,
    execute: ({ workspaceId, channelId, workspaceIdentityId }) => sql`
      WITH inserted AS (
        INSERT INTO channel_memberships (workspace_id, channel_id, identity_id)
        VALUES (${workspaceId}, ${channelId}, ${workspaceIdentityId})
        ON CONFLICT DO NOTHING
        RETURNING 1
      )
      SELECT EXISTS (SELECT 1 FROM inserted) AS inserted
    `,
  });

  const mapFailure = <A, E, R>(operation: string, effect: Effect.Effect<A, E, R>) =>
    effect.pipe(Effect.mapError((cause) => persistenceError(operation, cause)));

  return ChannelAccessRepository.of({
    readActiveActor: Effect.fn("PostgresChannelAccessRepository.readActiveActor")(
      (actorAccountId, workspaceId) =>
        readActiveActor({ actorAccountId, workspaceId }).pipe(Effect.map(Option.getOrUndefined)),
      (effect) => mapFailure("ChannelAccessRepository.readActiveActor", effect),
    ),
    lockActiveActor: Effect.fn("PostgresChannelAccessRepository.lockActiveActor")(
      (actorAccountId, workspaceId) =>
        lockActiveActor({ actorAccountId, workspaceId }).pipe(Effect.map(Option.getOrUndefined)),
      (effect) => mapFailure("ChannelAccessRepository.lockActiveActor", effect),
    ),
    lockActiveIdentity: Effect.fn("PostgresChannelAccessRepository.lockActiveIdentity")(
      (workspaceId, workspaceIdentityId) =>
        lockActiveIdentity({ workspaceId, workspaceIdentityId }).pipe(
          Effect.map(Option.getOrUndefined),
        ),
      (effect) => mapFailure("ChannelAccessRepository.lockActiveIdentity", effect),
    ),
    listPublic: Effect.fn("PostgresChannelAccessRepository.listPublic")(
      (workspaceId, actorIdentityId) =>
        listPublicRows({ workspaceId, actorIdentityId }).pipe(
          Effect.map((rows) => rows.map(accessRecord)),
        ),
      (effect) => mapFailure("ChannelAccessRepository.listPublic", effect),
    ),
    findById: Effect.fn("PostgresChannelAccessRepository.findById")(
      (workspaceId, actorIdentityId, channelId) =>
        findChannelRow({ workspaceId, actorIdentityId, channelId }).pipe(
          Effect.map(Option.map(accessRecord)),
          Effect.map(Option.getOrUndefined),
        ),
      (effect) => mapFailure("ChannelAccessRepository.findById", effect),
    ),
    listPrivate: Effect.fn("PostgresChannelAccessRepository.listPrivate")(
      (workspaceId, actorIdentityId) =>
        listPrivateRows({ workspaceId, actorIdentityId }).pipe(
          Effect.map((rows) => rows.map(accessRecord)),
        ),
      (effect) => mapFailure("ChannelAccessRepository.listPrivate", effect),
    ),
    listMembers: Effect.fn("PostgresChannelAccessRepository.listMembers")(
      (workspaceId, channelId) => listMembers({ workspaceId, channelId }),
      (effect) => mapFailure("ChannelAccessRepository.listMembers", effect),
    ),
    listMemberCandidates: Effect.fn("PostgresChannelAccessRepository.listMemberCandidates")(
      (workspaceId, channelId) => listMemberCandidates({ workspaceId, channelId }),
      (effect) => mapFailure("ChannelAccessRepository.listMemberCandidates", effect),
    ),
    insert: Effect.fn("PostgresChannelAccessRepository.insert")(
      (channel) => insertChannel(channel).pipe(Effect.asVoid),
      (effect) => mapFailure("ChannelAccessRepository.insert", effect),
    ),
    addMembership: Effect.fn("PostgresChannelAccessRepository.addMembership")(
      (workspaceId, channelId, workspaceIdentityId) =>
        addMembership({ workspaceId, channelId, workspaceIdentityId }).pipe(
          Effect.map((result) => result.inserted),
        ),
      (effect) => mapFailure("ChannelAccessRepository.addMembership", effect),
    ),
  });
});

export const PostgresChannelAccessRepository = Layer.effect(ChannelAccessRepository, make);
