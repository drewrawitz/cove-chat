import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";
import {
  CsrfValidationFailedResponse,
  InternalServerErrorResponse,
} from "../auth/auth-error-response.ts";
import { LogoutHeaders } from "../auth/logout-headers.ts";
import { SessionAuth } from "../auth/session-auth.ts";
import {
  LastWorkspaceOwnerResponse,
  WorkspaceUnavailableResponse,
} from "./workspace-error-response.ts";
import { WorkspaceAccessResponse, WorkspaceListResponse } from "./workspace-response.ts";

const WorkspaceParams = {
  workspaceId: Schema.NonEmptyString,
};

const ListWorkspacesEndpoint = HttpApiEndpoint.get("listWorkspaces", "/api/app/v1/workspaces", {
  success: WorkspaceListResponse,
  error: InternalServerErrorResponse,
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
    headers: LogoutHeaders,
    error: [
      CsrfValidationFailedResponse,
      LastWorkspaceOwnerResponse,
      WorkspaceUnavailableResponse,
      InternalServerErrorResponse,
    ],
  },
).middleware(SessionAuth);

export const WorkspaceApiGroup = HttpApiGroup.make("workspaces").add(
  ListWorkspacesEndpoint,
  GetWorkspaceEndpoint,
  EndMembershipEndpoint,
);
