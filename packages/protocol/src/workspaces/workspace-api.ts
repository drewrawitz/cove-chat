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
  WorkspaceUnavailableResponse,
} from "./workspace-error-response.ts";
import {
  WorkspaceAccessResponse,
  WorkspaceCreatedResponse,
  WorkspaceIdentityUpdateResponse,
  WorkspaceJoinedResponse,
  WorkspaceListResponse,
} from "./workspace-response.ts";
import {
  CreateWorkspaceRequest,
  JoinWorkspaceRequest,
  UpdateWorkspaceIdentityRequest,
} from "./workspace-request.ts";

const WorkspaceParams = {
  workspaceId: Schema.NonEmptyString,
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

const JoinWorkspaceEndpoint = HttpApiEndpoint.post(
  "joinWorkspace",
  "/api/app/v1/workspaces/:workspaceId/membership",
  {
    params: WorkspaceParams,
    payload: JoinWorkspaceRequest,
    headers: CsrfHeaders,
    success: WorkspaceJoinedResponse,
    error: [
      CsrfValidationFailedResponse,
      AlreadyWorkspaceMemberResponse,
      ExistingWorkspaceIdentityProfileNotAcceptedResponse,
      InitialWorkspaceIdentityProfileRequiredResponse,
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
  JoinWorkspaceEndpoint,
);
