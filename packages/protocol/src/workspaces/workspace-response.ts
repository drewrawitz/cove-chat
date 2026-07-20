import { Schema } from "effect";

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
}).annotate({ identifier: "WorkspaceAccessResponse" });
export interface WorkspaceAccessResponse extends Schema.Schema.Type<
  typeof WorkspaceAccessResponse
> {}

export const WorkspaceMemberResponse = Schema.Struct({
  identity: WorkspaceIdentityResponse,
  membership: Schema.Struct({ role: FullMemberRoleResponse }),
}).annotate({ identifier: "WorkspaceMemberResponse" });
export interface WorkspaceMemberResponse extends Schema.Schema.Type<
  typeof WorkspaceMemberResponse
> {}

export const WorkspaceMemberListResponse = Schema.Struct({
  members: Schema.Array(WorkspaceMemberResponse),
}).annotate({ identifier: "WorkspaceMemberListResponse" });
export interface WorkspaceMemberListResponse extends Schema.Schema.Type<
  typeof WorkspaceMemberListResponse
> {}

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

const workspaceMutationResponseFields = {
  workspaceId: Schema.String,
  workspaceIdentityId: Schema.String,
  occurredAt: Schema.DateFromString,
};

export const WorkspaceCreatedResponse = Schema.Struct({
  outcome: Schema.Literals(["WorkspaceCreated"]),
  ...workspaceMutationResponseFields,
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

export const WorkspaceInvitationCreatedResponse = Schema.Struct({
  outcome: Schema.Literals(["WorkspaceInvitationCreated"]),
  invitationId: Schema.String,
  workspaceId: Schema.String,
  inviteeAccountId: Schema.String,
  occurredAt: Schema.DateFromString,
}).annotate({ identifier: "WorkspaceInvitationCreatedResponse" });
export interface WorkspaceInvitationCreatedResponse extends Schema.Schema.Type<
  typeof WorkspaceInvitationCreatedResponse
> {}

export const WorkspaceInvitationAcceptedResponse = Schema.Struct({
  outcome: Schema.Literals(["WorkspaceInvitationAccepted"]),
  invitationId: Schema.String,
  ...workspaceMutationResponseFields,
}).annotate({ identifier: "WorkspaceInvitationAcceptedResponse" });
export interface WorkspaceInvitationAcceptedResponse extends Schema.Schema.Type<
  typeof WorkspaceInvitationAcceptedResponse
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
