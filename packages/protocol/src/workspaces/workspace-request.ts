import { Effect, Schema } from "effect";

const WorkspaceRequestValue = Schema.Trimmed.check(Schema.isNonEmpty());

const WorkspaceIdentityProfileRequest = Schema.Struct({
  name: WorkspaceRequestValue,
  avatarUrl: WorkspaceRequestValue.pipe(
    Schema.withDecodingDefaultKey(Effect.succeed("/avatars/default.svg")),
  ),
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

export const InviteWorkspaceMemberRequest = Schema.Struct({
  email: Schema.Trimmed.check(Schema.isNonEmpty(), Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)),
}).annotate({ identifier: "InviteWorkspaceMemberRequest" });
export interface InviteWorkspaceMemberRequest extends Schema.Schema.Type<
  typeof InviteWorkspaceMemberRequest
> {}

export const AcceptWorkspaceInvitationRequest = Schema.Struct({
  initialIdentityProfile: Schema.optionalKey(WorkspaceIdentityProfileRequest),
}).annotate({ identifier: "AcceptWorkspaceInvitationRequest" });
export interface AcceptWorkspaceInvitationRequest extends Schema.Schema.Type<
  typeof AcceptWorkspaceInvitationRequest
> {}

export const ChangeWorkspaceRoleRequest = Schema.Struct({
  role: Schema.Literals(["owner", "admin", "member"]),
}).annotate({ identifier: "ChangeWorkspaceRoleRequest" });
export interface ChangeWorkspaceRoleRequest extends Schema.Schema.Type<
  typeof ChangeWorkspaceRoleRequest
> {}
