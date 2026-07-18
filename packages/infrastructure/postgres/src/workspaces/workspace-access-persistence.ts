import {
  WorkspaceAccessLive,
  WorkspaceAccess,
  WorkspaceAccessCommandKind,
  WorkspaceAccessPersistence,
  WorkspaceAccessPersistenceFailure,
  type CommittedWorkspaceAccessCommand,
  type WorkspaceAccessAuditEvent,
  type WorkspaceAccessTransaction,
  type WorkspaceAccessView,
} from "@cove/application/workspaces/internal";
import {
  UserId,
  WorkspaceAvatarUrl,
  WorkspaceId,
  WorkspaceIdentity,
  WorkspaceIdentityId,
  WorkspaceIdentityName,
  WorkspaceMembership,
  WorkspaceName,
  WorkspaceRole,
} from "@cove/domain";
import { Effect, Layer, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";

const AccountRequest = Schema.Struct({ actorAccountId: UserId });
const WorkspaceRequest = Schema.Struct({ actorAccountId: UserId, workspaceId: WorkspaceId });
const WorkspaceIdRequest = Schema.Struct({ workspaceId: WorkspaceId });
const CommandRequest = Schema.Struct({
  actorAccountId: UserId,
  commandId: Schema.String,
});

const WorkspaceAccessRow = Schema.Struct({
  workspaceId: WorkspaceId,
  workspaceName: WorkspaceName,
  identityId: WorkspaceIdentityId,
  actorAccountId: UserId,
  identityName: WorkspaceIdentityName,
  avatarUrl: WorkspaceAvatarUrl,
  role: WorkspaceRole,
  membershipStartedAt: Schema.Date,
});
interface WorkspaceAccessRow extends Schema.Schema.Type<typeof WorkspaceAccessRow> {}

const CommittedCommandRow = Schema.Struct({
  commandKind: WorkspaceAccessCommandKind,
  inputFingerprint: Schema.String,
  outcomeVersion: Schema.Number,
  outcome: Schema.Unknown,
});

const IdentityMembershipFactsRow = Schema.Struct({
  workspaceId: WorkspaceId,
  workspaceName: WorkspaceName,
  identityId: Schema.NullOr(WorkspaceIdentityId),
  actorAccountId: Schema.NullOr(UserId),
  identityName: Schema.NullOr(WorkspaceIdentityName),
  avatarUrl: Schema.NullOr(WorkspaceAvatarUrl),
  role: Schema.NullOr(WorkspaceRole),
  membershipStartedAt: Schema.NullOr(Schema.Date),
  membershipEndedAt: Schema.NullOr(Schema.Date),
});
interface IdentityMembershipFactsRow extends Schema.Schema.Type<
  typeof IdentityMembershipFactsRow
> {}

const WorkspaceTransitionFactsRow = IdentityMembershipFactsRow.pipe(
  Schema.fieldsAssign({ activeOwnerCount: Schema.Number }),
);
interface WorkspaceTransitionFactsRow extends Schema.Schema.Type<
  typeof WorkspaceTransitionFactsRow
> {}

const LockedWorkspaceRow = Schema.Struct({ workspaceId: WorkspaceId });

const persistenceFailure = (
  operation: string,
  cause: unknown,
  retryable = false,
): WorkspaceAccessPersistenceFailure =>
  new WorkspaceAccessPersistenceFailure({ operation, cause, retryable });

const accessFromRow = (row: WorkspaceAccessRow): WorkspaceAccessView => ({
  workspace: {
    id: row.workspaceId,
    name: row.workspaceName,
  },
  identity: {
    id: row.identityId,
    workspaceId: row.workspaceId,
    accountId: row.actorAccountId,
    name: row.identityName,
    avatarUrl: row.avatarUrl,
  },
  membership: WorkspaceMembership.make({
    workspaceId: row.workspaceId,
    identityId: row.identityId,
    role: row.role,
    startedAt: row.membershipStartedAt,
  }),
});

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const readActiveAccessRow = SqlSchema.findOneOption({
    Request: WorkspaceRequest,
    Result: WorkspaceAccessRow,
    execute: ({ actorAccountId, workspaceId }) => sql<WorkspaceAccessRow>`
      SELECT
        workspace.id AS "workspaceId",
        workspace.name AS "workspaceName",
        identity.id AS "identityId",
        identity.account_id AS "actorAccountId",
        identity.name AS "identityName",
        identity.avatar_url AS "avatarUrl",
        identity.role,
        identity.membership_started_at AS "membershipStartedAt"
      FROM workspace_identities AS identity
      INNER JOIN workspaces AS workspace
        ON workspace.id = identity.workspace_id
      WHERE identity.account_id = ${actorAccountId}
        AND workspace.id = ${workspaceId}
        AND identity.membership_ended_at IS NULL
      LIMIT 1
    `,
  });

  const listActiveAccessRows = SqlSchema.findAll({
    Request: AccountRequest,
    Result: WorkspaceAccessRow,
    execute: ({ actorAccountId }) => sql<WorkspaceAccessRow>`
      SELECT
        workspace.id AS "workspaceId",
        workspace.name AS "workspaceName",
        identity.id AS "identityId",
        identity.account_id AS "actorAccountId",
        identity.name AS "identityName",
        identity.avatar_url AS "avatarUrl",
        identity.role,
        identity.membership_started_at AS "membershipStartedAt"
      FROM workspace_identities AS identity
      INNER JOIN workspaces AS workspace
        ON workspace.id = identity.workspace_id
      WHERE identity.account_id = ${actorAccountId}
        AND identity.membership_ended_at IS NULL
      ORDER BY lower(workspace.name), workspace.id
    `,
  });

  const inspectCommittedCommandRow = SqlSchema.findOneOption({
    Request: CommandRequest,
    Result: CommittedCommandRow,
    execute: ({ actorAccountId, commandId }) => sql`
      SELECT
        command_kind AS "commandKind",
        input_fingerprint AS "inputFingerprint",
        outcome_version AS "outcomeVersion",
        outcome
      FROM workspace_access_commands
      WHERE actor_user_id = ${actorAccountId}
        AND command_id = ${commandId}
      LIMIT 1
    `,
  });

  const identityMembershipFactsRow = SqlSchema.findOneOption({
    Request: WorkspaceRequest,
    Result: IdentityMembershipFactsRow,
    execute: ({ actorAccountId, workspaceId }) => sql`
      SELECT
        workspace.id AS "workspaceId",
        workspace.name AS "workspaceName",
        identity.id AS "identityId",
        identity.account_id AS "actorAccountId",
        identity.name AS "identityName",
        identity.avatar_url AS "avatarUrl",
        identity.role,
        identity.membership_started_at AS "membershipStartedAt",
        identity.membership_ended_at AS "membershipEndedAt"
      FROM workspaces AS workspace
      LEFT JOIN workspace_identities AS identity
        ON identity.workspace_id = workspace.id
        AND identity.account_id = ${actorAccountId}
      WHERE workspace.id = ${workspaceId}
      LIMIT 1
    `,
  });

  const workspaceTransitionFactsRow = SqlSchema.findOneOption({
    Request: WorkspaceRequest,
    Result: WorkspaceTransitionFactsRow,
    execute: ({ actorAccountId, workspaceId }) => sql`
      SELECT
        workspace.id AS "workspaceId",
        workspace.name AS "workspaceName",
        identity.id AS "identityId",
        identity.account_id AS "actorAccountId",
        identity.name AS "identityName",
        identity.avatar_url AS "avatarUrl",
        identity.role,
        identity.membership_started_at AS "membershipStartedAt",
        identity.membership_ended_at AS "membershipEndedAt",
        (
          SELECT COUNT(*)::int
          FROM workspace_identities AS owner_identity
          WHERE owner_identity.workspace_id = workspace.id
            AND owner_identity.membership_ended_at IS NULL
            AND owner_identity.role = 'owner'
        ) AS "activeOwnerCount"
      FROM workspaces AS workspace
      LEFT JOIN workspace_identities AS identity
        ON identity.workspace_id = workspace.id
        AND identity.account_id = ${actorAccountId}
      WHERE workspace.id = ${workspaceId}
      LIMIT 1
    `,
  });

  const lockWorkspaceRow = SqlSchema.findOneOption({
    Request: WorkspaceIdRequest,
    Result: LockedWorkspaceRow,
    execute: ({ workspaceId }) => sql`
      SELECT id AS "workspaceId"
      FROM workspaces
      WHERE id = ${workspaceId}
      FOR UPDATE
    `,
  });

  const factsFromRow = (row: IdentityMembershipFactsRow) => {
    const workspace = {
      id: row.workspaceId,
      name: row.workspaceName,
    };
    if (
      row.identityId === null ||
      row.actorAccountId === null ||
      row.identityName === null ||
      row.avatarUrl === null ||
      row.role === null ||
      row.membershipStartedAt === null
    ) {
      return { workspace, identity: undefined, membership: undefined };
    }
    const identity = WorkspaceIdentity.make({
      id: row.identityId,
      workspaceId: row.workspaceId,
      accountId: row.actorAccountId,
      name: row.identityName,
      avatarUrl: row.avatarUrl,
    });
    const membership =
      row.membershipEndedAt === null
        ? WorkspaceMembership.make({
            workspaceId: row.workspaceId,
            identityId: row.identityId,
            role: row.role,
            startedAt: row.membershipStartedAt,
          })
        : undefined;
    return { workspace, identity, membership };
  };

  const inspectCommittedCommand: WorkspaceAccessTransaction["inspectCommittedCommand"] = Effect.fn(
    "PostgresWorkspaceAccess.inspectCommittedCommand",
  )(function* (actorAccountId, commandId) {
    yield* sql`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${JSON.stringify([actorAccountId, commandId])}, 918273)
        )
      `.pipe(
      Effect.asVoid,
      Effect.mapError((cause) =>
        persistenceFailure("WorkspaceAccess.inspectCommittedCommand.lock", cause, true),
      ),
    );
    const row = yield* inspectCommittedCommandRow({ actorAccountId, commandId }).pipe(
      Effect.mapError((cause) =>
        persistenceFailure("WorkspaceAccess.inspectCommittedCommand.read", cause),
      ),
    );
    if (row._tag === "None") return undefined;
    if (row.value.outcomeVersion !== 1) {
      return yield* Effect.fail(
        persistenceFailure(
          "WorkspaceAccess.inspectCommittedCommand.outcomeVersion",
          row.value.outcomeVersion,
        ),
      );
    }
    return {
      commandKind: row.value.commandKind,
      inputFingerprint: row.value.inputFingerprint,
      outcomeVersion: 1,
      outcome: row.value.outcome,
    } satisfies CommittedWorkspaceAccessCommand;
  });

  const lockAccountWorkspaceRelationship = Effect.fn(
    "PostgresWorkspaceAccess.lockAccountWorkspaceRelationship",
  )(function* (actorAccountId: UserId, workspaceId: WorkspaceId) {
    yield* sql`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${JSON.stringify([actorAccountId, workspaceId])}, 817263)
      )
    `.pipe(
      Effect.asVoid,
      Effect.mapError((cause) =>
        persistenceFailure("WorkspaceAccess.lockAccountWorkspaceRelationship", cause, true),
      ),
    );
  });

  const transaction: WorkspaceAccessTransaction = {
    inspectCommittedCommand,
    serializeWorkspaceTransition: Effect.fn("PostgresWorkspaceAccess.serializeWorkspaceTransition")(
      function* (actorAccountId, workspaceId) {
        yield* lockAccountWorkspaceRelationship(actorAccountId, workspaceId);
        const locked = yield* lockWorkspaceRow({ workspaceId }).pipe(
          Effect.mapError((cause) =>
            persistenceFailure("WorkspaceAccess.serializeWorkspaceTransition.lock", cause, true),
          ),
        );
        if (locked._tag === "None") {
          return {
            workspace: undefined,
            identity: undefined,
            membership: undefined,
            activeOwnerCount: 0,
          };
        }
        const row = yield* workspaceTransitionFactsRow({ actorAccountId, workspaceId }).pipe(
          Effect.mapError((cause) =>
            persistenceFailure("WorkspaceAccess.serializeWorkspaceTransition.read", cause, true),
          ),
        );
        return row._tag === "Some"
          ? { ...factsFromRow(row.value), activeOwnerCount: row.value.activeOwnerCount }
          : {
              workspace: undefined,
              identity: undefined,
              membership: undefined,
              activeOwnerCount: 0,
            };
      },
    ),
    serializeAccountWorkspaceRelationship: Effect.fn(
      "PostgresWorkspaceAccess.serializeAccountWorkspaceRelationship",
    )(function* (actorAccountId, workspaceId) {
      yield* lockAccountWorkspaceRelationship(actorAccountId, workspaceId);
      const row = yield* identityMembershipFactsRow({ actorAccountId, workspaceId }).pipe(
        Effect.mapError((cause) =>
          persistenceFailure("WorkspaceAccess.serializeAccountWorkspaceRelationship.read", cause),
        ),
      );
      if (row._tag === "None") {
        return { workspace: undefined, identity: undefined, membership: undefined };
      }
      return factsFromRow(row.value);
    }),
    createWorkspaceWithOwner: Effect.fn("PostgresWorkspaceAccess.createWorkspaceWithOwner")(
      (access) =>
        sql`
          WITH created_workspace AS (
            INSERT INTO workspaces (id, name)
            VALUES (${access.workspace.id}, ${access.workspace.name})
          )
          INSERT INTO workspace_identities (
            id,
            workspace_id,
            account_id,
            name,
            avatar_url,
            role,
            membership_started_at,
            membership_ended_at
          )
          VALUES (
            ${access.identity.id},
            ${access.workspace.id},
            ${access.identity.accountId},
            ${access.identity.name},
            ${access.identity.avatarUrl},
            ${access.membership.role},
            ${access.membership.startedAt},
            NULL
          )
        `.pipe(
          Effect.asVoid,
          Effect.mapError((cause) =>
            persistenceFailure("WorkspaceAccess.createWorkspaceWithOwner", cause),
          ),
        ),
    ),
    startFirstMembership: Effect.fn("PostgresWorkspaceAccess.startFirstMembership")((access) =>
      sql`
        INSERT INTO workspace_identities (
          id,
          workspace_id,
          account_id,
          name,
          avatar_url,
          role,
          membership_started_at,
          membership_ended_at
        )
        VALUES (
          ${access.identity.id},
          ${access.workspace.id},
          ${access.identity.accountId},
          ${access.identity.name},
          ${access.identity.avatarUrl},
          ${access.membership.role},
          ${access.membership.startedAt},
          NULL
        )
      `.pipe(
        Effect.asVoid,
        Effect.mapError((cause) =>
          persistenceFailure("WorkspaceAccess.startFirstMembership", cause),
        ),
      ),
    ),
    reactivateMembership: Effect.fn("PostgresWorkspaceAccess.reactivateMembership")(
      (identity, membership) =>
        sql`
          UPDATE workspace_identities
          SET
            role = ${membership.role},
            membership_started_at = ${membership.startedAt},
            membership_ended_at = NULL
          WHERE workspace_id = ${identity.workspaceId}
            AND id = ${identity.id}
            AND account_id = ${identity.accountId}
        `.pipe(
          Effect.asVoid,
          Effect.mapError((cause) =>
            persistenceFailure("WorkspaceAccess.reactivateMembership", cause),
          ),
        ),
    ),
    updateActiveIdentity: Effect.fn("PostgresWorkspaceAccess.updateActiveIdentity")(
      (actorAccountId, workspaceId, profile) =>
        sql`
          UPDATE workspace_identities
          SET
            name = ${profile.name},
            avatar_url = ${profile.avatarUrl}
          WHERE workspace_id = ${workspaceId}
            AND account_id = ${actorAccountId}
            AND membership_ended_at IS NULL
        `.pipe(
          Effect.asVoid,
          Effect.mapError((cause) =>
            persistenceFailure("WorkspaceAccess.updateActiveIdentity", cause),
          ),
        ),
    ),
    endMembershipAndRevokeChannels: Effect.fn(
      "PostgresWorkspaceAccess.endMembershipAndRevokeChannels",
    )((actorAccountId, workspaceId, endedAt) =>
      sql`
        WITH ended_membership AS (
          UPDATE workspace_identities
          SET membership_ended_at = ${endedAt}
          WHERE workspace_id = ${workspaceId}
            AND account_id = ${actorAccountId}
            AND membership_ended_at IS NULL
          RETURNING workspace_id, id
        )
        DELETE FROM channel_memberships AS channel_membership
        USING ended_membership
        WHERE channel_membership.workspace_id = ended_membership.workspace_id
          AND channel_membership.identity_id = ended_membership.id
      `.pipe(
        Effect.asVoid,
        Effect.mapError((cause) =>
          persistenceFailure("WorkspaceAccess.endMembershipAndRevokeChannels", cause),
        ),
      ),
    ),
    appendAudit: Effect.fn("PostgresWorkspaceAccess.appendAudit")(
      (event: WorkspaceAccessAuditEvent) =>
        sql`
          INSERT INTO audit_events (
            id,
            event_type,
            event_version,
            actor_user_id,
            occurred_at,
            metadata
          )
          VALUES (
            ${event.id},
            ${event.type},
            ${event.version},
            ${event.actorAccountId},
            ${event.occurredAt},
            ${JSON.stringify(event.metadata)}::jsonb
          )
        `.pipe(
          Effect.asVoid,
          Effect.mapError((cause) => persistenceFailure("WorkspaceAccess.appendAudit", cause)),
        ),
    ),
    storeCommittedOutcome: Effect.fn("PostgresWorkspaceAccess.storeCommittedOutcome")((record) =>
      sql`
          INSERT INTO workspace_access_commands (
            actor_user_id,
            command_id,
            command_kind,
            input_fingerprint,
            outcome_version,
            outcome,
            committed_at
          )
          VALUES (
            ${record.actorAccountId},
            ${record.commandId},
            ${record.commandKind},
            ${record.inputFingerprint},
            ${record.outcomeVersion},
            ${JSON.stringify(record.outcome)}::jsonb,
            ${record.committedAt}
          )
        `.pipe(
        Effect.asVoid,
        Effect.mapError((cause) =>
          persistenceFailure("WorkspaceAccess.storeCommittedOutcome", cause),
        ),
      ),
    ),
  };

  return WorkspaceAccessPersistence.of({
    readActiveAccess: Effect.fn("PostgresWorkspaceAccess.readActiveAccess")(
      (actorAccountId, workspaceId) =>
        readActiveAccessRow({ actorAccountId, workspaceId }).pipe(
          Effect.map((row) => (row._tag === "Some" ? accessFromRow(row.value) : undefined)),
          Effect.mapError((cause) => persistenceFailure("WorkspaceAccess.readActiveAccess", cause)),
        ),
    ),
    listActiveAccess: Effect.fn("PostgresWorkspaceAccess.listActiveAccess")((actorAccountId) =>
      listActiveAccessRows({ actorAccountId }).pipe(
        Effect.map((rows) => rows.map(accessFromRow)),
        Effect.mapError((cause) => persistenceFailure("WorkspaceAccess.listActiveAccess", cause)),
      ),
    ),
    transact: (use) =>
      sql
        .withTransaction(use(transaction))
        .pipe(
          Effect.catchTag("SqlError", (cause) =>
            Effect.fail(persistenceFailure("WorkspaceAccess.transact", cause, true)),
          ),
        ),
  });
});

export const PostgresWorkspaceAccessPersistence: Layer.Layer<
  WorkspaceAccessPersistence,
  never,
  SqlClient.SqlClient
> = Layer.effect(WorkspaceAccessPersistence, make);

export const PostgresWorkspaceAccess: Layer.Layer<WorkspaceAccess, never, SqlClient.SqlClient> =
  WorkspaceAccessLive.pipe(Layer.provide(PostgresWorkspaceAccessPersistence));
