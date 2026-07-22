import { Schema } from "effect";
import { CurrentUserResponse } from "../auth/current-user-response.ts";

export const WorkspaceRoleResponse = Schema.Literals(["owner", "admin", "member", "guest"]);
const FullMemberRoleResponse = Schema.Literals(["owner", "admin", "member"]);

export const WorkspaceMembershipResponse = Schema.Struct({
  role: WorkspaceRoleResponse,
}).annotate({ identifier: "WorkspaceMembershipResponse" });
export interface WorkspaceMembershipResponse extends Schema.Schema.Type<
  typeof WorkspaceMembershipResponse
> {}

export const WorkspaceIdentityResponse = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  avatarUrl: Schema.String,
}).annotate({ identifier: "WorkspaceIdentityResponse" });
export interface WorkspaceIdentityResponse extends Schema.Schema.Type<
  typeof WorkspaceIdentityResponse
> {}

export const WorkspaceSummaryResponse = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  identity: WorkspaceIdentityResponse,
  membership: WorkspaceMembershipResponse,
  generalChannelId: Schema.String,
}).annotate({ identifier: "WorkspaceSummaryResponse" });
export interface WorkspaceSummaryResponse extends Schema.Schema.Type<
  typeof WorkspaceSummaryResponse
> {}

export const WorkspaceListResponse = Schema.Struct({
  workspaces: Schema.Array(WorkspaceSummaryResponse),
}).annotate({ identifier: "WorkspaceListResponse" });
export interface WorkspaceListResponse extends Schema.Schema.Type<typeof WorkspaceListResponse> {}

export const WorkspaceAccessResponse = Schema.Struct({
  workspace: Schema.Struct({
    id: Schema.String,
    name: Schema.String,
  }),
  identity: WorkspaceIdentityResponse,
  membership: WorkspaceMembershipResponse,
  generalChannelId: Schema.String,
}).annotate({ identifier: "WorkspaceAccessResponse" });
export interface WorkspaceAccessResponse extends Schema.Schema.Type<
  typeof WorkspaceAccessResponse
> {}

export const FullMemberResponse = Schema.Struct({
  identity: WorkspaceIdentityResponse,
  membership: Schema.Struct({ role: FullMemberRoleResponse }),
}).annotate({ identifier: "FullMemberResponse" });
export interface FullMemberResponse extends Schema.Schema.Type<typeof FullMemberResponse> {}

export const FullMemberListResponse = Schema.Struct({
  members: Schema.Array(FullMemberResponse),
}).annotate({ identifier: "FullMemberListResponse" });
export interface FullMemberListResponse extends Schema.Schema.Type<typeof FullMemberListResponse> {}

export const WorkspaceInvitationResponse = Schema.Struct({
  id: Schema.String,
  workspace: Schema.Struct({
    id: Schema.String,
    name: Schema.String,
  }),
  role: Schema.Literals(["member"]),
  requiresIdentityProfile: Schema.Boolean,
  invitedAt: Schema.DateFromString,
}).annotate({ identifier: "WorkspaceInvitationResponse" });
export interface WorkspaceInvitationResponse extends Schema.Schema.Type<
  typeof WorkspaceInvitationResponse
> {}

export const WorkspaceInvitationListResponse = Schema.Struct({
  invitations: Schema.Array(WorkspaceInvitationResponse),
}).annotate({ identifier: "WorkspaceInvitationListResponse" });
export interface WorkspaceInvitationListResponse extends Schema.Schema.Type<
  typeof WorkspaceInvitationListResponse
> {}

export const PendingWorkspaceInvitationResponse = Schema.Struct({
  id: Schema.String,
  inviteeEmail: Schema.String,
  invitedAt: Schema.DateFromString,
  expiresAt: Schema.DateFromString,
  resendAvailableAt: Schema.DateFromString,
}).annotate({ identifier: "PendingWorkspaceInvitationResponse" });
export interface PendingWorkspaceInvitationResponse extends Schema.Schema.Type<
  typeof PendingWorkspaceInvitationResponse
> {}

export const PendingWorkspaceInvitationListResponse = Schema.Struct({
  invitations: Schema.Array(PendingWorkspaceInvitationResponse),
}).annotate({ identifier: "PendingWorkspaceInvitationListResponse" });
export interface PendingWorkspaceInvitationListResponse extends Schema.Schema.Type<
  typeof PendingWorkspaceInvitationListResponse
