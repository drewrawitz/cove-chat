import { Schema } from "effect";

const WorkspaceRequestValue = Schema.Trimmed.check(Schema.isNonEmpty());

const WorkspaceIdentityProfileRequest = Schema.Struct({
  name: WorkspaceRequestValue,
  avatarUrl: WorkspaceRequestValue,
});

export const UpdateWorkspaceIdentityRequest = Schema.Struct({
  commandId: WorkspaceRequestValue,
  ...WorkspaceIdentityProfileRequest.fields,
}).annotate({ identifier: "UpdateWorkspaceIdentityRequest" });
export interface UpdateWorkspaceIdentityRequest extends Schema.Schema.Type<
  typeof UpdateWorkspaceIdentityRequest
> {}

export const CreateWorkspaceRequest = Schema.Struct({
  commandId: WorkspaceRequestValue,
  name: WorkspaceRequestValue,
  identity: WorkspaceIdentityProfileRequest,
}).annotate({ identifier: "CreateWorkspaceRequest" });
export interface CreateWorkspaceRequest extends Schema.Schema.Type<typeof CreateWorkspaceRequest> {}

export const JoinWorkspaceRequest = Schema.Struct({
  commandId: WorkspaceRequestValue,
  initialIdentityProfile: Schema.optionalKey(WorkspaceIdentityProfileRequest),
}).annotate({ identifier: "JoinWorkspaceRequest" });
export interface JoinWorkspaceRequest extends Schema.Schema.Type<typeof JoinWorkspaceRequest> {}

export const EndWorkspaceMembershipRequest = Schema.Struct({
  commandId: WorkspaceRequestValue,
}).annotate({ identifier: "EndWorkspaceMembershipRequest" });
export interface EndWorkspaceMembershipRequest extends Schema.Schema.Type<
  typeof EndWorkspaceMembershipRequest
> {}
