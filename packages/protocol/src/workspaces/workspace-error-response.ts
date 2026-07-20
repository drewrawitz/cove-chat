import { Schema } from "effect";
import { HttpApiSchema } from "effect/unstable/httpapi";

const unavailableDefinition = {
  code: "WORKSPACE_UNAVAILABLE",
  message: "Workspace is unavailable.",
} as const;

const lastOwnerDefinition = {
  code: "LAST_WORKSPACE_OWNER",
  message: "The final workspace owner cannot leave.",
} as const;

const alreadyMemberDefinition = {
  code: "ALREADY_WORKSPACE_MEMBER",
  message: "The account already has active workspace access.",
} as const;

const initialProfileRequiredDefinition = {
  code: "INITIAL_WORKSPACE_IDENTITY_PROFILE_REQUIRED",
  message: "A workspace identity profile is required for first-time access.",
} as const;

const existingProfileNotAcceptedDefinition = {
  code: "EXISTING_WORKSPACE_IDENTITY_PROFILE_NOT_ACCEPTED",
  message: "An existing workspace identity must be reactivated without a replacement profile.",
} as const;

export const WorkspaceUnavailableResponse = Schema.Struct({
  code: Schema.Literals([unavailableDefinition.code]),
  message: Schema.Literals([unavailableDefinition.message]),
})
  .annotate({ identifier: "WorkspaceUnavailableResponse" })
  .pipe(HttpApiSchema.status("NotFound"));
export interface WorkspaceUnavailableResponse extends Schema.Schema.Type<
  typeof WorkspaceUnavailableResponse
> {}

export const LastWorkspaceOwnerResponse = Schema.Struct({
  code: Schema.Literals([lastOwnerDefinition.code]),
  message: Schema.Literals([lastOwnerDefinition.message]),
})
  .annotate({ identifier: "LastWorkspaceOwnerResponse" })
  .pipe(HttpApiSchema.status("Conflict"));
export interface LastWorkspaceOwnerResponse extends Schema.Schema.Type<
  typeof LastWorkspaceOwnerResponse
> {}

export const AlreadyWorkspaceMemberResponse = Schema.Struct({
  code: Schema.Literals([alreadyMemberDefinition.code]),
  message: Schema.Literals([alreadyMemberDefinition.message]),
})
  .annotate({ identifier: "AlreadyWorkspaceMemberResponse" })
  .pipe(HttpApiSchema.status("Conflict"));

export const InitialWorkspaceIdentityProfileRequiredResponse = Schema.Struct({
  code: Schema.Literals([initialProfileRequiredDefinition.code]),
  message: Schema.Literals([initialProfileRequiredDefinition.message]),
})
  .annotate({ identifier: "InitialWorkspaceIdentityProfileRequiredResponse" })
  .pipe(HttpApiSchema.status("BadRequest"));

export const ExistingWorkspaceIdentityProfileNotAcceptedResponse = Schema.Struct({
  code: Schema.Literals([existingProfileNotAcceptedDefinition.code]),
  message: Schema.Literals([existingProfileNotAcceptedDefinition.message]),
})
  .annotate({ identifier: "ExistingWorkspaceIdentityProfileNotAcceptedResponse" })
  .pipe(HttpApiSchema.status("Conflict"));

export const WorkspaceErrorResponses = {
  alreadyMember: AlreadyWorkspaceMemberResponse.make(alreadyMemberDefinition),
  existingProfileNotAccepted: ExistingWorkspaceIdentityProfileNotAcceptedResponse.make(
    existingProfileNotAcceptedDefinition,
  ),
  initialProfileRequired: InitialWorkspaceIdentityProfileRequiredResponse.make(
    initialProfileRequiredDefinition,
  ),
  lastOwner: LastWorkspaceOwnerResponse.make(lastOwnerDefinition),
  unavailable: WorkspaceUnavailableResponse.make(unavailableDefinition),
} as const;