> {}

const workspaceMutationResponseFields = {
  workspaceId: Schema.String,
  workspaceIdentityId: Schema.String,
  occurredAt: Schema.DateFromString,
};

export const WorkspaceCreatedResponse = Schema.Struct({
  outcome: Schema.Literals(["WorkspaceCreated"]),
  ...workspaceMutationResponseFields,
  generalChannelId: Schema.String,
}).annotate({ identifier: "WorkspaceCreatedResponse" });
export interface WorkspaceCreatedResponse extends Schema.Schema.Type<
  typeof WorkspaceCreatedResponse
> {}

export const WorkspaceIdentityUpdateResponse = Schema.Struct({
  outcome: Schema.Literals(["WorkspaceIdentityUpdated", "IdentityProfileUnchanged"]),
  ...workspaceMutationResponseFields,
}).annotate({ identifier: "WorkspaceIdentityUpdateResponse" });
export interface WorkspaceIdentityUpdateResponse extends Schema.Schema.Type<
  typeof WorkspaceIdentityUpdateResponse
> {}

export const WorkspaceInvitationIssuedResponse = Schema.Struct({
  outcome: Schema.Literals(["WorkspaceInvitationIssued"]),
  invitationId: Schema.String,
  workspaceId: Schema.String,
  inviteeEmail: Schema.String,
  occurredAt: Schema.DateFromString,
}).annotate({ identifier: "WorkspaceInvitationIssuedResponse" });
export interface WorkspaceInvitationIssuedResponse extends Schema.Schema.Type<
  typeof WorkspaceInvitationIssuedResponse
> {}

const workspaceInvitationAdministrationResponseFields = {
  invitationId: Schema.String,
  workspaceId: Schema.String,
  inviteeEmail: Schema.String,
  occurredAt: Schema.DateFromString,
};

export const WorkspaceInvitationResentResponse = Schema.Struct({
  outcome: Schema.Literals(["WorkspaceInvitationResent"]),
  ...workspaceInvitationAdministrationResponseFields,
}).annotate({ identifier: "WorkspaceInvitationResentResponse" });
export interface WorkspaceInvitationResentResponse extends Schema.Schema.Type<
  typeof WorkspaceInvitationResentResponse
> {}

export const WorkspaceInvitationRevokedResponse = Schema.Struct({
  outcome: Schema.Literals(["WorkspaceInvitationRevoked"]),
  ...workspaceInvitationAdministrationResponseFields,
}).annotate({ identifier: "WorkspaceInvitationRevokedResponse" });
export interface WorkspaceInvitationRevokedResponse extends Schema.Schema.Type<
  typeof WorkspaceInvitationRevokedResponse
> {}

export const WorkspaceInvitationAcceptedResponse = Schema.Struct({
  outcome: Schema.Literals(["WorkspaceInvitationAccepted"]),
  invitationId: Schema.String,
  ...workspaceMutationResponseFields,
}).annotate({ identifier: "WorkspaceInvitationAcceptedResponse" });
export interface WorkspaceInvitationAcceptedResponse extends Schema.Schema.Type<
  typeof WorkspaceInvitationAcceptedResponse
> {}

export const WorkspaceInvitationRedeemedResponse = Schema.Struct({
  outcome: Schema.Literals(["WorkspaceInvitationRedeemed"]),
  account: CurrentUserResponse,
  invitationId: Schema.String,
  ...workspaceMutationResponseFields,
}).annotate({ identifier: "WorkspaceInvitationRedeemedResponse" });
export interface WorkspaceInvitationRedeemedResponse extends Schema.Schema.Type<
  typeof WorkspaceInvitationRedeemedResponse
> {}

export const WorkspaceRoleChangeResponse = Schema.Struct({
  outcome: Schema.Literals(["WorkspaceRoleChanged", "WorkspaceRoleUnchanged"]),
  workspaceId: Schema.String,
  workspaceIdentityId: Schema.String,
  previousRole: FullMemberRoleResponse,
  role: FullMemberRoleResponse,
  occurredAt: Schema.DateFromString,
}).annotate({ identifier: "WorkspaceRoleChangeResponse" });
export interface WorkspaceRoleChangeResponse extends Schema.Schema.Type<
  typeof WorkspaceRoleChangeResponse
> {}
