import { Schema } from "effect";
import { HttpApiSchema } from "effect/unstable/httpapi";

const unavailableDefinition = {
  code: "WORKSPACE_UNAVAILABLE",
  message: "Workspace is unavailable.",
} as const;

const lastOwnerDefinition = {
  code: "LAST_WORKSPACE_OWNER",
  message: "The final workspace owner cannot leave, be removed, or be demoted.",
} as const;

const administrationForbiddenDefinition = {
  code: "WORKSPACE_ADMINISTRATION_FORBIDDEN",
  message: "The account cannot administer this Workspace Membership.",
} as const;

const inviteeUnavailableDefinition = {
  code: "WORKSPACE_INVITEE_UNAVAILABLE",
  message: "No Account is available for this invitation.",
} as const;

const invitationPendingDefinition = {
  code: "WORKSPACE_INVITATION_ALREADY_PENDING",
  message: "A pending invitation already exists for this Account.",
} as const;

const invitationUnavailableDefinition = {
  code: "WORKSPACE_INVITATION_UNAVAILABLE",
  message: "The Workspace invitation is unavailable.",
} as const;

const memberUnavailableDefinition = {
  code: "WORKSPACE_MEMBER_UNAVAILABLE",
  message: "The Workspace Member is unavailable.",
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

export const WorkspaceAdministrationForbiddenResponse = Schema.Struct({
  code: Schema.Literals([administrationForbiddenDefinition.code]),
  message: Schema.Literals([administrationForbiddenDefinition.message]),
})
  .annotate({ identifier: "WorkspaceAdministrationForbiddenResponse" })
  .pipe(HttpApiSchema.status("Forbidden"));

export const WorkspaceInviteeUnavailableResponse = Schema.Struct({
  code: Schema.Literals([inviteeUnavailableDefinition.code]),
  message: Schema.Literals([inviteeUnavailableDefinition.message]),
})
  .annotate({ identifier: "WorkspaceInviteeUnavailableResponse" })
  .pipe(HttpApiSchema.status("NotFound"));

export const WorkspaceInvitationAlreadyPendingResponse = Schema.Struct({
  code: Schema.Literals([invitationPendingDefinition.code]),
  message: Schema.Literals([invitationPendingDefinition.message]),
})
  .annotate({ identifier: "WorkspaceInvitationAlreadyPendingResponse" })
  .pipe(HttpApiSchema.status("Conflict"));

export const WorkspaceInvitationUnavailableResponse = Schema.Struct({
  code: Schema.Literals([invitationUnavailableDefinition.code]),
  message: Schema.Literals([invitationUnavailableDefinition.message]),
})
  .annotate({ identifier: "WorkspaceInvitationUnavailableResponse" })
  .pipe(HttpApiSchema.status("NotFound"));

export const WorkspaceMemberUnavailableResponse = Schema.Struct({
  code: Schema.Literals([memberUnavailableDefinition.code]),
  message: Schema.Literals([memberUnavailableDefinition.message]),
})
  .annotate({ identifier: "WorkspaceMemberUnavailableResponse" })
  .pipe(HttpApiSchema.status("NotFound"));

export const WorkspaceErrorResponses = {
  administrationForbidden: WorkspaceAdministrationForbiddenResponse.make(
    administrationForbiddenDefinition,
  ),
  alreadyMember: AlreadyWorkspaceMemberResponse.make(alreadyMemberDefinition),
  existingProfileNotAccepted: ExistingWorkspaceIdentityProfileNotAcceptedResponse.make(
    existingProfileNotAcceptedDefinition,
  ),
  initialProfileRequired: InitialWorkspaceIdentityProfileRequiredResponse.make(
    initialProfileRequiredDefinition,
  ),
  invitationAlreadyPending: WorkspaceInvitationAlreadyPendingResponse.make(
    invitationPendingDefinition,
  ),
  invitationUnavailable: WorkspaceInvitationUnavailableResponse.make(
    invitationUnavailableDefinition,
  ),
  inviteeUnavailable: WorkspaceInviteeUnavailableResponse.make(inviteeUnavailableDefinition),
  lastOwner: LastWorkspaceOwnerResponse.make(lastOwnerDefinition),
  unavailable: WorkspaceUnavailableResponse.make(unavailableDefinition),
  memberUnavailable: WorkspaceMemberUnavailableResponse.make(memberUnavailableDefinition),
} as const;
