import type {
  EmailAddress,
  User,
  UserId,
  Workspace,
  WorkspaceId,
  WorkspaceIdentity,
  WorkspaceIdentityProfile,
  WorkspaceInvitationId,
  WorkspaceMembership,
  WorkspaceRole,
} from "@cove/domain";
import type { WorkspaceInvitationToken } from "@cove/ports";
import { Context, type Effect, Schema } from "effect";
import type {
  FullMemberView,
  WorkspaceAccessView,
  WorkspaceInvitationView,
} from "./workspace-access.ts";

export class WorkspaceAccessPersistenceFailure extends Schema.TaggedErrorClass<WorkspaceAccessPersistenceFailure>()(
  "Application.WorkspaceAccessPersistenceFailure",
  {
    operation: Schema.String,
    cause: Schema.Defect(),
  },
) {}

export interface IdentityMembershipFacts {
  readonly workspace: Workspace | undefined;
  readonly identity: WorkspaceIdentity | undefined;
  readonly membership: WorkspaceMembership | undefined;
}

export interface WorkspaceTransitionFacts extends IdentityMembershipFacts {
  readonly activeOwnerCount: number;
}

export interface WorkspaceInvitationRecord {
  readonly id: WorkspaceInvitationId;
  readonly workspaceId: WorkspaceId;
  readonly inviteeEmail: EmailAddress;
  readonly invitedByAccountId: UserId;
  readonly role: "member";
  readonly invitedAt: Date;
  readonly tokenExpiresAt: Date;
}

export interface InviteWorkspaceMemberFacts extends WorkspaceTransitionFacts {
  readonly inviteeMembership: WorkspaceMembership | undefined;
  readonly pendingInvitation: WorkspaceInvitationRecord | undefined;
}

export interface InvitationAcceptanceFacts extends IdentityMembershipFacts {
  readonly invitation: WorkspaceInvitationRecord | undefined;
}

export interface InvitationRedemptionFacts extends InvitationAcceptanceFacts {
  readonly account: User | undefined;
}

export interface FullMemberAdministrationFacts extends WorkspaceTransitionFacts {
  readonly targetIdentity: WorkspaceIdentity | undefined;
  readonly targetMembership: WorkspaceMembership | undefined;
}

export type WorkspaceIdentityChangedField = "avatarUrl" | "name";

interface WorkspaceAuditMetadata {
  readonly workspaceId: WorkspaceId;
  readonly workspaceIdentityId: WorkspaceIdentity["id"];
}

export type WorkspaceAccessAuditEvent =
  | {
      readonly id: string;
      readonly type: "workspace.created";
      readonly version: 1;
      readonly actorAccountId: UserId;
      readonly occurredAt: Date;
      readonly metadata: WorkspaceAuditMetadata;
    }
  | {
      readonly id: string;
      readonly type: "workspace.identity_profile_changed";
      readonly version: 1;
      readonly actorAccountId: UserId;
      readonly occurredAt: Date;
      readonly metadata: WorkspaceAuditMetadata & {
        readonly changedFields: ReadonlyArray<WorkspaceIdentityChangedField>;
      };
    }
  | {
      readonly id: string;
      readonly type: "workspace.membership_ended";
      readonly version: 1;
      readonly actorAccountId: UserId;
      readonly occurredAt: Date;
      readonly metadata: WorkspaceAuditMetadata & {
        readonly reason: "removed_by_administrator" | "voluntary_departure";
      };
    }
  | {
      readonly id: string;
      readonly type: "workspace.member_invited";
      readonly version: 1;
      readonly actorAccountId: UserId;
      readonly occurredAt: Date;
      readonly metadata: {
        readonly workspaceId: WorkspaceId;
        readonly invitationId: WorkspaceInvitationId;
        readonly inviteeEmail: EmailAddress;
      };
    }
  | {
      readonly id: string;
      readonly type: "workspace.invitation_accepted";
      readonly version: 1;
      readonly actorAccountId: UserId;
      readonly occurredAt: Date;
      readonly metadata: WorkspaceAuditMetadata & {
        readonly invitationId: WorkspaceInvitationId;
      };
    }
  | {
      readonly id: string;
      readonly type: "workspace.role_changed";
      readonly version: 1;
      readonly actorAccountId: UserId;
      readonly occurredAt: Date;
      readonly metadata: WorkspaceAuditMetadata & {
        readonly previousRole: WorkspaceRole;
        readonly role: WorkspaceRole;
      };
    };

