import {
  ChannelId,
  DisplayName,
  EmailAddress,
  User,
  UserId,
  Workspace,
  WorkspaceId,
  WorkspaceIdentity,
  WorkspaceIdentityProfile,
  WorkspaceInvitationId,
  WorkspaceMembership,
  WorkspaceName,
} from "@cove/domain";
import { WorkspaceInvitationToken } from "@cove/ports";
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

export const PendingWorkspaceInvitationView = Schema.Struct({
  id: WorkspaceInvitationId,
  workspaceId: WorkspaceId,
  inviteeEmail: EmailAddress,
  invitedAt: Schema.DateFromString,
  tokenExpiresAt: Schema.DateFromString,
});
export interface PendingWorkspaceInvitationView extends Schema.Schema.Type<
  typeof PendingWorkspaceInvitationView
> {}

export const WORKSPACE_INVITATION_RESEND_COOLDOWN_MILLIS = 60_000;

export function workspaceInvitationResendAvailableAt(invitedAt: Date): Date {
  return new Date(invitedAt.getTime() + WORKSPACE_INVITATION_RESEND_COOLDOWN_MILLIS);
}

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

const WorkspaceInvitationAdministrationCommandFields = {
  actorAccountId: UserId,
  workspaceId: WorkspaceId,
  invitationId: WorkspaceInvitationId,
};

export const ResendWorkspaceInvitationCommand = Schema.Struct(
  WorkspaceInvitationAdministrationCommandFields,
);
export interface ResendWorkspaceInvitationCommand extends Schema.Schema.Type<
  typeof ResendWorkspaceInvitationCommand
> {}

export const RevokeWorkspaceInvitationCommand = Schema.Struct(
  WorkspaceInvitationAdministrationCommandFields,
);
export interface RevokeWorkspaceInvitationCommand extends Schema.Schema.Type<
  typeof RevokeWorkspaceInvitationCommand
> {}

export const AcceptWorkspaceInvitationCommand = Schema.Struct({
  actorAccountId: UserId,
  invitationId: WorkspaceInvitationId,
  initialIdentityProfile: Schema.optionalKey(WorkspaceIdentityProfile),
});
export interface AcceptWorkspaceInvitationCommand extends Schema.Schema.Type<
  typeof AcceptWorkspaceInvitationCommand
> {}

export const RedeemWorkspaceInvitationCommand = Schema.Struct({
  token: WorkspaceInvitationToken,
  displayName: DisplayName,
  initialIdentityProfile: WorkspaceIdentityProfile,
});
export interface RedeemWorkspaceInvitationCommand extends Schema.Schema.Type<
  typeof RedeemWorkspaceInvitationCommand
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

export const RemoveFullMemberCommand = Schema.Struct({
  actorAccountId: UserId,
  workspaceId: WorkspaceId,
  workspaceIdentityId: WorkspaceIdentity.fields.id,
});
export interface RemoveFullMemberCommand extends Schema.Schema.Type<
  typeof RemoveFullMemberCommand
> {}

