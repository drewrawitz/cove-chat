import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";
import {
  CsrfValidationFailedResponse,
  InternalServerErrorResponse,
} from "../auth/auth-error-response.ts";
import { CsrfHeaders } from "../auth/logout-headers.ts";
import { SessionAuth } from "../auth/session-auth.ts";
import {
  AlreadyWorkspaceMemberResponse,
  ExistingWorkspaceIdentityProfileNotAcceptedResponse,
  InitialWorkspaceIdentityProfileRequiredResponse,
  LastWorkspaceOwnerResponse,
  WorkspaceAdministrationForbiddenResponse,
  WorkspaceInvitationResendTooSoonResponse,
  WorkspaceInvitationUnavailableResponse,
  FullMemberUnavailableResponse,
  WorkspaceUnavailableResponse,
} from "./workspace-error-response.ts";
import {
  WorkspaceAccessResponse,
  WorkspaceCreatedResponse,
  WorkspaceIdentityUpdateResponse,
  WorkspaceInvitationAcceptedResponse,
  WorkspaceInvitationIssuedResponse,
  WorkspaceInvitationListResponse,
  WorkspaceInvitationRedeemedResponse,
  WorkspaceInvitationResentResponse,
  WorkspaceInvitationRevokedResponse,
  WorkspaceListResponse,
  FullMemberListResponse,
  PendingWorkspaceInvitationListResponse,
  WorkspaceRoleChangeResponse,
} from "./workspace-response.ts";
import {
  AcceptWorkspaceInvitationRequest,
  ChangeWorkspaceRoleRequest,
  CreateWorkspaceRequest,
  InviteWorkspaceMemberRequest,
  RedeemWorkspaceInvitationRequest,
  UpdateWorkspaceIdentityRequest,
} from "./workspace-request.ts";

const WorkspaceParams = {
  workspaceId: Schema.NonEmptyString,
};

const FullMemberParams = {
  ...WorkspaceParams,
  workspaceIdentityId: Schema.NonEmptyString,
};

const WorkspaceInvitationParams = {
  invitationId: Schema.NonEmptyString,
};

const WorkspaceInvitationAdministrationParams = {
  ...WorkspaceParams,
  ...WorkspaceInvitationParams,
};

const ListWorkspacesEndpoint = HttpApiEndpoint.get("listWorkspaces", "/api/app/v1/workspaces", {
  success: WorkspaceListResponse,
  error: InternalServerErrorResponse,
}).middleware(SessionAuth);

const CreateWorkspaceEndpoint = HttpApiEndpoint.post("createWorkspace", "/api/app/v1/workspaces", {
  payload: CreateWorkspaceRequest,
  headers: CsrfHeaders,
  success: WorkspaceCreatedResponse,
  error: [CsrfValidationFailedResponse, InternalServerErrorResponse],
}).middleware(SessionAuth);

const GetWorkspaceEndpoint = HttpApiEndpoint.get(
  "getWorkspace",
  "/api/app/v1/workspaces/:workspaceId",
  {
    params: WorkspaceParams,
    success: WorkspaceAccessResponse,
    error: [WorkspaceUnavailableResponse, InternalServerErrorResponse],
  },
).middleware(SessionAuth);

const EndMembershipEndpoint = HttpApiEndpoint.delete(
  "endMembership",
  "/api/app/v1/workspaces/:workspaceId/membership",
  {
    params: WorkspaceParams,
    headers: CsrfHeaders,
    error: [
      CsrfValidationFailedResponse,
      LastWorkspaceOwnerResponse,
      WorkspaceUnavailableResponse,
      InternalServerErrorResponse,
    ],
  },
).middleware(SessionAuth);

const UpdateWorkspaceIdentityEndpoint = HttpApiEndpoint.patch(
  "updateWorkspaceIdentity",
  "/api/app/v1/workspaces/:workspaceId/identity",
  {
    params: WorkspaceParams,
    payload: UpdateWorkspaceIdentityRequest,
    headers: CsrfHeaders,
    success: WorkspaceIdentityUpdateResponse,
    error: [
      CsrfValidationFailedResponse,
      WorkspaceUnavailableResponse,
      InternalServerErrorResponse,
    ],
  },
).middleware(SessionAuth);

const ListWorkspaceInvitationsEndpoint = HttpApiEndpoint.get(
  "listWorkspaceInvitations",
  "/api/app/v1/workspace-invitations",
  {
    success: WorkspaceInvitationListResponse,
    error: InternalServerErrorResponse,
  },
).middleware(SessionAuth);

const InviteWorkspaceMemberEndpoint = HttpApiEndpoint.post(
  "inviteWorkspaceMember",
  "/api/app/v1/workspaces/:workspaceId/invitations",
  {
    params: WorkspaceParams,
    payload: InviteWorkspaceMemberRequest,
    headers: CsrfHeaders,
    success: WorkspaceInvitationIssuedResponse,
    error: [
      CsrfValidationFailedResponse,
      AlreadyWorkspaceMemberResponse,
      WorkspaceAdministrationForbiddenResponse,
      WorkspaceUnavailableResponse,
      InternalServerErrorResponse,
    ],
  },
).middleware(SessionAuth);

const ListPendingWorkspaceInvitationsEndpoint = HttpApiEndpoint.get(
  "listPendingWorkspaceInvitations",
  "/api/app/v1/workspaces/:workspaceId/invitations",
  {
    params: WorkspaceParams,
    success: PendingWorkspaceInvitationListResponse,
    error: [
      WorkspaceAdministrationForbiddenResponse,
      WorkspaceUnavailableResponse,
      InternalServerErrorResponse,
    ],
  },
).middleware(SessionAuth);

