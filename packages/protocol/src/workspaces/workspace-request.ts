import { Schema } from "effect";

const WorkspaceRequestValue = Schema.Trimmed.check(Schema.isNonEmpty());

const WorkspaceIdentityProfileRequest = Schema.Struct({
  name: WorkspaceRequestValue,
  avatarUrl: WorkspaceRequestValue,
});

export const UpdateWorkspaceIdentityRequest = Schema.Struct({
  ...WorkspaceIdentityProfileRequest.fields,
}).annotate({ identifier: "UpdateWorkspaceIdentityRequest" });
export interface UpdateWorkspaceIdentityRequest extends Schema.Schema.Type<
  typeof UpdateWorkspaceIdentityRequest
> {}

export const CreateWorkspaceRequest = Schema.Struct({
  name: WorkspaceRequestValue,
  identity: WorkspaceIdentityProfileRequest,
}).annotate({ identifier: "CreateWorkspaceRequest" });
export interface CreateWorkspaceRequest extends Schema.Schema.Type<typeof CreateWorkspaceRequest> {}

export const JoinWorkspaceRequest = Schema.Struct({
  initialIdentityProfile: Schema.optionalKey(WorkspaceIdentityProfileRequest),
}).annotate({ identifier: "JoinWorkspaceRequest" });
export interface JoinWorkspaceRequest extends Schema.Schema.Type<typeof JoinWorkspaceRequest> {}
