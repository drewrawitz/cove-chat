import { Schema } from "effect";
import { HttpApi, OpenApi } from "effect/unstable/httpapi";
import {
  ChannelApiGroup,
  ChannelMaintainerUnavailableResponse,
  ChannelUnavailableResponse,
} from "./channels/index.ts";
import {
  AuthApiGroup,
  CsrfValidationFailedResponse,
  InternalServerErrorResponse,
  InvalidMagicLinkResponse,
  UnauthorizedResponse,
} from "./auth/index.ts";
import {
  AlreadyWorkspaceMemberResponse,
  ExistingWorkspaceIdentityProfileNotAcceptedResponse,
  FullMemberUnavailableResponse,
  InitialWorkspaceIdentityProfileRequiredResponse,
  LastWorkspaceOwnerResponse,
  WorkspaceAdministrationForbiddenResponse,
  WorkspaceApiGroup,
  WorkspaceInvitationResendTooSoonResponse,
  WorkspaceInvitationUnavailableResponse,
  WorkspaceUnavailableResponse,
} from "./workspaces/index.ts";

export const CoveAppErrorResponse = Schema.Union([
  CsrfValidationFailedResponse,
  InternalServerErrorResponse,
  InvalidMagicLinkResponse,
  UnauthorizedResponse,
  AlreadyWorkspaceMemberResponse,
  ExistingWorkspaceIdentityProfileNotAcceptedResponse,
  FullMemberUnavailableResponse,
  InitialWorkspaceIdentityProfileRequiredResponse,
  LastWorkspaceOwnerResponse,
  WorkspaceAdministrationForbiddenResponse,
  WorkspaceInvitationResendTooSoonResponse,
  WorkspaceInvitationUnavailableResponse,
  WorkspaceUnavailableResponse,
  ChannelUnavailableResponse,
  ChannelMaintainerUnavailableResponse,
]).annotate({ identifier: "CoveAppErrorResponse" });

export const CoveAppApi = HttpApi.make("CoveAppApi")
  .add(AuthApiGroup)
  .add(WorkspaceApiGroup)
  .add(ChannelApiGroup)
  .annotate(HttpApi.AdditionalSchemas, [CoveAppErrorResponse])
  .annotate(OpenApi.Title, "Cove App API")
  .annotate(OpenApi.Description, "The first-party HTTP interface used by Cove applications.")
  .annotate(OpenApi.Version, "1.0.0");
