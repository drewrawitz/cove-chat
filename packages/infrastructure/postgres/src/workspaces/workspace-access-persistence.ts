import {
  FullMemberRole,
  WorkspaceAccessLive,
  WorkspaceAccess,
  WorkspaceAccessPersistence,
  WorkspaceAccessPersistenceFailure,
  type WorkspaceAccessAuditEvent,
  type WorkspaceAccessTransaction,
  type WorkspaceAccessView,
  type WorkspaceInvitationRecord,
  type WorkspaceInvitationView,
  type PendingWorkspaceInvitationView,
  type FullMemberView,
} from "@cove/application/workspaces/internal";
import {
  EmailAddress,
  User,
  UserId,
  WorkspaceAvatarUrl,
  WorkspaceId,
  WorkspaceIdentity,
  WorkspaceIdentityId,
  WorkspaceIdentityName,
  WorkspaceInvitationId,
  WorkspaceMembership,
  WorkspaceName,
  WorkspaceRole,
} from "@cove/domain";
import {
  WorkspaceInvitationNotifier,
  WorkspaceInvitationTokenValue,
  type WorkspaceInvitationToken,
} from "@cove/ports";
import { Effect, Layer, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";
import { hashOpaqueToken, makeOpaqueToken } from "../auth/opaque-token.ts";

const AccountRequest = Schema.Struct({ actorAccountId: UserId });
const ActiveInvitationAccountRequest = Schema.Struct({
  actorAccountId: UserId,
  activeAt: Schema.Date,
});
const ActiveWorkspaceRequest = Schema.Struct({
  actorAccountId: UserId,
  workspaceId: WorkspaceId,
  activeAt: Schema.Date,
});
const WorkspaceRequest = Schema.Struct({ actorAccountId: UserId, workspaceId: WorkspaceId });
const WorkspaceIdRequest = Schema.Struct({ workspaceId: WorkspaceId });
const InviteeEmailRequest = Schema.Struct({ inviteeEmail: EmailAddress });
const InvitationRequest = Schema.Struct({
  actorAccountId: UserId,
  invitationId: WorkspaceInvitationId,
});
const WorkspaceInvitationInWorkspaceRequest = Schema.Struct({
  workspaceId: WorkspaceId,
  invitationId: WorkspaceInvitationId,
});
const InvitationTokenRequest = Schema.Struct({
  tokenHash: Schema.String,
  redeemedAt: Schema.Date,
});
const WorkspaceInviteeRequest = Schema.Struct({
  workspaceId: WorkspaceId,
  inviteeEmail: EmailAddress,
});
const MemberAdministrationRequest = Schema.Struct({
  actorAccountId: UserId,
  workspaceId: WorkspaceId,
  workspaceIdentityId: WorkspaceIdentityId,
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

const FullMemberRow = WorkspaceAccessRow.pipe(Schema.fieldsAssign({ role: FullMemberRole }));
interface FullMemberRow extends Schema.Schema.Type<typeof FullMemberRow> {}

const UserRow = User;
interface UserRow extends Schema.Schema.Type<typeof UserRow> {}

const PendingInvitationRow = Schema.Struct({
  id: WorkspaceInvitationId,
  workspaceId: WorkspaceId,
  inviteeEmail: EmailAddress,
  invitedByAccountId: UserId,
  role: Schema.Literals(["member"]),
  invitedAt: Schema.Date,
  tokenExpiresAt: Schema.Date,
});
interface PendingInvitationRow extends Schema.Schema.Type<typeof PendingInvitationRow> {}

const AdministratorInvitationRow = Schema.Struct({
  authorizedWorkspaceId: WorkspaceId,
  id: Schema.NullOr(WorkspaceInvitationId),
  inviteeEmail: Schema.NullOr(EmailAddress),
  invitedAt: Schema.NullOr(Schema.Date),
  tokenExpiresAt: Schema.NullOr(Schema.Date),
});
interface AdministratorInvitationRow extends Schema.Schema.Type<
  typeof AdministratorInvitationRow
> {}

const WorkspaceInvitationViewRow = PendingInvitationRow.pipe(
  Schema.fieldsAssign({
    workspaceName: WorkspaceName,
    requiresIdentityProfile: Schema.Boolean,
  }),
);
interface WorkspaceInvitationViewRow extends Schema.Schema.Type<
  typeof WorkspaceInvitationViewRow
> {}

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

const persistenceFailure = (operation: string, cause: unknown): WorkspaceAccessPersistenceFailure =>
  new WorkspaceAccessPersistenceFailure({ operation, cause });

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

const fullMemberFromRow = (row: FullMemberRow): FullMemberView => ({
  identity: {
    id: row.identityId,
    workspaceId: row.workspaceId,
    accountId: row.actorAccountId,
    name: row.identityName,
    avatarUrl: row.avatarUrl,
  },
  membership: {
    workspaceId: row.workspaceId,
    identityId: row.identityId,
    role: row.role,
    startedAt: row.membershipStartedAt,
  },
});

const invitationFromRow = (row: PendingInvitationRow): WorkspaceInvitationRecord => ({
  id: row.id,
  workspaceId: row.workspaceId,
  inviteeEmail: row.inviteeEmail,
  invitedByAccountId: row.invitedByAccountId,
  role: row.role,
  invitedAt: row.invitedAt,
  tokenExpiresAt: row.tokenExpiresAt,
});

const invitationViewFromRow = (row: WorkspaceInvitationViewRow): WorkspaceInvitationView => ({
  id: row.id,
  workspace: { id: row.workspaceId, name: row.workspaceName },
  role: row.role,
  requiresIdentityProfile: row.requiresIdentityProfile,
  invitedAt: row.invitedAt,
});

const administratorInvitationFromRow = (
  row: AdministratorInvitationRow,
): PendingWorkspaceInvitationView | undefined =>
  row.id === null ||
  row.inviteeEmail === null ||
  row.invitedAt === null ||
  row.tokenExpiresAt === null
    ? undefined
    : {
        id: row.id,
        workspaceId: row.authorizedWorkspaceId,
        inviteeEmail: row.inviteeEmail,
        invitedAt: row.invitedAt,
        tokenExpiresAt: row.tokenExpiresAt,
      };

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

  const listPendingInvitationRows = SqlSchema.findAll({
    Request: ActiveInvitationAccountRequest,
    Result: WorkspaceInvitationViewRow,
    execute: ({ actorAccountId, activeAt }) => sql<WorkspaceInvitationViewRow>`
      SELECT
        invitation.id,
        invitation.workspace_id AS "workspaceId",
        invitation.invitee_email AS "inviteeEmail",
        invitation.invited_by_account_id AS "invitedByAccountId",
        invitation.role,
        invitation.invited_at AS "invitedAt",
        invitation.token_expires_at AS "tokenExpiresAt",
        workspace.name AS "workspaceName",
        identity.id IS NULL AS "requiresIdentityProfile"
      FROM workspace_invitations AS invitation
      INNER JOIN workspaces AS workspace
        ON workspace.id = invitation.workspace_id
      INNER JOIN users AS actor
        ON actor.id = ${actorAccountId}
      LEFT JOIN workspace_identities AS identity
        ON identity.workspace_id = invitation.workspace_id
        AND identity.account_id = actor.id
      WHERE lower(invitation.invitee_email) = lower(actor.email)
        AND invitation.accepted_at IS NULL
        AND invitation.token_expires_at > ${activeAt}
      ORDER BY invitation.invited_at, invitation.id
    `,
  });

  const listAdministratorInvitationRows = SqlSchema.findAll({
    Request: ActiveWorkspaceRequest,
    Result: AdministratorInvitationRow,
    execute: ({ actorAccountId, workspaceId, activeAt }) => sql<AdministratorInvitationRow>`
      WITH authorized_workspace AS (
        SELECT workspace.id
        FROM workspaces AS workspace
        INNER JOIN workspace_identities AS actor_identity
          ON actor_identity.workspace_id = workspace.id
          AND actor_identity.account_id = ${actorAccountId}
          AND actor_identity.membership_ended_at IS NULL
          AND actor_identity.role IN ('owner', 'admin')
        WHERE workspace.id = ${workspaceId}
      )
      SELECT
        authorized_workspace.id AS "authorizedWorkspaceId",
        invitation.id,
        invitation.invitee_email AS "inviteeEmail",
        invitation.invited_at AS "invitedAt",
        invitation.token_expires_at AS "tokenExpiresAt"
      FROM authorized_workspace
      LEFT JOIN workspace_invitations AS invitation
        ON invitation.workspace_id = authorized_workspace.id
        AND invitation.accepted_at IS NULL
        AND invitation.token_expires_at > ${activeAt}
      ORDER BY invitation.invited_at, invitation.id
    `,
  });

  const listAdministratorMemberRows = SqlSchema.findAll({
    Request: WorkspaceRequest,
    Result: FullMemberRow,
    execute: ({ actorAccountId, workspaceId }) => sql<FullMemberRow>`
      WITH authorized_workspace AS (
        SELECT workspace.id, workspace.name
        FROM workspaces AS workspace
        INNER JOIN workspace_identities AS actor_identity
          ON actor_identity.workspace_id = workspace.id
          AND actor_identity.account_id = ${actorAccountId}
          AND actor_identity.membership_ended_at IS NULL
          AND actor_identity.role IN ('owner', 'admin')
        WHERE workspace.id = ${workspaceId}
      )
      SELECT
        authorized_workspace.id AS "workspaceId",
        authorized_workspace.name AS "workspaceName",
        identity.id AS "identityId",
        identity.account_id AS "actorAccountId",
        identity.name AS "identityName",
        identity.avatar_url AS "avatarUrl",
        identity.role,
        identity.membership_started_at AS "membershipStartedAt"
      FROM authorized_workspace
      INNER JOIN workspace_identities AS identity
        ON identity.workspace_id = authorized_workspace.id
        AND identity.membership_ended_at IS NULL
        AND identity.role IN ('owner', 'admin', 'member')
      ORDER BY lower(identity.name), identity.id
    `,
  });

  const userByEmailRow = SqlSchema.findOneOption({
    Request: InviteeEmailRequest,
    Result: UserRow,
    execute: ({ inviteeEmail }) => sql<UserRow>`
      SELECT id, email, display_name AS "displayName"
      FROM users
      WHERE lower(email) = lower(${inviteeEmail})
      LIMIT 1
    `,
  });

  const pendingInvitationForInviteeRow = SqlSchema.findOneOption({
    Request: WorkspaceInviteeRequest,
    Result: PendingInvitationRow,
    execute: ({ workspaceId, inviteeEmail }) => sql<PendingInvitationRow>`
      SELECT
        id,
        workspace_id AS "workspaceId",
        invitee_email AS "inviteeEmail",
        invited_by_account_id AS "invitedByAccountId",
        role,
        invited_at AS "invitedAt",
        token_expires_at AS "tokenExpiresAt"
      FROM workspace_invitations
      WHERE workspace_id = ${workspaceId}
        AND lower(invitee_email) = lower(${inviteeEmail})
        AND accepted_at IS NULL
      LIMIT 1
    `,
  });

  const pendingInvitationForActorRow = SqlSchema.findOneOption({
    Request: InvitationRequest,
    Result: PendingInvitationRow,
    execute: ({ actorAccountId, invitationId }) => sql<PendingInvitationRow>`
      SELECT
        invitation.id,
        invitation.workspace_id AS "workspaceId",
        invitation.invitee_email AS "inviteeEmail",
        invitation.invited_by_account_id AS "invitedByAccountId",
        invitation.role,
        invitation.invited_at AS "invitedAt",
        invitation.token_expires_at AS "tokenExpiresAt"
      FROM workspace_invitations AS invitation
      INNER JOIN users AS actor
        ON actor.id = ${actorAccountId}
        AND lower(actor.email) = lower(invitation.invitee_email)
      WHERE invitation.id = ${invitationId}
        AND invitation.accepted_at IS NULL
      LIMIT 1
    `,
  });

  const lockPendingInvitationForActorRow = SqlSchema.findOneOption({
    Request: InvitationRequest,
    Result: PendingInvitationRow,
    execute: ({ actorAccountId, invitationId }) => sql<PendingInvitationRow>`
      SELECT
        invitation.id,
        invitation.workspace_id AS "workspaceId",
        invitation.invitee_email AS "inviteeEmail",
        invitation.invited_by_account_id AS "invitedByAccountId",
        invitation.role,
        invitation.invited_at AS "invitedAt",
        invitation.token_expires_at AS "tokenExpiresAt"
      FROM workspace_invitations AS invitation
      INNER JOIN users AS actor
        ON actor.id = ${actorAccountId}
        AND lower(actor.email) = lower(invitation.invitee_email)
      WHERE invitation.id = ${invitationId}
        AND invitation.accepted_at IS NULL
      FOR UPDATE
    `,
  });

  const lockPendingInvitationInWorkspaceRow = SqlSchema.findOneOption({
    Request: WorkspaceInvitationInWorkspaceRequest,
    Result: PendingInvitationRow,
    execute: ({ workspaceId, invitationId }) => sql<PendingInvitationRow>`
      SELECT
        id,
        workspace_id AS "workspaceId",
        invitee_email AS "inviteeEmail",
        invited_by_account_id AS "invitedByAccountId",
        role,
        invited_at AS "invitedAt",
        token_expires_at AS "tokenExpiresAt"
      FROM workspace_invitations
      WHERE id = ${invitationId}
        AND workspace_id = ${workspaceId}
        AND accepted_at IS NULL
      FOR UPDATE
    `,
  });

  const pendingInvitationForTokenRow = SqlSchema.findOneOption({
    Request: InvitationTokenRequest,
    Result: PendingInvitationRow,
    execute: ({ redeemedAt, tokenHash }) => sql<PendingInvitationRow>`
      SELECT
        id,
        workspace_id AS "workspaceId",
        invitee_email AS "inviteeEmail",
        invited_by_account_id AS "invitedByAccountId",
        role,
        invited_at AS "invitedAt",
        token_expires_at AS "tokenExpiresAt"
      FROM workspace_invitations
      WHERE token_hash = ${tokenHash}
        AND token_expires_at > ${redeemedAt}
        AND accepted_at IS NULL
      LIMIT 1
    `,
  });

  const lockPendingInvitationForTokenRow = SqlSchema.findOneOption({
    Request: InvitationTokenRequest,
    Result: PendingInvitationRow,
    execute: ({ redeemedAt, tokenHash }) => sql<PendingInvitationRow>`
      SELECT
        id,
        workspace_id AS "workspaceId",
        invitee_email AS "inviteeEmail",
        invited_by_account_id AS "invitedByAccountId",
        role,
        invited_at AS "invitedAt",
        token_expires_at AS "tokenExpiresAt"
      FROM workspace_invitations
      WHERE token_hash = ${tokenHash}
        AND token_expires_at > ${redeemedAt}
        AND accepted_at IS NULL
      FOR UPDATE
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

  const targetMembershipFactsRow = SqlSchema.findOneOption({
    Request: MemberAdministrationRequest,
    Result: IdentityMembershipFactsRow,
    execute: ({ workspaceId, workspaceIdentityId }) => sql`
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
        AND identity.id = ${workspaceIdentityId}
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

  // Lifecycle mutations acquire the account/workspace advisory lock before a workspace row lock.
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
        persistenceFailure("WorkspaceAccess.lockAccountWorkspaceRelationship", cause),
      ),
    );
  });

  const lockAccountEmail = Effect.fn("PostgresWorkspaceAccess.lockAccountEmail")(
    (inviteeEmail: EmailAddress) =>
      sql`
        SELECT pg_advisory_xact_lock(
          hashtextextended(lower(${inviteeEmail}), 516903)
        )
      `.pipe(
        Effect.asVoid,
        Effect.mapError((cause) => persistenceFailure("WorkspaceAccess.lockAccountEmail", cause)),
      ),
  );

  const endSelectedMembershipAndRevokeChannels = Effect.fn(
    "PostgresWorkspaceAccess.endSelectedMembershipAndRevokeChannels",
  )(
    (
      workspaceId: WorkspaceId,
      selector:
        | { readonly kind: "account"; readonly id: UserId }
        | { readonly kind: "identity"; readonly id: WorkspaceIdentityId },
      endedAt: Date,
    ) =>
      sql`
        WITH ended_membership AS (
          UPDATE workspace_identities
          SET membership_ended_at = ${endedAt}
          WHERE workspace_id = ${workspaceId}
            AND membership_ended_at IS NULL
            AND (
              (${selector.kind} = 'account' AND account_id = ${selector.id})
              OR (${selector.kind} = 'identity' AND id = ${selector.id})
            )
          RETURNING workspace_id, id
        )
        DELETE FROM channel_memberships AS channel_membership
        USING ended_membership
        WHERE channel_membership.workspace_id = ended_membership.workspace_id
          AND channel_membership.identity_id = ended_membership.id
      `.pipe(
        Effect.asVoid,
        Effect.mapError((cause) =>
          persistenceFailure("WorkspaceAccess.endSelectedMembershipAndRevokeChannels", cause),
        ),
      ),
  );

  const transaction: WorkspaceAccessTransaction = {
    serializeWorkspaceTransition: Effect.fn("PostgresWorkspaceAccess.serializeWorkspaceTransition")(
      function* (actorAccountId, workspaceId) {
        yield* lockAccountWorkspaceRelationship(actorAccountId, workspaceId);
        const locked = yield* lockWorkspaceRow({ workspaceId }).pipe(
          Effect.mapError((cause) =>
            persistenceFailure("WorkspaceAccess.serializeWorkspaceTransition.lock", cause),
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
            persistenceFailure("WorkspaceAccess.serializeWorkspaceTransition.read", cause),
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
    serializeInviteMember: Effect.fn("PostgresWorkspaceAccess.serializeInviteMember")(
      function* (actorAccountId, workspaceId, inviteeEmail) {
        const locked = yield* lockWorkspaceRow({ workspaceId }).pipe(
          Effect.mapError((cause) =>
            persistenceFailure("WorkspaceAccess.serializeInviteMember.lock", cause),
          ),
        );
        if (locked._tag === "None") {
          return {
            workspace: undefined,
            identity: undefined,
            membership: undefined,
            activeOwnerCount: 0,
            inviteeMembership: undefined,
            pendingInvitation: undefined,
          };
        }
        const actorRow = yield* workspaceTransitionFactsRow({ actorAccountId, workspaceId }).pipe(
          Effect.mapError((cause) =>
            persistenceFailure("WorkspaceAccess.serializeInviteMember.actor", cause),
          ),
        );
        const actorFacts =
          actorRow._tag === "Some"
            ? { ...factsFromRow(actorRow.value), activeOwnerCount: actorRow.value.activeOwnerCount }
            : {
                workspace: undefined,
                identity: undefined,
                membership: undefined,
                activeOwnerCount: 0,
              };
        const inviteeRow = yield* userByEmailRow({ inviteeEmail }).pipe(
          Effect.mapError((cause) =>
            persistenceFailure("WorkspaceAccess.serializeInviteMember.invitee", cause),
          ),
        );
        const inviteeMembership =
          inviteeRow._tag === "None"
            ? undefined
            : (yield* identityMembershipFactsRow({
                actorAccountId: inviteeRow.value.id,
                workspaceId,
              }).pipe(
                Effect.mapError((cause) =>
                  persistenceFailure("WorkspaceAccess.serializeInviteMember.relationship", cause),
                ),
              )).pipe((relationshipRow) =>
                relationshipRow._tag === "Some"
                  ? factsFromRow(relationshipRow.value).membership
                  : undefined,
              );
        const pendingInvitationRow = yield* pendingInvitationForInviteeRow({
          workspaceId,
          inviteeEmail,
        }).pipe(
          Effect.mapError((cause) =>
            persistenceFailure("WorkspaceAccess.serializeInviteMember.pending", cause),
          ),
        );

        return {
          ...actorFacts,
          inviteeMembership,
          pendingInvitation:
            pendingInvitationRow._tag === "Some"
              ? invitationFromRow(pendingInvitationRow.value)
              : undefined,
        };
      },
    ),
    serializeInvitationAcceptance: Effect.fn(
      "PostgresWorkspaceAccess.serializeInvitationAcceptance",
    )(function* (actorAccountId, invitationId) {
      const invitationRow = yield* pendingInvitationForActorRow({
        actorAccountId,
        invitationId,
      }).pipe(
        Effect.mapError((cause) =>
          persistenceFailure("WorkspaceAccess.serializeInvitationAcceptance.find", cause),
        ),
      );
      if (invitationRow._tag === "None") {
        return {
          invitation: undefined,
          workspace: undefined,
          identity: undefined,
          membership: undefined,
        };
      }
      const workspaceId = invitationRow.value.workspaceId;
      const lockedWorkspace = yield* lockWorkspaceRow({ workspaceId }).pipe(
        Effect.mapError((cause) =>
          persistenceFailure("WorkspaceAccess.serializeInvitationAcceptance.lockWorkspace", cause),
        ),
      );
      if (lockedWorkspace._tag === "None") {
        return {
          invitation: undefined,
          workspace: undefined,
          identity: undefined,
          membership: undefined,
        };
      }
      const lockedInvitation = yield* lockPendingInvitationForActorRow({
        actorAccountId,
        invitationId,
      }).pipe(
        Effect.mapError((cause) =>
          persistenceFailure("WorkspaceAccess.serializeInvitationAcceptance.lockInvitation", cause),
        ),
      );
      if (lockedInvitation._tag === "None") {
        return {
          invitation: undefined,
          workspace: undefined,
          identity: undefined,
          membership: undefined,
        };
      }
      const relationshipRow = yield* identityMembershipFactsRow({
        actorAccountId,
        workspaceId,
      }).pipe(
        Effect.mapError((cause) =>
          persistenceFailure("WorkspaceAccess.serializeInvitationAcceptance.relationship", cause),
        ),
      );
      const relationship =
        relationshipRow._tag === "Some"
          ? factsFromRow(relationshipRow.value)
          : { workspace: undefined, identity: undefined, membership: undefined };
      return {
        invitation: invitationFromRow(lockedInvitation.value),
        ...relationship,
      };
    }),
    serializeInvitationRedemption: Effect.fn(
      "PostgresWorkspaceAccess.serializeInvitationRedemption",
    )(function* (token: WorkspaceInvitationToken, proposedAccountId, redeemedAt) {
      const tokenHash = hashOpaqueToken(token);
      const invitationRow = yield* pendingInvitationForTokenRow({ redeemedAt, tokenHash }).pipe(
        Effect.mapError((cause) =>
          persistenceFailure("WorkspaceAccess.serializeInvitationRedemption.find", cause),
        ),
      );
      if (invitationRow._tag === "None") {
        return {
          invitation: undefined,
          account: undefined,
          workspace: undefined,
          identity: undefined,
          membership: undefined,
        };
      }
      const workspaceId = invitationRow.value.workspaceId;
      const lockedWorkspace = yield* lockWorkspaceRow({ workspaceId }).pipe(
        Effect.mapError((cause) =>
          persistenceFailure("WorkspaceAccess.serializeInvitationRedemption.lockWorkspace", cause),
        ),
      );
      if (lockedWorkspace._tag === "None") {
        return {
          invitation: undefined,
          account: undefined,
          workspace: undefined,
          identity: undefined,
          membership: undefined,
        };
      }
      const lockedInvitation = yield* lockPendingInvitationForTokenRow({
        redeemedAt,
        tokenHash,
      }).pipe(
        Effect.mapError((cause) =>
          persistenceFailure("WorkspaceAccess.serializeInvitationRedemption.lockInvitation", cause),
        ),
      );
      if (lockedInvitation._tag === "None") {
        return {
          invitation: undefined,
          account: undefined,
          workspace: undefined,
          identity: undefined,
          membership: undefined,
        };
      }

      const invitation = invitationFromRow(lockedInvitation.value);
      yield* lockAccountEmail(invitation.inviteeEmail);
      const accountRow = yield* userByEmailRow({ inviteeEmail: invitation.inviteeEmail }).pipe(
        Effect.mapError((cause) =>
          persistenceFailure("WorkspaceAccess.serializeInvitationRedemption.account", cause),
        ),
      );
      const account = accountRow._tag === "Some" ? accountRow.value : undefined;
      const relationshipRow = yield* identityMembershipFactsRow({
        actorAccountId: account?.id ?? proposedAccountId,
        workspaceId,
      }).pipe(
        Effect.mapError((cause) =>
          persistenceFailure("WorkspaceAccess.serializeInvitationRedemption.relationship", cause),
        ),
      );
      const relationship =
        relationshipRow._tag === "Some"
          ? factsFromRow(relationshipRow.value)
          : { workspace: undefined, identity: undefined, membership: undefined };

      return { invitation, account, ...relationship };
    }),
    serializeInvitationAdministration: Effect.fn(
      "PostgresWorkspaceAccess.serializeInvitationAdministration",
    )(function* (actorAccountId, workspaceId, invitationId) {
      const lockedWorkspace = yield* lockWorkspaceRow({ workspaceId }).pipe(
        Effect.mapError((cause) =>
          persistenceFailure("WorkspaceAccess.serializeInvitationAdministration.lock", cause),
        ),
      );
      if (lockedWorkspace._tag === "None") {
        return {
          workspace: undefined,
          identity: undefined,
          membership: undefined,
          invitation: undefined,
        };
      }
      const actorRow = yield* identityMembershipFactsRow({ actorAccountId, workspaceId }).pipe(
        Effect.mapError((cause) =>
          persistenceFailure("WorkspaceAccess.serializeInvitationAdministration.actor", cause),
        ),
      );
      const actorFacts =
        actorRow._tag === "Some"
          ? factsFromRow(actorRow.value)
          : { workspace: undefined, identity: undefined, membership: undefined };
      const invitationRow = yield* lockPendingInvitationInWorkspaceRow({
        workspaceId,
        invitationId,
      }).pipe(
        Effect.mapError((cause) =>
          persistenceFailure("WorkspaceAccess.serializeInvitationAdministration.invitation", cause),
        ),
      );
      return {
        ...actorFacts,
        invitation:
          invitationRow._tag === "Some" ? invitationFromRow(invitationRow.value) : undefined,
      };
    }),
    serializeFullMemberAdministration: Effect.fn(
      "PostgresWorkspaceAccess.serializeFullMemberAdministration",
    )(function* (actorAccountId, workspaceId, workspaceIdentityId) {
      const lockedWorkspace = yield* lockWorkspaceRow({ workspaceId }).pipe(
        Effect.mapError((cause) =>
          persistenceFailure("WorkspaceAccess.serializeFullMemberAdministration.lock", cause),
        ),
      );
      if (lockedWorkspace._tag === "None") {
        return {
          workspace: undefined,
          identity: undefined,
          membership: undefined,
          activeOwnerCount: 0,
          targetIdentity: undefined,
          targetMembership: undefined,
        };
      }
      const actorRow = yield* workspaceTransitionFactsRow({ actorAccountId, workspaceId }).pipe(
        Effect.mapError((cause) =>
          persistenceFailure("WorkspaceAccess.serializeFullMemberAdministration.actor", cause),
        ),
      );
      const actorFacts =
        actorRow._tag === "Some"
          ? { ...factsFromRow(actorRow.value), activeOwnerCount: actorRow.value.activeOwnerCount }
          : {
              workspace: undefined,
              identity: undefined,
              membership: undefined,
              activeOwnerCount: 0,
            };
      const targetRow = yield* targetMembershipFactsRow({
        actorAccountId,
        workspaceId,
        workspaceIdentityId,
      }).pipe(
        Effect.mapError((cause) =>
          persistenceFailure("WorkspaceAccess.serializeFullMemberAdministration.target", cause),
        ),
      );
      const targetFacts =
        targetRow._tag === "Some"
          ? factsFromRow(targetRow.value)
          : { identity: undefined, membership: undefined };
      return {
        ...actorFacts,
        targetIdentity: targetFacts.identity,
        targetMembership: targetFacts.membership,
      };
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
      endSelectedMembershipAndRevokeChannels(
        workspaceId,
        { kind: "account", id: actorAccountId },
        endedAt,
      ),
    ),
    createInvitation: Effect.fn("PostgresWorkspaceAccess.createInvitation")(function* (invitation) {
      const token = makeOpaqueToken(
        (value) => WorkspaceInvitationTokenValue.make(value),
        "WorkspaceInvitationToken",
      );
      yield* sql`
          INSERT INTO workspace_invitations (
            id,
            workspace_id,
            invitee_email,
            invited_by_account_id,
            token_hash,
            token_expires_at,
            role,
            invited_at
          )
          VALUES (
            ${invitation.id},
            ${invitation.workspaceId},
            ${invitation.inviteeEmail},
            ${invitation.invitedByAccountId},
            ${hashOpaqueToken(token)},
            ${invitation.tokenExpiresAt},
            ${invitation.role},
            ${invitation.invitedAt}
          )
        `.pipe(
        Effect.mapError((cause) => persistenceFailure("WorkspaceAccess.createInvitation", cause)),
      );
      return token;
    }),
    refreshInvitation: Effect.fn("PostgresWorkspaceAccess.refreshInvitation")(
      function* (invitation) {
        const token = makeOpaqueToken(
          (value) => WorkspaceInvitationTokenValue.make(value),
          "WorkspaceInvitationToken",
        );
        yield* sql`
        UPDATE workspace_invitations
        SET
          invited_by_account_id = ${invitation.invitedByAccountId},
          token_hash = ${hashOpaqueToken(token)},
          token_expires_at = ${invitation.tokenExpiresAt},
          role = ${invitation.role},
          invited_at = ${invitation.invitedAt}
        WHERE id = ${invitation.id}
          AND accepted_at IS NULL
      `.pipe(
          Effect.mapError((cause) =>
            persistenceFailure("WorkspaceAccess.refreshInvitation", cause),
          ),
        );
        return token;
      },
    ),
    restoreInvitationAfterFailedDelivery: Effect.fn(
      "PostgresWorkspaceAccess.restoreInvitationAfterFailedDelivery",
    )(function* (invitation, failedDeliveryAt) {
      const invalidatedToken = makeOpaqueToken(
        (value) => WorkspaceInvitationTokenValue.make(value),
        "WorkspaceInvitationToken",
      );
      yield* sql`
        UPDATE workspace_invitations
        SET
          invited_by_account_id = ${invitation.invitedByAccountId},
          token_hash = ${hashOpaqueToken(invalidatedToken)},
          token_expires_at = ${invitation.tokenExpiresAt},
          role = ${invitation.role},
          invited_at = ${invitation.invitedAt}
        WHERE id = ${invitation.id}
          AND accepted_at IS NULL
          AND invited_at = ${failedDeliveryAt}
      `.pipe(
        Effect.asVoid,
        Effect.mapError((cause) =>
          persistenceFailure("WorkspaceAccess.restoreInvitationAfterFailedDelivery", cause),
        ),
      );
    }),
    createAccount: Effect.fn("PostgresWorkspaceAccess.createAccount")((account) =>
      sql`
        INSERT INTO users (id, email, display_name)
        VALUES (${account.id}, ${account.email}, ${account.displayName})
      `.pipe(
        Effect.asVoid,
        Effect.mapError((cause) => persistenceFailure("WorkspaceAccess.createAccount", cause)),
      ),
    ),
    acceptInvitation: Effect.fn("PostgresWorkspaceAccess.acceptInvitation")(
      (invitationId, acceptedByAccountId, acceptedAt) =>
        sql`
          UPDATE workspace_invitations
          SET
            accepted_by_account_id = ${acceptedByAccountId},
            accepted_at = ${acceptedAt}
          WHERE id = ${invitationId}
            AND accepted_at IS NULL
        `.pipe(
          Effect.asVoid,
          Effect.mapError((cause) => persistenceFailure("WorkspaceAccess.acceptInvitation", cause)),
        ),
    ),
    revokeInvitation: Effect.fn("PostgresWorkspaceAccess.revokeInvitation")((invitationId) =>
      sql`
        DELETE FROM workspace_invitations
        WHERE id = ${invitationId}
          AND accepted_at IS NULL
      `.pipe(
        Effect.asVoid,
        Effect.mapError((cause) => persistenceFailure("WorkspaceAccess.revokeInvitation", cause)),
      ),
    ),
    updateMemberRole: Effect.fn("PostgresWorkspaceAccess.updateMemberRole")(
      (workspaceId, workspaceIdentityId, role) =>
        sql`
          UPDATE workspace_identities
          SET role = ${role}
          WHERE workspace_id = ${workspaceId}
            AND id = ${workspaceIdentityId}
            AND membership_ended_at IS NULL
        `.pipe(
          Effect.asVoid,
          Effect.mapError((cause) => persistenceFailure("WorkspaceAccess.updateMemberRole", cause)),
        ),
    ),
    endFullMemberAndRevokeChannels: Effect.fn(
      "PostgresWorkspaceAccess.endFullMemberAndRevokeChannels",
    )((workspaceId, workspaceIdentityId, endedAt) =>
      endSelectedMembershipAndRevokeChannels(
        workspaceId,
        { kind: "identity", id: workspaceIdentityId },
        endedAt,
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
    listPendingInvitations: Effect.fn("PostgresWorkspaceAccess.listPendingInvitations")(
      (actorAccountId, activeAt) =>
        listPendingInvitationRows({ actorAccountId, activeAt }).pipe(
          Effect.map((rows) => rows.map(invitationViewFromRow)),
          Effect.mapError((cause) =>
            persistenceFailure("WorkspaceAccess.listPendingInvitations", cause),
          ),
        ),
    ),
    listPendingInvitationsForAdministrator: Effect.fn(
      "PostgresWorkspaceAccess.listPendingInvitationsForAdministrator",
    )((actorAccountId, workspaceId, activeAt) =>
      listAdministratorInvitationRows({ actorAccountId, workspaceId, activeAt }).pipe(
        Effect.map((rows) =>
          rows.length === 0
            ? undefined
            : rows.flatMap((row) => {
                const invitation = administratorInvitationFromRow(row);
                return invitation === undefined ? [] : [invitation];
              }),
        ),
        Effect.mapError((cause) =>
          persistenceFailure("WorkspaceAccess.listPendingInvitationsForAdministrator", cause),
        ),
      ),
    ),
    listFullMembersForAdministrator: Effect.fn(
      "PostgresWorkspaceAccess.listFullMembersForAdministrator",
    )((actorAccountId, workspaceId) =>
      listAdministratorMemberRows({ actorAccountId, workspaceId }).pipe(
        Effect.map((rows) => (rows.length === 0 ? undefined : rows.map(fullMemberFromRow))),
        Effect.mapError((cause) =>
          persistenceFailure("WorkspaceAccess.listFullMembersForAdministrator", cause),
        ),
      ),
    ),
    transact: (use) =>
      sql
        .withTransaction(use(transaction))
        .pipe(
          Effect.catchTag("SqlError", (cause) =>
            Effect.fail(persistenceFailure("WorkspaceAccess.transact", cause)),
          ),
        ),
  });
});

export const PostgresWorkspaceAccessPersistence: Layer.Layer<
  WorkspaceAccessPersistence,
  never,
  SqlClient.SqlClient
> = Layer.effect(WorkspaceAccessPersistence, make);

export const PostgresWorkspaceAccess: Layer.Layer<
  WorkspaceAccess,
  never,
  SqlClient.SqlClient | WorkspaceInvitationNotifier
> = WorkspaceAccessLive.pipe(Layer.provide(PostgresWorkspaceAccessPersistence));
