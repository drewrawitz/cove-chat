import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";
import {
  CsrfValidationFailedResponse,
  InternalServerErrorResponse,
} from "../auth/auth-error-response.ts";
import { CsrfHeaders } from "../auth/logout-headers.ts";
import { SessionAuth } from "../auth/session-auth.ts";
import { WorkspaceUnavailableResponse } from "../workspaces/workspace-error-response.ts";
import {
  ChannelStewardUnavailableResponse,
  ChannelUnavailableResponse,
} from "./channel-error-response.ts";
import { CreatePublicChannelRequest } from "./channel-request.ts";
import {
  ChannelStewardListResponse,
  PublicChannelListResponse,
  PublicChannelResponse,
} from "./channel-response.ts";

const WorkspaceParams = { workspaceId: Schema.NonEmptyString };
const ChannelParams = { ...WorkspaceParams, channelId: Schema.NonEmptyString };

const ListPublicChannelsEndpoint = HttpApiEndpoint.get(
  "listPublicChannels",
  "/api/app/v1/workspaces/:workspaceId/channels",
  {
    params: WorkspaceParams,
    success: PublicChannelListResponse,
    error: [WorkspaceUnavailableResponse, InternalServerErrorResponse],
  },
).middleware(SessionAuth);

const ListChannelStewardsEndpoint = HttpApiEndpoint.get(
  "listChannelStewards",
  "/api/app/v1/workspaces/:workspaceId/channel-stewards",
  {
    params: WorkspaceParams,
    success: ChannelStewardListResponse,
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
      ChannelStewardUnavailableResponse,
      WorkspaceUnavailableResponse,
      InternalServerErrorResponse,
    ],
  },
).middleware(SessionAuth);

const GetPublicChannelEndpoint = HttpApiEndpoint.get(
  "getPublicChannel",
  "/api/app/v1/workspaces/:workspaceId/channels/:channelId",
  {
    params: ChannelParams,
    success: PublicChannelResponse,
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

export const ChannelApiGroup = HttpApiGroup.make("channels").add(
  ListPublicChannelsEndpoint,
  ListChannelStewardsEndpoint,
  CreatePublicChannelEndpoint,
  GetPublicChannelEndpoint,
  JoinPublicChannelEndpoint,
);
