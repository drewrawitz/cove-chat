import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";
import {
  CsrfValidationFailedResponse,
  InternalServerErrorResponse,
} from "../auth/auth-error-response.ts";
import { CsrfHeaders } from "../auth/logout-headers.ts";
import { SessionAuth } from "../auth/session-auth.ts";
import { WorkspaceUnavailableResponse } from "../workspaces/workspace-error-response.ts";
import { FullMemberUnavailableResponse } from "../workspaces/workspace-error-response.ts";
import {
  ChannelAdministrationForbiddenResponse,
  PrivateChannelMaintainerCannotLeaveResponse,
  ChannelMemberUnavailableResponse,
  ChannelUnavailableResponse,
} from "./channel-error-response.ts";
import { CreatePrivateChannelRequest, CreatePublicChannelRequest } from "./channel-request.ts";
import {
  ChannelMembershipRosterResponse,
  ChannelMemberCandidateListResponse,
  ChannelResponse,
  PrivateChannelAdministrationListResponse,
  PrivateChannelListResponse,
  PublicChannelListResponse,
  PublicChannelResponse,
} from "./channel-response.ts";

const WorkspaceParams = { workspaceId: Schema.NonEmptyString };
const ChannelParams = { ...WorkspaceParams, channelId: Schema.NonEmptyString };
const ChannelMemberParams = {
  ...ChannelParams,
  workspaceIdentityId: Schema.NonEmptyString,
};

const ListPublicChannelsEndpoint = HttpApiEndpoint.get(
  "listPublicChannels",
  "/api/app/v1/workspaces/:workspaceId/channels",
  {
    params: WorkspaceParams,
    success: PublicChannelListResponse,
    error: [WorkspaceUnavailableResponse, InternalServerErrorResponse],
  },
).middleware(SessionAuth);

const CreatePublicChannelEndpoint = HttpApiEndpoint.post(
  "createPublicChannel",
  "/api/app/v1/workspaces/:workspaceId/channels",
  {
    params: WorkspaceParams,
    headers: CsrfHeaders,
    payload: CreatePublicChannelRequest,
    success: PublicChannelResponse,
    error: [
      CsrfValidationFailedResponse,
      WorkspaceUnavailableResponse,
      InternalServerErrorResponse,
    ],
  },
).middleware(SessionAuth);

const CreatePrivateChannelEndpoint = HttpApiEndpoint.post(
  "createPrivateChannel",
  "/api/app/v1/workspaces/:workspaceId/channels/private",
  {
    params: WorkspaceParams,
    headers: CsrfHeaders,
    payload: CreatePrivateChannelRequest,
    success: ChannelResponse,
    error: [
      CsrfValidationFailedResponse,
      WorkspaceUnavailableResponse,
      InternalServerErrorResponse,
    ],
  },
).middleware(SessionAuth);

const ListPrivateChannelsEndpoint = HttpApiEndpoint.get(
  "listPrivateChannels",
  "/api/app/v1/workspaces/:workspaceId/channels/private",
  {
    params: WorkspaceParams,
    success: PrivateChannelListResponse,
    error: [WorkspaceUnavailableResponse, InternalServerErrorResponse],
  },
).middleware(SessionAuth);

const ListChannelMemberCandidatesEndpoint = HttpApiEndpoint.get(
  "listChannelMemberCandidates",
  "/api/app/v1/workspaces/:workspaceId/channels/:channelId/member-candidates",
  {
    params: ChannelParams,
    success: ChannelMemberCandidateListResponse,
    error: [ChannelUnavailableResponse, InternalServerErrorResponse],
  },
).middleware(SessionAuth);

const ListPrivateChannelsForAdministrationEndpoint = HttpApiEndpoint.get(
  "listPrivateChannelsForAdministration",
  "/api/app/v1/workspaces/:workspaceId/channels/private/administration",
  {
    params: WorkspaceParams,
    success: PrivateChannelAdministrationListResponse,
    error: [
      ChannelAdministrationForbiddenResponse,
      WorkspaceUnavailableResponse,
      InternalServerErrorResponse,
    ],
  },
).middleware(SessionAuth);

const GetChannelEndpoint = HttpApiEndpoint.get(
  "getChannel",
  "/api/app/v1/workspaces/:workspaceId/channels/:channelId",
  {
    params: ChannelParams,
    success: ChannelResponse,
    error: [ChannelUnavailableResponse, InternalServerErrorResponse],
  },
).middleware(SessionAuth);

const AddChannelMemberEndpoint = HttpApiEndpoint.put(
  "addChannelMember",
  "/api/app/v1/workspaces/:workspaceId/channels/:channelId/members/:workspaceIdentityId",
  {
    params: ChannelMemberParams,
    headers: CsrfHeaders,
    success: ChannelMembershipRosterResponse,
    error: [
      CsrfValidationFailedResponse,
      ChannelUnavailableResponse,
      ChannelMemberUnavailableResponse,
      FullMemberUnavailableResponse,
      WorkspaceUnavailableResponse,
      InternalServerErrorResponse,
    ],
  },
).middleware(SessionAuth);

const GetChannelMembershipRosterEndpoint = HttpApiEndpoint.get(
  "getChannelMembershipRoster",
  "/api/app/v1/workspaces/:workspaceId/channels/:channelId/members",
  {
    params: ChannelParams,
    success: ChannelMembershipRosterResponse,
    error: [ChannelUnavailableResponse, InternalServerErrorResponse],
  },
).middleware(SessionAuth);

const JoinPublicChannelEndpoint = HttpApiEndpoint.post(
  "joinPublicChannel",
  "/api/app/v1/workspaces/:workspaceId/channels/:channelId/membership",
  {
    params: ChannelParams,
    headers: CsrfHeaders,
    success: PublicChannelResponse,
    error: [CsrfValidationFailedResponse, ChannelUnavailableResponse, InternalServerErrorResponse],
  },
).middleware(SessionAuth);

const LeaveChannelEndpoint = HttpApiEndpoint.delete(
  "leaveChannel",
  "/api/app/v1/workspaces/:workspaceId/channels/:channelId/membership",
  {
    params: ChannelParams,
    headers: CsrfHeaders,
    error: [
      CsrfValidationFailedResponse,
      PrivateChannelMaintainerCannotLeaveResponse,
      ChannelUnavailableResponse,
      InternalServerErrorResponse,
    ],
  },
).middleware(SessionAuth);

export const ChannelApiGroup = HttpApiGroup.make("channels").add(
  ListPublicChannelsEndpoint,
  CreatePublicChannelEndpoint,
  CreatePrivateChannelEndpoint,
  ListPrivateChannelsEndpoint,
  ListChannelMemberCandidatesEndpoint,
  ListPrivateChannelsForAdministrationEndpoint,
  GetChannelEndpoint,
  GetChannelMembershipRosterEndpoint,
  JoinPublicChannelEndpoint,
  LeaveChannelEndpoint,
  AddChannelMemberEndpoint,
);
