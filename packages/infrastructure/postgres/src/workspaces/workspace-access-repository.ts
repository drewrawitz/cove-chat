import {
  UserId,
  WorkspaceAccess,
  WorkspaceAvatarUrl,
  WorkspaceId,
  WorkspaceIdentity,
  WorkspaceIdentityId,
  WorkspaceIdentityName,
  WorkspaceIdentityProfile,
  WorkspaceName,
  WorkspaceRole,
  type WorkspaceAccess as WorkspaceAccessType,
} from "@cove/domain";
import { WorkspaceAccessRepository } from "@cove/ports";
import { Effect, Layer, Option, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";
import { persistenceError } from "../persistence-error.ts";

const AccountRequest = Schema.Struct({ accountId: UserId });
const WorkspaceRequest = Schema.Struct({ accountId: UserId, workspaceId: WorkspaceId });
const EndMembershipRequest = WorkspaceRequest.pipe(Schema.fieldsAssign({ endedAt: Schema.Date }));
const UpdateIdentityRequest = WorkspaceRequest.pipe(
  Schema.fieldsAssign(WorkspaceIdentityProfile.fields),
);

const WorkspaceAccessRow = Schema.Struct({
  workspaceId: WorkspaceId,
  workspaceName: WorkspaceName,
  identityId: WorkspaceIdentityId,
  accountId: UserId,
  identityName: WorkspaceIdentityName,
  avatarUrl: WorkspaceAvatarUrl,
  role: WorkspaceRole,
});
interface WorkspaceAccessRow extends Schema.Schema.Type<typeof WorkspaceAccessRow> {}

const EndMembershipResult = Schema.Struct({
  result: Schema.Literals(["ended", "last-owner", "not-found"]),
});

const accessFromRow = (row: WorkspaceAccessRow): WorkspaceAccessType =>
  WorkspaceAccess.make({
    workspace: {
      id: row.workspaceId,
      name: row.workspaceName,
    },
    identity: {
      id: row.identityId,
      workspaceId: row.workspaceId,
      accountId: row.accountId,
      name: row.identityName,
      avatarUrl: row.avatarUrl,
    },
    role: row.role,
  });

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const createWorkspaceRow = SqlSchema.findOne({
    Request: WorkspaceAccess,
    Result: WorkspaceAccessRow,
    execute: ({ identity, workspace }) => sql<WorkspaceAccessRow>`
      WITH created_workspace AS (
        INSERT INTO workspaces (id, name)
        VALUES (${workspace.id}, ${workspace.name})
        RETURNING id, name
      ), created_identity AS (
        INSERT INTO workspace_identities (
          id,
          workspace_id,
          account_id,
          name,
          avatar_url,
          role
        )
        SELECT
          ${identity.id},
          created_workspace.id,
          ${identity.accountId},
          ${identity.name},
          ${identity.avatarUrl},
          'owner'
        FROM created_workspace
        RETURNING id, workspace_id, account_id, name, avatar_url, role
      )
      SELECT
        created_workspace.id AS "workspaceId",
        created_workspace.name AS "workspaceName",
        created_identity.id AS "identityId",
        created_identity.account_id AS "accountId",
        created_identity.name AS "identityName",
        created_identity.avatar_url AS "avatarUrl",
        created_identity.role
      FROM created_workspace
      CROSS JOIN created_identity
    `,
  });

  const joinWorkspaceRow = SqlSchema.findOneOption({
    Request: WorkspaceIdentity,
    Result: WorkspaceAccessRow,
    execute: (identity) => sql<WorkspaceAccessRow>`
      WITH joined_identity AS (
        INSERT INTO workspace_identities (
          id,
          workspace_id,
          account_id,
          name,
          avatar_url,
          role
        )
        SELECT
          ${identity.id},
          workspace.id,
          ${identity.accountId},
          ${identity.name},
          ${identity.avatarUrl},
          'member'
        FROM workspaces AS workspace
        WHERE workspace.id = ${identity.workspaceId}
        RETURNING id, workspace_id, account_id, name, avatar_url, role
      )
      SELECT
        workspace.id AS "workspaceId",
        workspace.name AS "workspaceName",
        joined_identity.id AS "identityId",
        joined_identity.account_id AS "accountId",
        joined_identity.name AS "identityName",
        joined_identity.avatar_url AS "avatarUrl",
        joined_identity.role
      FROM joined_identity
      INNER JOIN workspaces AS workspace
        ON workspace.id = joined_identity.workspace_id
      LIMIT 1
    `,
  });

  const listRows = SqlSchema.findAll({
    Request: AccountRequest,
    Result: WorkspaceAccessRow,
    execute: ({ accountId }) => sql<WorkspaceAccessRow>`
      SELECT
        workspace.id AS "workspaceId",
        workspace.name AS "workspaceName",
        identity.id AS "identityId",
        identity.account_id AS "accountId",
        identity.name AS "identityName",
        identity.avatar_url AS "avatarUrl",
        identity.role
      FROM workspace_identities AS identity
      INNER JOIN workspaces AS workspace
        ON workspace.id = identity.workspace_id
      WHERE identity.account_id = ${accountId}
        AND identity.membership_ended_at IS NULL
      ORDER BY lower(workspace.name), workspace.id
    `,
  });

  const findRow = SqlSchema.findOneOption({
    Request: WorkspaceRequest,
    Result: WorkspaceAccessRow,
    execute: ({ accountId, workspaceId }) => sql<WorkspaceAccessRow>`
      SELECT
        workspace.id AS "workspaceId",
        workspace.name AS "workspaceName",
        identity.id AS "identityId",
        identity.account_id AS "accountId",
        identity.name AS "identityName",
        identity.avatar_url AS "avatarUrl",
        identity.role
      FROM workspace_identities AS identity
      INNER JOIN workspaces AS workspace
        ON workspace.id = identity.workspace_id
      WHERE identity.account_id = ${accountId}
        AND workspace.id = ${workspaceId}
        AND identity.membership_ended_at IS NULL
      LIMIT 1
    `,
  });

  const findIdentity = SqlSchema.findOneOption({
    Request: WorkspaceRequest,
    Result: WorkspaceIdentity,
    execute: ({ accountId, workspaceId }) => sql`
      SELECT
        id,
        workspace_id AS "workspaceId",
        account_id AS "accountId",
        name,
        avatar_url AS "avatarUrl"
      FROM workspace_identities
      WHERE workspace_id = ${workspaceId}
        AND account_id = ${accountId}
      LIMIT 1
    `,
  });

  const updateIdentityRow = SqlSchema.findOneOption({
    Request: UpdateIdentityRequest,
    Result: WorkspaceAccessRow,
    execute: ({ accountId, avatarUrl, name, workspaceId }) => sql<WorkspaceAccessRow>`
      WITH updated_identity AS (
        UPDATE workspace_identities AS identity
        SET
          name = ${name},
          avatar_url = ${avatarUrl}
        WHERE identity.workspace_id = ${workspaceId}
          AND identity.account_id = ${accountId}
          AND identity.membership_ended_at IS NULL
        RETURNING id, workspace_id, account_id, name, avatar_url, role
      )
      SELECT
        workspace.id AS "workspaceId",
        workspace.name AS "workspaceName",
        updated_identity.id AS "identityId",
        updated_identity.account_id AS "accountId",
        updated_identity.name AS "identityName",
        updated_identity.avatar_url AS "avatarUrl",
        updated_identity.role
      FROM updated_identity
      INNER JOIN workspaces AS workspace
        ON workspace.id = updated_identity.workspace_id
      LIMIT 1
    `,
  });

  const endMembership = SqlSchema.findOne({
    Request: EndMembershipRequest,
    Result: EndMembershipResult,
    execute: ({ accountId, endedAt, workspaceId }) => sql`
      WITH locked_identities AS MATERIALIZED (
        SELECT identity.id, identity.account_id, identity.role
        FROM workspace_identities AS identity
        WHERE identity.workspace_id = ${workspaceId}
          AND identity.membership_ended_at IS NULL
        ORDER BY identity.id
        FOR UPDATE
      ), target_identity AS (
        SELECT locked_identity.id, locked_identity.role
        FROM locked_identities AS locked_identity
        WHERE locked_identity.account_id = ${accountId}
      ), ended_membership AS (
        UPDATE workspace_identities AS identity
        SET membership_ended_at = ${endedAt}
        FROM target_identity
        WHERE identity.workspace_id = ${workspaceId}
          AND identity.id = target_identity.id
          AND (
            target_identity.role <> 'owner'
            OR EXISTS (
              SELECT 1
              FROM locked_identities AS other_identity
              WHERE other_identity.role = 'owner'
                AND other_identity.id <> target_identity.id
            )
          )
        RETURNING identity.workspace_id, identity.id
      ), removed_channel_memberships AS (
        DELETE FROM channel_memberships AS channel_membership
        USING ended_membership
        WHERE channel_membership.workspace_id = ended_membership.workspace_id
          AND channel_membership.identity_id = ended_membership.id
      )
      SELECT CASE
        WHEN EXISTS(SELECT 1 FROM ended_membership) THEN 'ended'
        WHEN EXISTS(
          SELECT 1
          FROM target_identity
          WHERE role = 'owner'
        ) THEN 'last-owner'
        ELSE 'not-found'
      END AS result
    `,
  });

  return WorkspaceAccessRepository.of({
    createWorkspace: Effect.fn("PostgresWorkspaceAccessRepository.createWorkspace")((access) =>
      createWorkspaceRow(access).pipe(
        Effect.map(accessFromRow),
        Effect.mapError((cause) =>
          persistenceError("WorkspaceAccessRepository.createWorkspace", cause),
        ),
      ),
    ),
    joinWorkspace: Effect.fn("PostgresWorkspaceAccessRepository.joinWorkspace")((identity) =>
      joinWorkspaceRow(identity).pipe(
        Effect.map(Option.map(accessFromRow)),
        Effect.mapError((cause) =>
          persistenceError("WorkspaceAccessRepository.joinWorkspace", cause),
        ),
      ),
    ),
    listForAccount: Effect.fn("PostgresWorkspaceAccessRepository.listForAccount")((accountId) =>
      listRows({ accountId }).pipe(
        Effect.map((rows) => rows.map(accessFromRow)),
        Effect.mapError((cause) =>
          persistenceError("WorkspaceAccessRepository.listForAccount", cause),
        ),
      ),
    ),
    findForAccount: Effect.fn("PostgresWorkspaceAccessRepository.findForAccount")(
      (accountId, workspaceId) =>
        findRow({ accountId, workspaceId }).pipe(
          Effect.map(Option.map(accessFromRow)),
          Effect.mapError((cause) =>
            persistenceError("WorkspaceAccessRepository.findForAccount", cause),
          ),
        ),
    ),
    findIdentityForAccount: Effect.fn("PostgresWorkspaceAccessRepository.findIdentityForAccount")(
      (accountId, workspaceId) =>
        findIdentity({ accountId, workspaceId }).pipe(
          Effect.mapError((cause) =>
            persistenceError("WorkspaceAccessRepository.findIdentityForAccount", cause),
          ),
        ),
    ),
    updateIdentity: Effect.fn("PostgresWorkspaceAccessRepository.updateIdentity")(
      (accountId, workspaceId, profile) =>
        updateIdentityRow({ accountId, workspaceId, ...profile }).pipe(
          Effect.map(Option.map(accessFromRow)),
          Effect.mapError((cause) =>
            persistenceError("WorkspaceAccessRepository.updateIdentity", cause),
          ),
        ),
    ),
    endMembership: Effect.fn("PostgresWorkspaceAccessRepository.endMembership")(
      (accountId, workspaceId, endedAt) =>
        endMembership({ accountId, workspaceId, endedAt }).pipe(
          Effect.map(({ result }) => result),
          Effect.mapError((cause) =>
            persistenceError("WorkspaceAccessRepository.endMembership", cause),
          ),
        ),
    ),
  });
});

export const PostgresWorkspaceAccessRepository = Layer.effect(WorkspaceAccessRepository, make);
