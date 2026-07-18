import {
  UserId,
  WorkspaceAccess,
  WorkspaceAvatarUrl,
  WorkspaceId,
  WorkspaceIdentity,
  WorkspaceIdentityId,
  WorkspaceIdentityName,
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
        membership.role
      FROM workspace_memberships AS membership
      INNER JOIN workspace_identities AS identity
        ON identity.workspace_id = membership.workspace_id
       AND identity.id = membership.identity_id
      INNER JOIN workspaces AS workspace
        ON workspace.id = membership.workspace_id
      WHERE identity.account_id = ${accountId}
        AND membership.ended_at IS NULL
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
        membership.role
      FROM workspace_memberships AS membership
      INNER JOIN workspace_identities AS identity
        ON identity.workspace_id = membership.workspace_id
       AND identity.id = membership.identity_id
      INNER JOIN workspaces AS workspace
        ON workspace.id = membership.workspace_id
      WHERE identity.account_id = ${accountId}
        AND workspace.id = ${workspaceId}
        AND membership.ended_at IS NULL
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

  const endMembership = SqlSchema.findOne({
    Request: EndMembershipRequest,
    Result: EndMembershipResult,
    execute: ({ accountId, endedAt, workspaceId }) => sql`
      WITH locked_memberships AS MATERIALIZED (
        SELECT membership.identity_id, membership.role
        FROM workspace_memberships AS membership
        WHERE membership.workspace_id = ${workspaceId}
          AND membership.ended_at IS NULL
        ORDER BY membership.identity_id
        FOR UPDATE
      ), target_membership AS (
        SELECT locked_membership.identity_id, locked_membership.role
        FROM locked_memberships AS locked_membership
        INNER JOIN workspace_identities AS identity
          ON identity.workspace_id = ${workspaceId}
         AND identity.id = locked_membership.identity_id
        WHERE identity.account_id = ${accountId}
      ), ended_membership AS (
        UPDATE workspace_memberships AS membership
        SET ended_at = ${endedAt}
        FROM target_membership
        WHERE membership.workspace_id = ${workspaceId}
          AND membership.identity_id = target_membership.identity_id
          AND (
            target_membership.role <> 'owner'
            OR EXISTS (
              SELECT 1
              FROM locked_memberships AS other_membership
              WHERE other_membership.role = 'owner'
                AND other_membership.identity_id <> target_membership.identity_id
            )
          )
        RETURNING membership.workspace_id, membership.identity_id
      ), removed_channel_memberships AS (
        DELETE FROM channel_memberships AS channel_membership
        USING ended_membership
        WHERE channel_membership.workspace_id = ended_membership.workspace_id
          AND channel_membership.identity_id = ended_membership.identity_id
      )
      SELECT CASE
        WHEN EXISTS(SELECT 1 FROM ended_membership) THEN 'ended'
        WHEN EXISTS(
          SELECT 1
          FROM target_membership
          WHERE role = 'owner'
        ) THEN 'last-owner'
        ELSE 'not-found'
      END AS result
    `,
  });

  return WorkspaceAccessRepository.of({
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
