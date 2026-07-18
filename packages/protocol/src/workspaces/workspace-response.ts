import { Schema } from "effect";

export const WorkspaceRoleResponse = Schema.Literals(["owner", "admin", "member", "guest"]);

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

export const WorkspaceJoinedResponse = Schema.Struct({
  outcome: Schema.Literals(["FirstMembershipStarted", "WorkspaceMembershipReactivated"]),
  ...workspaceMutationResponseFields,
}).annotate({ identifier: "WorkspaceJoinedResponse" });
export interface WorkspaceJoinedResponse extends Schema.Schema.Type<
  typeof WorkspaceJoinedResponse
> {}

export const WorkspaceIdentityUpdateResponse = Schema.Struct({
  outcome: Schema.Literals(["WorkspaceIdentityUpdated", "IdentityProfileUnchanged"]),
  ...workspaceMutationResponseFields,
}).annotate({ identifier: "WorkspaceIdentityUpdateResponse" });
export interface WorkspaceIdentityUpdateResponse extends Schema.Schema.Type<
  typeof WorkspaceIdentityUpdateResponse
> {}
