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
  MessageCommandConflictResponse,
  MessageCommandUnavailableResponse,
  MessageMutationForbiddenResponse,
  MessageUnavailableResponse,
  StaleMessageVersionResponse,
  TopicArchiveCursorInvalidResponse,
  TopicUnavailableResponse,
} from "./topic-error-response.ts";
import {
  CreateReplyRequest,
  CreateTopicRequest,
  DeleteMessageRequest,
  EditMessageRequest,
} from "./topic-request.ts";
import {
  CreatedTopicResponse,
  MessageCommandAcceptedResponse,
  MessageCommandStatusResponse,
  TopicArchivePageResponse,
} from "./topic-response.ts";

const ChannelParams = {
  workspaceId: Schema.NonEmptyString,
  channelId: Schema.NonEmptyString,
};
const TopicParams = { ...ChannelParams, topicId: Schema.NonEmptyString };
const MessageParams = { ...TopicParams, messageId: Schema.NonEmptyString };
const MessageCommandParams = {
  workspaceId: Schema.NonEmptyString,
  commandId: Schema.NonEmptyString,
};

const ListArchivedTopicsEndpoint = HttpApiEndpoint.get(
  "listArchivedTopics",
  "/api/app/v1/workspaces/:workspaceId/channels/:channelId/topics/archive",
  {
    params: ChannelParams,
    query: { cursor: Schema.optionalKey(Schema.String) },
    success: TopicArchivePageResponse,
    error: [
      TopicArchiveCursorInvalidResponse,
      ChannelUnavailableResponse,
      InternalServerErrorResponse,
    ],
  },
).middleware(SessionAuth);

const CreateTopicEndpoint = HttpApiEndpoint.post(
  "createTopic",
  "/api/app/v1/workspaces/:workspaceId/channels/:channelId/topics",
  {
    params: ChannelParams,
    headers: CsrfHeaders,
    payload: CreateTopicRequest,
    success: CreatedTopicResponse,
    error: [CsrfValidationFailedResponse, ChannelUnavailableResponse, InternalServerErrorResponse],
  },
).middleware(SessionAuth);

const addMessageErrors = [
  CsrfValidationFailedResponse,
  TopicUnavailableResponse,
  ChannelUnavailableResponse,
  InternalServerErrorResponse,
  MessageCommandConflictResponse,
];

const messageChangeErrors = [
  CsrfValidationFailedResponse,
  MessageMutationForbiddenResponse,
  MessageUnavailableResponse,
  TopicUnavailableResponse,
  ChannelUnavailableResponse,
  MessageCommandConflictResponse,
  StaleMessageVersionResponse,
  InternalServerErrorResponse,
];

const AddMessageEndpoint = HttpApiEndpoint.post(
  "addMessage",
  "/api/app/v1/workspaces/:workspaceId/channels/:channelId/topics/:topicId/messages",
  {
    params: TopicParams,
    headers: CsrfHeaders,
    payload: CreateReplyRequest,
    success: MessageCommandAcceptedResponse,
    error: addMessageErrors,
  },
).middleware(SessionAuth);

const EditMessageEndpoint = HttpApiEndpoint.patch(
  "editMessage",
  "/api/app/v1/workspaces/:workspaceId/channels/:channelId/topics/:topicId/messages/:messageId",
  {
    params: MessageParams,
    headers: CsrfHeaders,
    payload: EditMessageRequest,
    success: MessageCommandAcceptedResponse,
    error: messageChangeErrors,
  },
).middleware(SessionAuth);

const DeleteMessageEndpoint = HttpApiEndpoint.delete(
  "deleteMessage",
  "/api/app/v1/workspaces/:workspaceId/channels/:channelId/topics/:topicId/messages/:messageId",
  {
    params: MessageParams,
    headers: CsrfHeaders,
    payload: DeleteMessageRequest,
    success: MessageCommandAcceptedResponse,
    error: messageChangeErrors,
  },
).middleware(SessionAuth);

const GetMessageCommandStatusEndpoint = HttpApiEndpoint.get(
  "getMessageCommandStatus",
  "/api/app/v1/workspaces/:workspaceId/message-commands/:commandId",
  {
    params: MessageCommandParams,
    success: MessageCommandStatusResponse,
    error: [MessageCommandUnavailableResponse, InternalServerErrorResponse],
  },
).middleware(SessionAuth);

export const TopicApiGroup = HttpApiGroup.make("topics").add(
  ListArchivedTopicsEndpoint,
  CreateTopicEndpoint,
  AddMessageEndpoint,
  EditMessageEndpoint,
  DeleteMessageEndpoint,
  GetMessageCommandStatusEndpoint,
);
