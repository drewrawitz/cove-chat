import {
  AddContributionCommand,
  CreateTopicCommand,
  DeleteContributionCommand,
  EditContributionCommand,
  TopicAccess,
} from "@cove/application";
import {
  ContributionBody,
  makeChannelId,
  makeContributionId,
  makeTopicId,
  makeTopicTitle,
  makeUserId,
  makeWorkspaceId,
} from "@cove/domain";
import {
  AuthErrorResponses,
  AuthenticatedActor,
  ChannelErrorResponses,
  CoveAppApi,
  TopicErrorResponses,
} from "@cove/protocol";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { randomUUID } from "node:crypto";
import { validateMutationCsrf } from "../support/validate-mutation-csrf.ts";
import { topicListResponse, topicResponse, topicResponseContribution } from "./topic-response.ts";

const errorTag = (error: unknown): unknown =>
  typeof error === "object" && error !== null && "_tag" in error ? error._tag : undefined;

const invalidIdentifier = (error: unknown): unknown =>
  errorTag(error) === "Domain.InvalidIdentifier" &&
  typeof error === "object" &&
  error !== null &&
  "identifier" in error
    ? error.identifier
    : undefined;

const channelErrorResponse = (error: unknown) =>
  errorTag(error) === "Application.ChannelUnavailable" ||
  (errorTag(error) === "Domain.InvalidIdentifier" && invalidIdentifier(error) !== "topic")
    ? ChannelErrorResponses.unavailable
    : AuthErrorResponses.internalServerError;

const topicErrorResponse = (error: unknown) =>
  errorTag(error) === "Application.TopicUnavailable" || invalidIdentifier(error) === "topic"
    ? TopicErrorResponses.unavailable
    : channelErrorResponse(error);

const createTopicErrorResponse = (error: unknown) => {
  if (error === AuthErrorResponses.csrfValidationFailed) {
    return AuthErrorResponses.csrfValidationFailed;
  }
  return channelErrorResponse(error);
};

const contributionMutationErrorResponse = (error: unknown) => {
  if (error === AuthErrorResponses.csrfValidationFailed) {
    return AuthErrorResponses.csrfValidationFailed;
  }
  if (errorTag(error) === "Application.ContributionMutationForbidden") {
    return TopicErrorResponses.contributionMutationForbidden;
  }
  if (
    errorTag(error) === "Application.ContributionUnavailable" ||
    invalidIdentifier(error) === "contribution"
  ) {
    return TopicErrorResponses.contributionUnavailable;
  }
  return topicErrorResponse(error);
};

const addContributionErrorResponse = (error: unknown) =>
  error === AuthErrorResponses.csrfValidationFailed
    ? AuthErrorResponses.csrfValidationFailed
    : topicErrorResponse(error);

const resolveActorAndChannel = Effect.fn("TopicApi.resolveActorAndChannel")(function* (params: {
  readonly workspaceId: string;
  readonly channelId: string;
}) {
  const actor = yield* AuthenticatedActor;
  const actorId = yield* makeUserId(actor.userId);
  const workspaceId = yield* makeWorkspaceId(params.workspaceId);
  const channelId = yield* makeChannelId(params.channelId);
  return { actorId, workspaceId, channelId };
});

export const TopicApiLive = HttpApiBuilder.group(CoveAppApi, "topics", (handlers) =>
  handlers
    .handle("listTopics", ({ params }) =>
      Effect.gen(function* () {
        const { actorId, workspaceId, channelId } = yield* resolveActorAndChannel(params);
        const topics = yield* TopicAccess;
        return topicListResponse(yield* topics.listForActor(actorId, workspaceId, channelId));
      }).pipe(Effect.mapError(channelErrorResponse)),
    )
    .handle("createTopic", ({ headers, params, payload }) =>
      Effect.gen(function* () {
        yield* validateMutationCsrf(headers["x-csrf-token"]);
        const { actorId, workspaceId, channelId } = yield* resolveActorAndChannel(params);
        const topicId = yield* makeTopicId(randomUUID());
        const openingBriefContributionId = yield* makeContributionId(randomUUID());
        const title = yield* makeTopicTitle(payload.title);
        const topics = yield* TopicAccess;
        return topicResponse(
          yield* topics.create(
            CreateTopicCommand.make({
              actorAccountId: actorId,
              workspaceId,
              channelId,
              topicId,
              openingBriefContributionId,
              title,
              openingBrief: ContributionBody.make(payload.openingBrief),
              ...(payload.intent === undefined ? {} : { intent: payload.intent }),
            }),
          ),
        );
      }).pipe(Effect.mapError(createTopicErrorResponse)),
    )
    .handle("getTopic", ({ params }) =>
      Effect.gen(function* () {
        const { actorId, workspaceId, channelId } = yield* resolveActorAndChannel(params);
        const topicId = yield* makeTopicId(params.topicId);
        const topics = yield* TopicAccess;
        return topicResponse(yield* topics.getForActor(actorId, workspaceId, channelId, topicId));
      }).pipe(Effect.mapError(topicErrorResponse)),
    )
    .handle("addContribution", ({ headers, params, payload }) =>
      Effect.gen(function* () {
        yield* validateMutationCsrf(headers["x-csrf-token"]);
        const { actorId, workspaceId, channelId } = yield* resolveActorAndChannel(params);
        const topicId = yield* makeTopicId(params.topicId);
        const contributionId = yield* makeContributionId(randomUUID());
        const topics = yield* TopicAccess;
        return topicResponseContribution(
          yield* topics.addContribution(
            AddContributionCommand.make({
              actorAccountId: actorId,
              workspaceId,
              channelId,
              topicId,
              contributionId,
              body: ContributionBody.make(payload.body),
            }),
          ),
        );
      }).pipe(Effect.mapError(addContributionErrorResponse)),
    )
    .handle("editContribution", ({ headers, params, payload }) =>
      Effect.gen(function* () {
        yield* validateMutationCsrf(headers["x-csrf-token"]);
        const { actorId, workspaceId, channelId } = yield* resolveActorAndChannel(params);
        const topicId = yield* makeTopicId(params.topicId);
        const contributionId = yield* makeContributionId(params.contributionId);
        const topics = yield* TopicAccess;
        return topicResponseContribution(
          yield* topics.editContribution(
            EditContributionCommand.make({
              actorAccountId: actorId,
              workspaceId,
              channelId,
              topicId,
              contributionId,
              body: ContributionBody.make(payload.body),
            }),
          ),
        );
      }).pipe(Effect.mapError(contributionMutationErrorResponse)),
    )
    .handle("deleteContribution", ({ headers, params }) =>
      Effect.gen(function* () {
        yield* validateMutationCsrf(headers["x-csrf-token"]);
        const { actorId, workspaceId, channelId } = yield* resolveActorAndChannel(params);
        const topicId = yield* makeTopicId(params.topicId);
        const contributionId = yield* makeContributionId(params.contributionId);
        const topics = yield* TopicAccess;
        return topicResponseContribution(
          yield* topics.deleteContribution(
            DeleteContributionCommand.make({
              actorAccountId: actorId,
              workspaceId,
              channelId,
              topicId,
              contributionId,
            }),
          ),
        );
      }).pipe(Effect.mapError(contributionMutationErrorResponse)),
    ),
);