export interface WorkspaceAccessTransaction {
  readonly serializeWorkspaceTransition: (
    actorAccountId: UserId,
    workspaceId: WorkspaceId,
  ) => Effect.Effect<WorkspaceTransitionFacts, WorkspaceAccessPersistenceFailure>;
  readonly serializeAccountWorkspaceRelationship: (
    actorAccountId: UserId,
    workspaceId: WorkspaceId,
  ) => Effect.Effect<IdentityMembershipFacts, WorkspaceAccessPersistenceFailure>;
  readonly serializeInviteMember: (
    actorAccountId: UserId,
    workspaceId: WorkspaceId,
    inviteeEmail: EmailAddress,
  ) => Effect.Effect<InviteWorkspaceMemberFacts, WorkspaceAccessPersistenceFailure>;
  readonly serializeInvitationAcceptance: (
    actorAccountId: UserId,
    invitationId: WorkspaceInvitationId,
  ) => Effect.Effect<InvitationAcceptanceFacts, WorkspaceAccessPersistenceFailure>;
  readonly serializeInvitationRedemption: (
    token: WorkspaceInvitationToken,
    proposedAccountId: UserId,
    redeemedAt: Date,
  ) => Effect.Effect<InvitationRedemptionFacts, WorkspaceAccessPersistenceFailure>;
  readonly serializeFullMemberAdministration: (
    actorAccountId: UserId,
    workspaceId: WorkspaceId,
    workspaceIdentityId: WorkspaceIdentity["id"],
  ) => Effect.Effect<FullMemberAdministrationFacts, WorkspaceAccessPersistenceFailure>;
  readonly createWorkspaceWithOwner: (
    access: WorkspaceAccessView,
  ) => Effect.Effect<void, WorkspaceAccessPersistenceFailure>;
  readonly startFirstMembership: (
    access: WorkspaceAccessView,
  ) => Effect.Effect<void, WorkspaceAccessPersistenceFailure>;
  readonly reactivateMembership: (
    identity: WorkspaceIdentity,
    membership: WorkspaceMembership,
  ) => Effect.Effect<void, WorkspaceAccessPersistenceFailure>;
  readonly updateActiveIdentity: (
    actorAccountId: UserId,
    workspaceId: WorkspaceId,
    profile: WorkspaceIdentityProfile,
  ) => Effect.Effect<void, WorkspaceAccessPersistenceFailure>;
  readonly endMembershipAndRevokeChannels: (
    actorAccountId: UserId,
    workspaceId: WorkspaceId,
    endedAt: Date,
  ) => Effect.Effect<void, WorkspaceAccessPersistenceFailure>;
  readonly createInvitation: (
    invitation: WorkspaceInvitationRecord,
  ) => Effect.Effect<WorkspaceInvitationToken, WorkspaceAccessPersistenceFailure>;
  readonly refreshInvitation: (
    invitation: WorkspaceInvitationRecord,
  ) => Effect.Effect<WorkspaceInvitationToken, WorkspaceAccessPersistenceFailure>;
  readonly createAccount: (account: User) => Effect.Effect<void, WorkspaceAccessPersistenceFailure>;
  readonly acceptInvitation: (
    invitationId: WorkspaceInvitationId,
    acceptedByAccountId: UserId,
    acceptedAt: Date,
  ) => Effect.Effect<void, WorkspaceAccessPersistenceFailure>;
  readonly updateMemberRole: (
    workspaceId: WorkspaceId,
    workspaceIdentityId: WorkspaceIdentity["id"],
    role: WorkspaceRole,
  ) => Effect.Effect<void, WorkspaceAccessPersistenceFailure>;
  readonly endFullMemberAndRevokeChannels: (
    workspaceId: WorkspaceId,
    workspaceIdentityId: WorkspaceIdentity["id"],
    endedAt: Date,
  ) => Effect.Effect<void, WorkspaceAccessPersistenceFailure>;
  readonly appendAudit: (
    event: WorkspaceAccessAuditEvent,
  ) => Effect.Effect<void, WorkspaceAccessPersistenceFailure>;
}

export interface WorkspaceAccessPersistenceService {
  readonly readActiveAccess: (
    actorAccountId: UserId,
    workspaceId: WorkspaceId,
  ) => Effect.Effect<WorkspaceAccessView | undefined, WorkspaceAccessPersistenceFailure>;
  readonly listActiveAccess: (
    actorAccountId: UserId,
  ) => Effect.Effect<ReadonlyArray<WorkspaceAccessView>, WorkspaceAccessPersistenceFailure>;
  readonly listPendingInvitations: (
    actorAccountId: UserId,
    activeAt: Date,
  ) => Effect.Effect<ReadonlyArray<WorkspaceInvitationView>, WorkspaceAccessPersistenceFailure>;
  readonly listFullMembersForAdministrator: (
    actorAccountId: UserId,
    workspaceId: WorkspaceId,
  ) => Effect.Effect<ReadonlyArray<FullMemberView> | undefined, WorkspaceAccessPersistenceFailure>;
  readonly transact: <A, E>(
    use: (transaction: WorkspaceAccessTransaction) => Effect.Effect<A, E>,
  ) => Effect.Effect<A, E | WorkspaceAccessPersistenceFailure>;
}

export class WorkspaceAccessPersistence extends Context.Service<
  WorkspaceAccessPersistence,
  WorkspaceAccessPersistenceService
>()("@cove/application/WorkspaceAccessPersistence") {}
