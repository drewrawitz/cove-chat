import { Schema } from "effect";

const WorkspaceRequestValue = Schema.Trimmed.check(Schema.isNonEmpty());

export const UpdateWorkspaceIdentityRequest = Schema.Struct({
  name: WorkspaceRequestValue,
  avatarUrl: WorkspaceRequestValue,
}).annotate({ identifier: "UpdateWorkspaceIdentityRequest" });
export interface UpdateWorkspaceIdentityRequest extends Schema.Schema.Type<
  typeof UpdateWorkspaceIdentityRequest
> {}

export const CreateWorkspaceRequest = Schema.Struct({
  name: WorkspaceRequestValue,
  identity: UpdateWorkspaceIdentityRequest,
}).annotate({ identifier: "CreateWorkspaceRequest" });
export interface CreateWorkspaceRequest extends Schema.Schema.Type<typeof CreateWorkspaceRequest> {}
