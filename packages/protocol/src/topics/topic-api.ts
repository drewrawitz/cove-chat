import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";
import {
  CsrfValidationFailedResponse,
  InternalServerErrorResponse,
} from "../auth/auth-error-response.ts";
import { CsrfHeaders } from "../auth/logout-headers.ts";
import { SessionAuth } from "../auth/session-auth.ts";
import { ChannelUnavailableResponse } from "../channels/channel-error-response.ts";
import {
  MessageMutationForbiddenResponse,
  MessageUnavailableResponse,
  TopicUnavailableResponse,
} from "./topic-error-response.ts";
import { MessageMutationRequest, CreateTopicRequest } from "./topic-request.ts";
import { TopicMessageResponse, TopicListResponse, TopicResponse } from "./topic-response.ts";

const ChannelParams = {
  workspaceId: Schema.NonEmptyString,
  channelId: Schema.NonEmptyString,
};
const TopicParams = { ...ChannelParams, topicId: Schema.NonEmptyString };
const MessageParams = { ...TopicParams, messageId: Schema.NonEmptyString };

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

const addMessageErrors = [
  CsrfValidationFailedResponse,
  TopicUnavailableResponse,
  ChannelUnavailableResponse,
  InternalServerErrorResponse,
];

const messageChangeErrors = [
  CsrfValidationFailedResponse,
  MessageMutationForbiddenResponse,
  MessageUnavailableResponse,
  TopicUnavailableResponse,
  ChannelUnavailableResponse,
  InternalServerErrorResponse,
];

const AddMessageEndpoint = HttpApiEndpoint.post(
  "addMessage",
  "/api/app/v1/workspaces/:workspaceId/channels/:channelId/topics/:topicId/messages",
  {
    params: TopicParams,
    headers: CsrfHeaders,
    payload: MessageMutationRequest,
    success: TopicMessageResponse,
    error: addMessageErrors,
  },
).middleware(SessionAuth);

const EditMessageEndpoint = HttpApiEndpoint.patch(
  "editMessage",
  "/api/app/v1/workspaces/:workspaceId/channels/:channelId/topics/:topicId/messages/:messageId",
  {
    params: MessageParams,
    headers: CsrfHeaders,
    payload: MessageMutationRequest,
    success: TopicMessageResponse,
    error: messageChangeErrors,
  },
).middleware(SessionAuth);

const DeleteMessageEndpoint = HttpApiEndpoint.delete(
  "deleteMessage",
  "/api/app/v1/workspaces/:workspaceId/channels/:channelId/topics/:topicId/messages/:messageId",
  {
    params: MessageParams,
    headers: CsrfHeaders,
    success: TopicMessageResponse,
    error: messageChangeErrors,
  },
).middleware(SessionAuth);

export const TopicApiGroup = HttpApiGroup.make("topics").add(
  ListTopicsEndpoint,
  CreateTopicEndpoint,
  GetTopicEndpoint,
  AddMessageEndpoint,
  EditMessageEndpoint,
  DeleteMessageEndpoint,
);
