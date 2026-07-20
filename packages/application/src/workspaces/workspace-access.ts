import {
  EmailAddress,
  UserId,
  Workspace,
  WorkspaceId,
  WorkspaceIdentity,
  WorkspaceIdentityProfile,
  WorkspaceInvitationId,
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

export const FullMemberRole = Schema.Literals(["owner", "admin", "member"]);
export type FullMemberRole = typeof FullMemberRole.Type;

export const FullMemberMembership = Schema.Struct({
  ...WorkspaceMembership.fields,
  role: FullMemberRole,
});
export interface FullMemberMembership extends Schema.Schema.Type<typeof FullMemberMembership> {}

export const FullMemberView = Schema.Struct({
  identity: WorkspaceIdentity,
  membership: FullMemberMembership,
});
export interface FullMemberView extends Schema.Schema.Type<typeof FullMemberView> {}

export const WorkspaceInvitationView = Schema.Struct({
  id: WorkspaceInvitationId,
  workspace: Workspace,
  role: Schema.Literals(["member"]),
  requiresIdentityProfile: Schema.Boolean,
  invitedAt: Schema.DateFromString,
});
export interface WorkspaceInvitationView extends Schema.Schema.Type<
  typeof WorkspaceInvitationView
> {}

export const CreateWorkspaceCommand = Schema.Struct({
  actorAccountId: UserId,
  workspaceName: WorkspaceName,
  initialIdentityProfile: WorkspaceIdentityProfile,
});
export interface CreateWorkspaceCommand extends Schema.Schema.Type<typeof CreateWorkspaceCommand> {}

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

export const InviteWorkspaceMemberCommand = Schema.Struct({
  actorAccountId: UserId,
  workspaceId: WorkspaceId,
  inviteeEmail: EmailAddress,
});
export interface InviteWorkspaceMemberCommand extends Schema.Schema.Type<
  typeof InviteWorkspaceMemberCommand
> {}

export const AcceptWorkspaceInvitationCommand = Schema.Struct({
  actorAccountId: UserId,
  invitationId: WorkspaceInvitationId,
  initialIdentityProfile: Schema.optionalKey(WorkspaceIdentityProfile),
});
export interface AcceptWorkspaceInvitationCommand extends Schema.Schema.Type<
  typeof AcceptWorkspaceInvitationCommand
> {}

export const ChangeWorkspaceRoleCommand = Schema.Struct({
  actorAccountId: UserId,
  workspaceId: WorkspaceId,
  workspaceIdentityId: WorkspaceIdentity.fields.id,
  role: FullMemberRole,
});
export interface ChangeWorkspaceRoleCommand extends Schema.Schema.Type<
  typeof ChangeWorkspaceRoleCommand
> {}

export const RemoveWorkspaceMemberCommand = Schema.Struct({
  actorAccountId: UserId,
  workspaceId: WorkspaceId,
  workspaceIdentityId: WorkspaceIdentity.fields.id,
});
export interface RemoveWorkspaceMemberCommand extends Schema.Schema.Type<
  typeof RemoveWorkspaceMemberCommand
> {}

export const WorkspaceCreated = Schema.TaggedStruct("WorkspaceCreated", {
  workspaceId: WorkspaceId,
  workspaceIdentityId: WorkspaceIdentity.fields.id,
  occurredAt: Schema.DateFromString,
});
export type WorkspaceCreated = typeof WorkspaceCreated.Type;

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

export const WorkspaceInvitationCreated = Schema.TaggedStruct("WorkspaceInvitationCreated", {
  invitationId: WorkspaceInvitationId,
  workspaceId: WorkspaceId,
  inviteeAccountId: UserId,
  occurredAt: Schema.DateFromString,
});
export type WorkspaceInvitationCreated = typeof WorkspaceInvitationCreated.Type;

export const WorkspaceInvitationAccepted = Schema.TaggedStruct("WorkspaceInvitationAccepted", {
  invitationId: WorkspaceInvitationId,
  workspaceId: WorkspaceId,
  workspaceIdentityId: WorkspaceIdentity.fields.id,
  occurredAt: Schema.DateFromString,
});
export type WorkspaceInvitationAccepted = typeof WorkspaceInvitationAccepted.Type;

export const WorkspaceRoleChanged = Schema.TaggedStruct("WorkspaceRoleChanged", {
  workspaceId: WorkspaceId,
  workspaceIdentityId: WorkspaceIdentity.fields.id,
  previousRole: FullMemberRole,
  role: FullMemberRole,
  occurredAt: Schema.DateFromString,
});
export type WorkspaceRoleChanged = typeof WorkspaceRoleChanged.Type;

export const WorkspaceRoleUnchanged = Schema.TaggedStruct("WorkspaceRoleUnchanged", {
  workspaceId: WorkspaceId,
  workspaceIdentityId: WorkspaceIdentity.fields.id,
  role: FullMemberRole,
  occurredAt: Schema.DateFromString,
});
export type WorkspaceRoleUnchanged = typeof WorkspaceRoleUnchanged.Type;

export const WorkspaceMemberRemoved = Schema.TaggedStruct("WorkspaceMemberRemoved", {
  workspaceId: WorkspaceId,
  workspaceIdentityId: WorkspaceIdentity.fields.id,
  endedAt: Schema.DateFromString,
});
export type WorkspaceMemberRemoved = typeof WorkspaceMemberRemoved.Type;

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

export class WorkspaceAdministrationForbidden extends Schema.TaggedErrorClass<WorkspaceAdministrationForbidden>()(
  "Application.WorkspaceAdministrationForbidden",
  { workspaceId: WorkspaceId },
) {}

export class WorkspaceInviteeUnavailable extends Schema.TaggedErrorClass<WorkspaceInviteeUnavailable>()(
  "Application.WorkspaceInviteeUnavailable",
  { workspaceId: WorkspaceId },
) {}

export class WorkspaceInvitationAlreadyPending extends Schema.TaggedErrorClass<WorkspaceInvitationAlreadyPending>()(
  "Application.WorkspaceInvitationAlreadyPending",
  { workspaceId: WorkspaceId },
) {}

export class WorkspaceInvitationUnavailable extends Schema.TaggedErrorClass<WorkspaceInvitationUnavailable>()(
  "Application.WorkspaceInvitationUnavailable",
  { invitationId: WorkspaceInvitationId },
) {}

export class WorkspaceMemberUnavailable extends Schema.TaggedErrorClass<WorkspaceMemberUnavailable>()(
  "Application.WorkspaceMemberUnavailable",
  {
    workspaceId: WorkspaceId,
    workspaceIdentityId: WorkspaceIdentity.fields.id,
  },
) {}

export class WorkspaceAccessFailure extends Schema.TaggedErrorClass<WorkspaceAccessFailure>()(
  "Application.WorkspaceAccessFailure",
  { operation: Schema.String },
) {}

export type CreateWorkspaceFailure = WorkspaceAccessFailure;
export type UpdateWorkspaceIdentityFailure = WorkspaceAccessFailure | WorkspaceUnavailable;
export type LeaveWorkspaceFailure =
  | LastWorkspaceOwner
  | WorkspaceAccessFailure
  | WorkspaceUnavailable;
export type InviteWorkspaceMemberFailure =
  | AlreadyWorkspaceMember
  | WorkspaceAccessFailure
  | WorkspaceAdministrationForbidden
  | WorkspaceInvitationAlreadyPending
  | WorkspaceInviteeUnavailable
  | WorkspaceUnavailable;
export type AcceptWorkspaceInvitationFailure =
  | AlreadyWorkspaceMember
  | ExistingWorkspaceIdentityProfileNotAccepted
  | InitialWorkspaceIdentityProfileRequired
  | WorkspaceAccessFailure
  | WorkspaceInvitationUnavailable;
export type ListWorkspaceMembersFailure =
  | WorkspaceAccessFailure
  | WorkspaceAdministrationForbidden
  | WorkspaceUnavailable;
export type ChangeWorkspaceRoleFailure =
  | LastWorkspaceOwner
  | WorkspaceAccessFailure
  | WorkspaceAdministrationForbidden
  | WorkspaceMemberUnavailable
  | WorkspaceUnavailable;
export type RemoveWorkspaceMemberFailure = ChangeWorkspaceRoleFailure;

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
  readonly updateMyIdentity: (
    command: UpdateWorkspaceIdentityCommand,
  ) => Effect.Effect<
    IdentityProfileUnchanged | WorkspaceIdentityUpdated,
    UpdateWorkspaceIdentityFailure
  >;
  readonly leave: (
    command: LeaveWorkspaceCommand,
  ) => Effect.Effect<WorkspaceMembershipEnded, LeaveWorkspaceFailure>;
  readonly listInvitationsForActor: (
    actorAccountId: UserId,
  ) => Effect.Effect<ReadonlyArray<WorkspaceInvitationView>, WorkspaceAccessFailure>;
  readonly listMembersForActor: (
    actorAccountId: UserId,
    workspaceId: WorkspaceId,
  ) => Effect.Effect<ReadonlyArray<FullMemberView>, ListWorkspaceMembersFailure>;
  readonly inviteMember: (
    command: InviteWorkspaceMemberCommand,
  ) => Effect.Effect<WorkspaceInvitationCreated, InviteWorkspaceMemberFailure>;
  readonly acceptInvitation: (
    command: AcceptWorkspaceInvitationCommand,
  ) => Effect.Effect<WorkspaceInvitationAccepted, AcceptWorkspaceInvitationFailure>;
  readonly changeMemberRole: (
    command: ChangeWorkspaceRoleCommand,
  ) => Effect.Effect<WorkspaceRoleChanged | WorkspaceRoleUnchanged, ChangeWorkspaceRoleFailure>;
  readonly removeMember: (
    command: RemoveWorkspaceMemberCommand,
  ) => Effect.Effect<WorkspaceMemberRemoved, RemoveWorkspaceMemberFailure>;
}

export class WorkspaceAccess extends Context.Service<WorkspaceAccess, WorkspaceAccessService>()(
  "@cove/application/WorkspaceAccess",
) {}
