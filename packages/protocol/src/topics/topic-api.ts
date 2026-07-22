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
  ContributionMutationForbiddenResponse,
  ContributionUnavailableResponse,
  TopicUnavailableResponse,
} from "./topic-error-response.ts";
import { ContributionMutationRequest, CreateTopicRequest } from "./topic-request.ts";
import { TopicContributionResponse, TopicListResponse, TopicResponse } from "./topic-response.ts";

const ChannelParams = {
  workspaceId: Schema.NonEmptyString,
  channelId: Schema.NonEmptyString,
};
const TopicParams = { ...ChannelParams, topicId: Schema.NonEmptyString };
const ContributionParams = { ...TopicParams, contributionId: Schema.NonEmptyString };

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

const addContributionErrors = [
  CsrfValidationFailedResponse,
  TopicUnavailableResponse,
  ChannelUnavailableResponse,
  InternalServerErrorResponse,
];

const contributionChangeErrors = [
  CsrfValidationFailedResponse,
  ContributionMutationForbiddenResponse,
  ContributionUnavailableResponse,
  TopicUnavailableResponse,
  ChannelUnavailableResponse,
  InternalServerErrorResponse,
];

const AddContributionEndpoint = HttpApiEndpoint.post(
  "addContribution",
  "/api/app/v1/workspaces/:workspaceId/channels/:channelId/topics/:topicId/contributions",
  {
    params: TopicParams,
    headers: CsrfHeaders,
    payload: ContributionMutationRequest,
    success: TopicContributionResponse,
    error: addContributionErrors,
  },
).middleware(SessionAuth);

const EditContributionEndpoint = HttpApiEndpoint.patch(
  "editContribution",
  "/api/app/v1/workspaces/:workspaceId/channels/:channelId/topics/:topicId/contributions/:contributionId",
  {
    params: ContributionParams,
    headers: CsrfHeaders,
    payload: ContributionMutationRequest,
    success: TopicContributionResponse,
    error: contributionChangeErrors,
  },
).middleware(SessionAuth);

const DeleteContributionEndpoint = HttpApiEndpoint.delete(
  "deleteContribution",
  "/api/app/v1/workspaces/:workspaceId/channels/:channelId/topics/:topicId/contributions/:contributionId",
  {
    params: ContributionParams,
    headers: CsrfHeaders,
    success: TopicContributionResponse,
    error: contributionChangeErrors,
  },
).middleware(SessionAuth);

export const TopicApiGroup = HttpApiGroup.make("topics").add(
  ListTopicsEndpoint,
  CreateTopicEndpoint,
  GetTopicEndpoint,
  AddContributionEndpoint,
  EditContributionEndpoint,
  DeleteContributionEndpoint,
);
