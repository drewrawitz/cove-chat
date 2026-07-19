import {
  UserId,
  Workspace,
  WorkspaceId,
  WorkspaceIdentity,
  WorkspaceIdentityProfile,
  WorkspaceMembership,
  WorkspaceName,
} from "@cove/domain";
import { Context, type Effect, Schema } from "effect";

export const WorkspaceAccessView = Schema.Struct({
  workspace: Workspace,
  identity: WorkspaceIdentity,
  membership: WorkspaceMembership,
});
export interface WorkspaceAccessView extends Schema.Schema.Type<typeof WorkspaceAccessView> {}

export const CreateWorkspaceCommand = Schema.Struct({
  actorAccountId: UserId,
  workspaceName: WorkspaceName,
  initialIdentityProfile: WorkspaceIdentityProfile,
});
export interface CreateWorkspaceCommand extends Schema.Schema.Type<typeof CreateWorkspaceCommand> {}

export const JoinWorkspaceCommand = Schema.Struct({
  actorAccountId: UserId,
  workspaceId: WorkspaceId,
  initialIdentityProfile: Schema.optionalKey(WorkspaceIdentityProfile),
});
export interface JoinWorkspaceCommand extends Schema.Schema.Type<typeof JoinWorkspaceCommand> {}

export const UpdateWorkspaceIdentityCommand = Schema.Struct({
  actorAccountId: UserId,
  workspaceId: WorkspaceId,
  profile: WorkspaceIdentityProfile,
});
export interface UpdateWorkspaceIdentityCommand extends Schema.Schema.Type<
  typeof UpdateWorkspaceIdentityCommand
> {}

export const LeaveWorkspaceCommand = Schema.Struct({
  actorAccountId: UserId,
  workspaceId: WorkspaceId,
});
export interface LeaveWorkspaceCommand extends Schema.Schema.Type<typeof LeaveWorkspaceCommand> {}

export const WorkspaceCreated = Schema.TaggedStruct("WorkspaceCreated", {
  workspaceId: WorkspaceId,
  workspaceIdentityId: WorkspaceIdentity.fields.id,
  occurredAt: Schema.DateFromString,
});
export type WorkspaceCreated = typeof WorkspaceCreated.Type;

export const FirstMembershipStarted = Schema.TaggedStruct("FirstMembershipStarted", {
  workspaceId: WorkspaceId,
  workspaceIdentityId: WorkspaceIdentity.fields.id,
  occurredAt: Schema.DateFromString,
});
export type FirstMembershipStarted = typeof FirstMembershipStarted.Type;

export const WorkspaceMembershipReactivated = Schema.TaggedStruct(
  "WorkspaceMembershipReactivated",
  {
    workspaceId: WorkspaceId,
    workspaceIdentityId: WorkspaceIdentity.fields.id,
    occurredAt: Schema.DateFromString,
  },
);
export type WorkspaceMembershipReactivated = typeof WorkspaceMembershipReactivated.Type;

export const WorkspaceIdentityUpdated = Schema.TaggedStruct("WorkspaceIdentityUpdated", {
  workspaceId: WorkspaceId,
  workspaceIdentityId: WorkspaceIdentity.fields.id,
  occurredAt: Schema.DateFromString,
});
export type WorkspaceIdentityUpdated = typeof WorkspaceIdentityUpdated.Type;

export const IdentityProfileUnchanged = Schema.TaggedStruct("IdentityProfileUnchanged", {
  workspaceId: WorkspaceId,
  workspaceIdentityId: WorkspaceIdentity.fields.id,
  occurredAt: Schema.DateFromString,
});
export type IdentityProfileUnchanged = typeof IdentityProfileUnchanged.Type;

export const WorkspaceMembershipEnded = Schema.TaggedStruct("WorkspaceMembershipEnded", {
  workspaceId: WorkspaceId,
  workspaceIdentityId: WorkspaceIdentity.fields.id,
  endedAt: Schema.DateFromString,
});
export type WorkspaceMembershipEnded = typeof WorkspaceMembershipEnded.Type;

export class WorkspaceUnavailable extends Schema.TaggedErrorClass<WorkspaceUnavailable>()(
  "Application.WorkspaceUnavailable",
  { workspaceId: WorkspaceId },
) {}

export class AlreadyWorkspaceMember extends Schema.TaggedErrorClass<AlreadyWorkspaceMember>()(
  "Application.AlreadyWorkspaceMember",
  { workspaceId: WorkspaceId },
) {}

export class InitialWorkspaceIdentityProfileRequired extends Schema.TaggedErrorClass<InitialWorkspaceIdentityProfileRequired>()(
  "Application.InitialWorkspaceIdentityProfileRequired",
  { workspaceId: WorkspaceId },
) {}

export class ExistingWorkspaceIdentityProfileNotAccepted extends Schema.TaggedErrorClass<ExistingWorkspaceIdentityProfileNotAccepted>()(
  "Application.ExistingWorkspaceIdentityProfileNotAccepted",
  { workspaceId: WorkspaceId },
) {}

export class LastWorkspaceOwner extends Schema.TaggedErrorClass<LastWorkspaceOwner>()(
  "Application.LastWorkspaceOwner",
  { workspaceId: WorkspaceId },
) {}

export class WorkspaceAccessFailure extends Schema.TaggedErrorClass<WorkspaceAccessFailure>()(
  "Application.WorkspaceAccessFailure",
  { operation: Schema.String },
) {}

export type CreateWorkspaceFailure = WorkspaceAccessFailure;
export type JoinWorkspaceFailure =
  | AlreadyWorkspaceMember
  | ExistingWorkspaceIdentityProfileNotAccepted
  | InitialWorkspaceIdentityProfileRequired
  | WorkspaceAccessFailure
  | WorkspaceUnavailable;
export type UpdateWorkspaceIdentityFailure = WorkspaceAccessFailure | WorkspaceUnavailable;
export type LeaveWorkspaceFailure =
  | LastWorkspaceOwner
  | WorkspaceAccessFailure
  | WorkspaceUnavailable;

export interface WorkspaceAccessService {
  readonly listForActor: (
    actorAccountId: UserId,
  ) => Effect.Effect<ReadonlyArray<WorkspaceAccessView>, WorkspaceAccessFailure>;
  readonly getForActor: (
    actorAccountId: UserId,
    workspaceId: WorkspaceId,
  ) => Effect.Effect<WorkspaceAccessView, WorkspaceAccessFailure | WorkspaceUnavailable>;
  readonly create: (
    command: CreateWorkspaceCommand,
  ) => Effect.Effect<WorkspaceCreated, CreateWorkspaceFailure>;
  readonly join: (
    command: JoinWorkspaceCommand,
  ) => Effect.Effect<FirstMembershipStarted | WorkspaceMembershipReactivated, JoinWorkspaceFailure>;
  readonly updateMyIdentity: (
    command: UpdateWorkspaceIdentityCommand,
  ) => Effect.Effect<
    IdentityProfileUnchanged | WorkspaceIdentityUpdated,
    UpdateWorkspaceIdentityFailure
  >;
  readonly leave: (
    command: LeaveWorkspaceCommand,
  ) => Effect.Effect<WorkspaceMembershipEnded, LeaveWorkspaceFailure>;
}

export class WorkspaceAccess extends Context.Service<WorkspaceAccess, WorkspaceAccessService>()(
  "@cove/application/WorkspaceAccess",
) {}
