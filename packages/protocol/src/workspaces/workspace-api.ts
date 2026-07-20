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
  WorkspaceInvitationAlreadyPendingResponse,
  WorkspaceInvitationUnavailableResponse,
  WorkspaceInviteeUnavailableResponse,
  WorkspaceMemberUnavailableResponse,
  WorkspaceUnavailableResponse,
} from "./workspace-error-response.ts";
import {
  WorkspaceAccessResponse,
  WorkspaceCreatedResponse,
  WorkspaceIdentityUpdateResponse,
  WorkspaceInvitationAcceptedResponse,
  WorkspaceInvitationCreatedResponse,
  WorkspaceInvitationListResponse,
  WorkspaceListResponse,
  WorkspaceMemberListResponse,
  WorkspaceRoleChangeResponse,
} from "./workspace-response.ts";
import {
  AcceptWorkspaceInvitationRequest,
  ChangeWorkspaceRoleRequest,
  CreateWorkspaceRequest,
  InviteWorkspaceMemberRequest,
  UpdateWorkspaceIdentityRequest,
} from "./workspace-request.ts";

const WorkspaceParams = {
  workspaceId: Schema.NonEmptyString,
};

const WorkspaceMemberParams = {
  ...WorkspaceParams,
  workspaceIdentityId: Schema.NonEmptyString,
};

const WorkspaceInvitationParams = {
  invitationId: Schema.NonEmptyString,
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
    success: WorkspaceInvitationCreatedResponse,
    error: [
      CsrfValidationFailedResponse,
      AlreadyWorkspaceMemberResponse,
      WorkspaceAdministrationForbiddenResponse,
      WorkspaceInvitationAlreadyPendingResponse,
      WorkspaceInviteeUnavailableResponse,
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

const ListWorkspaceMembersEndpoint = HttpApiEndpoint.get(
  "listWorkspaceMembers",
  "/api/app/v1/workspaces/:workspaceId/members",
  {
    params: WorkspaceParams,
    success: WorkspaceMemberListResponse,
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
    params: WorkspaceMemberParams,
    payload: ChangeWorkspaceRoleRequest,
    headers: CsrfHeaders,
    success: WorkspaceRoleChangeResponse,
    error: [
      CsrfValidationFailedResponse,
      LastWorkspaceOwnerResponse,
      WorkspaceAdministrationForbiddenResponse,
      WorkspaceMemberUnavailableResponse,
      WorkspaceUnavailableResponse,
      InternalServerErrorResponse,
    ],
  },
).middleware(SessionAuth);

const RemoveWorkspaceMemberEndpoint = HttpApiEndpoint.delete(
  "removeWorkspaceMember",
  "/api/app/v1/workspaces/:workspaceId/members/:workspaceIdentityId",
  {
    params: WorkspaceMemberParams,
    headers: CsrfHeaders,
    error: [
      CsrfValidationFailedResponse,
      LastWorkspaceOwnerResponse,
      WorkspaceAdministrationForbiddenResponse,
      WorkspaceMemberUnavailableResponse,
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
  InviteWorkspaceMemberEndpoint,
  AcceptWorkspaceInvitationEndpoint,
  ListWorkspaceMembersEndpoint,
  ChangeWorkspaceRoleEndpoint,
  RemoveWorkspaceMemberEndpoint,
);