export const WorkspaceCreated = Schema.TaggedStruct("WorkspaceCreated", {
  workspaceId: WorkspaceId,
  workspaceIdentityId: WorkspaceIdentity.fields.id,
  generalChannelId: ChannelId,
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

export const WorkspaceInvitationIssued = Schema.TaggedStruct("WorkspaceInvitationIssued", {
  invitationId: WorkspaceInvitationId,
  workspaceId: WorkspaceId,
  inviteeEmail: EmailAddress,
  occurredAt: Schema.DateFromString,
});
export type WorkspaceInvitationIssued = typeof WorkspaceInvitationIssued.Type;

export const WorkspaceInvitationResent = Schema.TaggedStruct("WorkspaceInvitationResent", {
  invitationId: WorkspaceInvitationId,
  workspaceId: WorkspaceId,
  inviteeEmail: EmailAddress,
  occurredAt: Schema.DateFromString,
});
export type WorkspaceInvitationResent = typeof WorkspaceInvitationResent.Type;

export const WorkspaceInvitationRevoked = Schema.TaggedStruct("WorkspaceInvitationRevoked", {
  invitationId: WorkspaceInvitationId,
  workspaceId: WorkspaceId,
  inviteeEmail: EmailAddress,
  occurredAt: Schema.DateFromString,
});
export type WorkspaceInvitationRevoked = typeof WorkspaceInvitationRevoked.Type;

export const WorkspaceInvitationAccepted = Schema.TaggedStruct("WorkspaceInvitationAccepted", {
  invitationId: WorkspaceInvitationId,
  workspaceId: WorkspaceId,
  workspaceIdentityId: WorkspaceIdentity.fields.id,
  occurredAt: Schema.DateFromString,
});
export type WorkspaceInvitationAccepted = typeof WorkspaceInvitationAccepted.Type;

export const WorkspaceInvitationRedeemed = Schema.TaggedStruct("WorkspaceInvitationRedeemed", {
  account: User,
  invitationId: WorkspaceInvitationId,
  workspaceId: WorkspaceId,
  workspaceIdentityId: WorkspaceIdentity.fields.id,
  occurredAt: Schema.DateFromString,
});
export type WorkspaceInvitationRedeemed = typeof WorkspaceInvitationRedeemed.Type;

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

export const FullMemberRemoved = Schema.TaggedStruct("FullMemberRemoved", {
  workspaceId: WorkspaceId,
  workspaceIdentityId: WorkspaceIdentity.fields.id,
  endedAt: Schema.DateFromString,
});
export type FullMemberRemoved = typeof FullMemberRemoved.Type;

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

export class WorkspaceInvitationUnavailable extends Schema.TaggedErrorClass<WorkspaceInvitationUnavailable>()(
  "Application.WorkspaceInvitationUnavailable",
  { invitationId: WorkspaceInvitationId },
) {}

export class WorkspaceInvitationResendTooSoon extends Schema.TaggedErrorClass<WorkspaceInvitationResendTooSoon>()(
  "Application.WorkspaceInvitationResendTooSoon",
  {
    invitationId: WorkspaceInvitationId,
    resendAvailableAt: Schema.DateFromString,
  },
) {}

export class WorkspaceInvitationRedemptionUnavailable extends Schema.TaggedErrorClass<WorkspaceInvitationRedemptionUnavailable>()(
  "Application.WorkspaceInvitationRedemptionUnavailable",
  {},
) {}

export class FullMemberUnavailable extends Schema.TaggedErrorClass<FullMemberUnavailable>()(
  "Application.FullMemberUnavailable",
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
  | WorkspaceUnavailable;
export type ListPendingWorkspaceInvitationsFailure =
  | WorkspaceAccessFailure
  | WorkspaceAdministrationForbidden
  | WorkspaceUnavailable;
export type AdministerWorkspaceInvitationFailure =
  | WorkspaceAccessFailure
  | WorkspaceAdministrationForbidden
  | WorkspaceInvitationUnavailable
  | WorkspaceUnavailable;
export type ResendWorkspaceInvitationFailure =
  | AdministerWorkspaceInvitationFailure
  | WorkspaceInvitationResendTooSoon;
export type RevokeWorkspaceInvitationFailure = AdministerWorkspaceInvitationFailure;
export type AcceptWorkspaceInvitationFailure =
  | AlreadyWorkspaceMember
  | ExistingWorkspaceIdentityProfileNotAccepted
  | InitialWorkspaceIdentityProfileRequired
  | WorkspaceAccessFailure
  | WorkspaceInvitationUnavailable;
export type RedeemWorkspaceInvitationFailure =
  | AlreadyWorkspaceMember
  | WorkspaceAccessFailure
  | WorkspaceInvitationRedemptionUnavailable;
export type ListFullMembersFailure =
  | WorkspaceAccessFailure
  | WorkspaceAdministrationForbidden
  | WorkspaceUnavailable;
export type ChangeWorkspaceRoleFailure =
  | LastWorkspaceOwner
  | WorkspaceAccessFailure
  | WorkspaceAdministrationForbidden
  | FullMemberUnavailable
  | WorkspaceUnavailable;
export type RemoveFullMemberFailure = ChangeWorkspaceRoleFailure;

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
  readonly listPendingInvitationsForAdministrator: (
    actorAccountId: UserId,
    workspaceId: WorkspaceId,
  ) => Effect.Effect<
    ReadonlyArray<PendingWorkspaceInvitationView>,
    ListPendingWorkspaceInvitationsFailure
  >;
  readonly listFullMembersForActor: (
    actorAccountId: UserId,
    workspaceId: WorkspaceId,
  ) => Effect.Effect<ReadonlyArray<FullMemberView>, ListFullMembersFailure>;
  readonly inviteMember: (
    command: InviteWorkspaceMemberCommand,
  ) => Effect.Effect<WorkspaceInvitationIssued, InviteWorkspaceMemberFailure>;
  readonly resendInvitation: (
    command: ResendWorkspaceInvitationCommand,
  ) => Effect.Effect<WorkspaceInvitationResent, ResendWorkspaceInvitationFailure>;
  readonly revokeInvitation: (
    command: RevokeWorkspaceInvitationCommand,
  ) => Effect.Effect<WorkspaceInvitationRevoked, RevokeWorkspaceInvitationFailure>;
  readonly acceptInvitation: (
    command: AcceptWorkspaceInvitationCommand,
  ) => Effect.Effect<WorkspaceInvitationAccepted, AcceptWorkspaceInvitationFailure>;
  readonly redeemInvitation: (
    command: RedeemWorkspaceInvitationCommand,
  ) => Effect.Effect<WorkspaceInvitationRedeemed, RedeemWorkspaceInvitationFailure>;
  readonly changeMemberRole: (
    command: ChangeWorkspaceRoleCommand,
  ) => Effect.Effect<WorkspaceRoleChanged | WorkspaceRoleUnchanged, ChangeWorkspaceRoleFailure>;
  readonly removeFullMember: (
    command: RemoveFullMemberCommand,
  ) => Effect.Effect<FullMemberRemoved, RemoveFullMemberFailure>;
}

export class WorkspaceAccess extends Context.Service<WorkspaceAccess, WorkspaceAccessService>()(
  "@cove/application/WorkspaceAccess",
) {}
