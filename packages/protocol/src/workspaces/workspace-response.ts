import { Schema } from "effect";

export const WorkspaceRoleResponse = Schema.Literals(["owner", "admin", "member", "guest"]);

export const WorkspaceSummaryResponse = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  role: WorkspaceRoleResponse,
}).annotate({ identifier: "WorkspaceSummaryResponse" });
export interface WorkspaceSummaryResponse extends Schema.Schema.Type<
  typeof WorkspaceSummaryResponse
> {}

export const WorkspaceListResponse = Schema.Struct({
  workspaces: Schema.Array(WorkspaceSummaryResponse),
}).annotate({ identifier: "WorkspaceListResponse" });
export interface WorkspaceListResponse extends Schema.Schema.Type<typeof WorkspaceListResponse> {}

export const WorkspaceIdentityResponse = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  avatarUrl: Schema.String,
}).annotate({ identifier: "WorkspaceIdentityResponse" });
export interface WorkspaceIdentityResponse extends Schema.Schema.Type<
  typeof WorkspaceIdentityResponse
> {}

export const WorkspaceAccessResponse = Schema.Struct({
  workspace: Schema.Struct({
    id: Schema.String,
    name: Schema.String,
  }),
  identity: WorkspaceIdentityResponse,
  role: WorkspaceRoleResponse,
}).annotate({ identifier: "WorkspaceAccessResponse" });
export interface WorkspaceAccessResponse extends Schema.Schema.Type<
  typeof WorkspaceAccessResponse
> {}
