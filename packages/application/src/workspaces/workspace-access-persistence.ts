import type {
  UserId,
  Workspace,
  WorkspaceId,
  WorkspaceIdentity,
  WorkspaceIdentityProfile,
  WorkspaceMembership,
} from "@cove/domain";
import { Context, type Effect, Schema } from "effect";
import type { CommandId, WorkspaceAccessView } from "./workspace-access.ts";

export const WorkspaceAccessCommandKind = Schema.Literals([
  "create_workspace",
  "join_workspace",
  "update_workspace_identity",
  "leave_workspace",
]);
export type WorkspaceAccessCommandKind = typeof WorkspaceAccessCommandKind.Type;

export class WorkspaceAccessPersistenceFailure extends Schema.TaggedErrorClass<WorkspaceAccessPersistenceFailure>()(
  "Application.WorkspaceAccessPersistenceFailure",
  {
    operation: Schema.String,
    retryable: Schema.Boolean,
    cause: Schema.Defect(),
  },
) {}

export interface CommittedWorkspaceAccessCommand {
  readonly commandKind: WorkspaceAccessCommandKind;
  readonly inputFingerprint: string;
  readonly outcomeVersion: 1;
  readonly outcome: unknown;
}

export interface IdentityMembershipFacts {
  readonly workspace: Workspace | undefined;
  readonly identity: WorkspaceIdentity | undefined;
  readonly membership: WorkspaceMembership | undefined;
}

export interface WorkspaceTransitionFacts extends IdentityMembershipFacts {
  readonly activeOwnerCount: number;
}

export type WorkspaceIdentityChangedField = "avatarUrl" | "name";

interface WorkspaceAuditMetadata {
  readonly commandId: CommandId;
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
      readonly type: "workspace.membership_started" | "workspace.membership_reactivated";
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
        readonly reason: "voluntary_departure";
      };
    };

export interface WorkspaceAccessTransaction {
  readonly inspectCommittedCommand: (
    actorAccountId: UserId,
    commandId: CommandId,
  ) => Effect.Effect<
    CommittedWorkspaceAccessCommand | undefined,
    WorkspaceAccessPersistenceFailure
  >;
  readonly serializeWorkspaceTransition: (
    actorAccountId: UserId,
    workspaceId: WorkspaceId,
  ) => Effect.Effect<WorkspaceTransitionFacts, WorkspaceAccessPersistenceFailure>;
  readonly serializeAccountWorkspaceRelationship: (
    actorAccountId: UserId,
    workspaceId: WorkspaceId,
  ) => Effect.Effect<IdentityMembershipFacts, WorkspaceAccessPersistenceFailure>;
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
  readonly appendAudit: (
    event: WorkspaceAccessAuditEvent,
  ) => Effect.Effect<void, WorkspaceAccessPersistenceFailure>;
  readonly storeCommittedOutcome: (record: {
    readonly actorAccountId: UserId;
    readonly commandId: CommandId;
    readonly commandKind: WorkspaceAccessCommandKind;
    readonly inputFingerprint: string;
    readonly outcomeVersion: 1;
    readonly outcome: unknown;
    readonly committedAt: Date;
  }) => Effect.Effect<void, WorkspaceAccessPersistenceFailure>;
}

export interface WorkspaceAccessPersistenceService {
  readonly readActiveAccess: (
    actorAccountId: UserId,
    workspaceId: WorkspaceId,
  ) => Effect.Effect<WorkspaceAccessView | undefined, WorkspaceAccessPersistenceFailure>;
  readonly listActiveAccess: (
    actorAccountId: UserId,
  ) => Effect.Effect<ReadonlyArray<WorkspaceAccessView>, WorkspaceAccessPersistenceFailure>;
  readonly transact: <A, E>(
    use: (transaction: WorkspaceAccessTransaction) => Effect.Effect<A, E>,
  ) => Effect.Effect<A, E | WorkspaceAccessPersistenceFailure>;
}

export class WorkspaceAccessPersistence extends Context.Service<
  WorkspaceAccessPersistence,
  WorkspaceAccessPersistenceService
>()("@cove/application/WorkspaceAccessPersistence") {}