const ResendWorkspaceInvitationEndpoint = HttpApiEndpoint.post(
  "resendWorkspaceInvitation",
  "/api/app/v1/workspaces/:workspaceId/invitations/:invitationId/resend",
  {
    params: WorkspaceInvitationAdministrationParams,
    headers: CsrfHeaders,
    success: WorkspaceInvitationResentResponse,
    error: [
      CsrfValidationFailedResponse,
      WorkspaceAdministrationForbiddenResponse,
      WorkspaceInvitationResendTooSoonResponse,
      WorkspaceInvitationUnavailableResponse,
      WorkspaceUnavailableResponse,
      InternalServerErrorResponse,
    ],
  },
).middleware(SessionAuth);

const RevokeWorkspaceInvitationEndpoint = HttpApiEndpoint.delete(
  "revokeWorkspaceInvitation",
  "/api/app/v1/workspaces/:workspaceId/invitations/:invitationId",
  {
    params: WorkspaceInvitationAdministrationParams,
    headers: CsrfHeaders,
    success: WorkspaceInvitationRevokedResponse,
    error: [
      CsrfValidationFailedResponse,
      WorkspaceAdministrationForbiddenResponse,
      WorkspaceInvitationUnavailableResponse,
      WorkspaceUnavailableResponse,
      InternalServerErrorResponse,
    ],
  },
).middleware(SessionAuth);

const AcceptWorkspaceInvitationEndpoint = HttpApiEndpoint.post(
  "acceptWorkspaceInvitation",
  "/api/app/v1/workspace-invitations/:invitationId/accept",
  {
    params: WorkspaceInvitationParams,
    payload: AcceptWorkspaceInvitationRequest,
    headers: CsrfHeaders,
    success: WorkspaceInvitationAcceptedResponse,
    error: [
      CsrfValidationFailedResponse,
      AlreadyWorkspaceMemberResponse,
      ExistingWorkspaceIdentityProfileNotAcceptedResponse,
      InitialWorkspaceIdentityProfileRequiredResponse,
      WorkspaceInvitationUnavailableResponse,
      InternalServerErrorResponse,
    ],
  },
).middleware(SessionAuth);

const RedeemWorkspaceInvitationEndpoint = HttpApiEndpoint.post(
  "redeemWorkspaceInvitation",
  "/api/app/v1/workspace-invitations/redeem",
  {
    payload: RedeemWorkspaceInvitationRequest,
    success: WorkspaceInvitationRedeemedResponse,
    error: [
      AlreadyWorkspaceMemberResponse,
      WorkspaceInvitationUnavailableResponse,
      InternalServerErrorResponse,
    ],
  },
);

const ListFullMembersEndpoint = HttpApiEndpoint.get(
  "listFullMembers",
  "/api/app/v1/workspaces/:workspaceId/members",
  {
    params: WorkspaceParams,
    success: FullMemberListResponse,
    error: [
      WorkspaceAdministrationForbiddenResponse,
      WorkspaceUnavailableResponse,
      InternalServerErrorResponse,
    ],
  },
).middleware(SessionAuth);

const ChangeWorkspaceRoleEndpoint = HttpApiEndpoint.patch(
  "changeWorkspaceRole",
  "/api/app/v1/workspaces/:workspaceId/members/:workspaceIdentityId/role",
  {
    params: FullMemberParams,
    payload: ChangeWorkspaceRoleRequest,
    headers: CsrfHeaders,
    success: WorkspaceRoleChangeResponse,
    error: [
      CsrfValidationFailedResponse,
      LastWorkspaceOwnerResponse,
      WorkspaceAdministrationForbiddenResponse,
      FullMemberUnavailableResponse,
      WorkspaceUnavailableResponse,
      InternalServerErrorResponse,
    ],
  },
).middleware(SessionAuth);

const RemoveFullMemberEndpoint = HttpApiEndpoint.delete(
  "removeFullMember",
  "/api/app/v1/workspaces/:workspaceId/members/:workspaceIdentityId",
  {
    params: FullMemberParams,
    headers: CsrfHeaders,
    error: [
      CsrfValidationFailedResponse,
      LastWorkspaceOwnerResponse,
      WorkspaceAdministrationForbiddenResponse,
      FullMemberUnavailableResponse,
      WorkspaceUnavailableResponse,
      InternalServerErrorResponse,
    ],
  },
).middleware(SessionAuth);

export const WorkspaceApiGroup = HttpApiGroup.make("workspaces").add(
  ListWorkspacesEndpoint,
  CreateWorkspaceEndpoint,
  GetWorkspaceEndpoint,
  UpdateWorkspaceIdentityEndpoint,
  EndMembershipEndpoint,
  ListWorkspaceInvitationsEndpoint,
  ListPendingWorkspaceInvitationsEndpoint,
  InviteWorkspaceMemberEndpoint,
  ResendWorkspaceInvitationEndpoint,
  RevokeWorkspaceInvitationEndpoint,
  AcceptWorkspaceInvitationEndpoint,
  RedeemWorkspaceInvitationEndpoint,
  ListFullMembersEndpoint,
  ChangeWorkspaceRoleEndpoint,
  RemoveFullMemberEndpoint,
);
