import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";
import {
  CsrfValidationFailedResponse,
  InternalServerErrorResponse,
} from "../auth/auth-error-response.ts";
import { CsrfHeaders } from "../auth/logout-headers.ts";
import { SessionAuth } from "../auth/session-auth.ts";
import { ChannelUnavailableResponse } from "../channels/channel-error-response.ts";
import { TopicUnavailableResponse } from "./topic-error-response.ts";
import { CreateTopicRequest } from "./topic-request.ts";
import { TopicListResponse, TopicResponse } from "./topic-response.ts";

const ChannelParams = {
  workspaceId: Schema.NonEmptyString,
  channelId: Schema.NonEmptyString,
};
const TopicParams = { ...ChannelParams, topicId: Schema.NonEmptyString };

const ListTopicsEndpoint = HttpApiEndpoint.get(
  "listTopics",
  "/api/app/v1/workspaces/:workspaceId/channels/:channelId/topics",
  {
    params: ChannelParams,
    success: TopicListResponse,
    error: [ChannelUnavailableResponse, InternalServerErrorResponse],
  },
).middleware(SessionAuth);

const CreateTopicEndpoint = HttpApiEndpoint.post(
  "createTopic",
  "/api/app/v1/workspaces/:workspaceId/channels/:channelId/topics",
  {
    params: ChannelParams,
    headers: CsrfHeaders,
    payload: CreateTopicRequest,
    success: TopicResponse,
    error: [CsrfValidationFailedResponse, ChannelUnavailableResponse, InternalServerErrorResponse],
  },
).middleware(SessionAuth);

const GetTopicEndpoint = HttpApiEndpoint.get(
  "getTopic",
  "/api/app/v1/workspaces/:workspaceId/channels/:channelId/topics/:topicId",
  {
    params: TopicParams,
    success: TopicResponse,
    error: [TopicUnavailableResponse, ChannelUnavailableResponse, InternalServerErrorResponse],
  },
).middleware(SessionAuth);

export const TopicApiGroup = HttpApiGroup.make("topics").add(
  ListTopicsEndpoint,
  CreateTopicEndpoint,
  GetTopicEndpoint,
);
