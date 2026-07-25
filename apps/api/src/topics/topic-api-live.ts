import {
  CreateTopicCommand,
  CreateReplyCommand,
  DeleteMessageCommand,
  EditMessageCommand,
  MessageCommands,
  TopicAccess,
} from "@cove/application";
import {
  MessageBody,
  MessageVersion,
  makeChannelId,
  makeMessageCommandId,
  makeMessageId,
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
import { Effect, Option } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { randomUUID } from "node:crypto";
import { validateMutationCsrf } from "../support/validate-mutation-csrf.ts";
import {
  createdTopicResponse,
  messageCommandAcceptedResponse,
  messageCommandStatusResponse,
  topicArchivePageResponse,
} from "./topic-response.ts";

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

const topicArchiveErrorResponse = (error: unknown) =>
  errorTag(error) === "Application.TopicArchiveCursorInvalid"
    ? TopicErrorResponses.archiveCursorInvalid
    : channelErrorResponse(error);

const createTopicErrorResponse = (error: unknown) => {
  if (error === AuthErrorResponses.csrfValidationFailed) {
    return AuthErrorResponses.csrfValidationFailed;
  }
  return channelErrorResponse(error);
};

const messageMutationErrorResponse = (error: unknown) => {
  if (error === AuthErrorResponses.csrfValidationFailed) {
    return AuthErrorResponses.csrfValidationFailed;
  }
  if (errorTag(error) === "Application.MessageMutationForbidden") {
    return TopicErrorResponses.messageMutationForbidden;
  }
  if (errorTag(error) === "Application.MessageCommandConflict") {
    return TopicErrorResponses.messageCommandConflict;
  }
  if (errorTag(error) === "Application.StaleMessageVersion") {
    return TopicErrorResponses.staleMessageVersion;
  }
  if (
    errorTag(error) === "Application.MessageUnavailable" ||
    invalidIdentifier(error) === "message"
  ) {
    return TopicErrorResponses.messageUnavailable;
  }
  return topicErrorResponse(error);
};

const addMessageErrorResponse = (error: unknown) => {
  if (error === AuthErrorResponses.csrfValidationFailed) {
    return AuthErrorResponses.csrfValidationFailed;
  }
  if (errorTag(error) === "Application.MessageCommandConflict") {
    return TopicErrorResponses.messageCommandConflict;
  }
  return topicErrorResponse(error);
};

const messageCommandStatusErrorResponse = (error: unknown) =>
  error === TopicErrorResponses.messageCommandUnavailable
    ? TopicErrorResponses.messageCommandUnavailable
    : AuthErrorResponses.internalServerError;

const resolveActorAndWorkspace = Effect.fn("TopicApi.resolveActorAndWorkspace")(function* (params: {
  readonly workspaceId: string;
}) {
  const actor = yield* AuthenticatedActor;
  const actorId = yield* makeUserId(actor.userId);
  const workspaceId = yield* makeWorkspaceId(params.workspaceId);
  return { actorId, workspaceId };
});

const resolveActorAndChannel = Effect.fn("TopicApi.resolveActorAndChannel")(function* (params: {
  readonly workspaceId: string;
  readonly channelId: string;
}) {
  const { actorId, workspaceId } = yield* resolveActorAndWorkspace(params);
  const channelId = yield* makeChannelId(params.channelId);
  return { actorId, workspaceId, channelId };
});

export const TopicApiLive = HttpApiBuilder.group(CoveAppApi, "topics", (handlers) =>
  handlers
    .handle("listArchivedTopics", ({ params, query }) =>
      Effect.gen(function* () {
        const { actorId, workspaceId, channelId } = yield* resolveActorAndChannel(params);
        const topics = yield* TopicAccess;
        return topicArchivePageResponse(
          yield* topics.listArchiveForActor(actorId, workspaceId, channelId, query.cursor),
        );
      }).pipe(Effect.mapError(topicArchiveErrorResponse)),
    )
    .handle("createTopic", ({ headers, params, payload }) =>
      Effect.gen(function* () {
        yield* validateMutationCsrf(headers["x-csrf-token"]);
        const { actorId, workspaceId, channelId } = yield* resolveActorAndChannel(params);
        const topicId = yield* makeTopicId(randomUUID());
        const openingBriefMessageId = yield* makeMessageId(randomUUID());
        const title = yield* makeTopicTitle(payload.title);
        const topics = yield* TopicAccess;
        return createdTopicResponse(
          yield* topics.create(
            CreateTopicCommand.make({
              actorAccountId: actorId,
              workspaceId,
              channelId,
              topicId,
              openingBriefMessageId,
              title,
              openingBrief: MessageBody.make(payload.openingBrief),
              ...(payload.intent === undefined ? {} : { intent: payload.intent }),
            }),
          ),
        );
      }).pipe(Effect.mapError(createTopicErrorResponse)),
    )
    .handle("addMessage", ({ headers, params, payload }) =>
      Effect.gen(function* () {
        yield* validateMutationCsrf(headers["x-csrf-token"]);
        const { actorId, workspaceId, channelId } = yield* resolveActorAndChannel(params);
        const topicId = yield* makeTopicId(params.topicId);
        const commandId = yield* makeMessageCommandId(payload.commandId);
        const commands = yield* MessageCommands;
        return messageCommandAcceptedResponse(
          yield* commands.execute(
            CreateReplyCommand.make({
              actorAccountId: actorId,
              workspaceId,
              channelId,
              topicId,
              commandId,
              body: MessageBody.make(payload.body),
            }),
          ),
        );
      }).pipe(Effect.mapError(addMessageErrorResponse)),
    )
    .handle("editMessage", ({ headers, params, payload }) =>
      Effect.gen(function* () {
        yield* validateMutationCsrf(headers["x-csrf-token"]);
        const { actorId, workspaceId, channelId } = yield* resolveActorAndChannel(params);
        const topicId = yield* makeTopicId(params.topicId);
        const messageId = yield* makeMessageId(params.messageId);
        const commandId = yield* makeMessageCommandId(payload.commandId);
        const commands = yield* MessageCommands;
        return messageCommandAcceptedResponse(
          yield* commands.execute(
            EditMessageCommand.make({
              actorAccountId: actorId,
              workspaceId,
              channelId,
              topicId,
              commandId,
              messageId,
              expectedVersion: MessageVersion.make(payload.expectedVersion),
              body: MessageBody.make(payload.body),
            }),
          ),
        );
      }).pipe(Effect.mapError(messageMutationErrorResponse)),
    )
    .handle("deleteMessage", ({ headers, params, query }) =>
      Effect.gen(function* () {
        yield* validateMutationCsrf(headers["x-csrf-token"]);
        const { actorId, workspaceId, channelId } = yield* resolveActorAndChannel(params);
        const topicId = yield* makeTopicId(params.topicId);
        const messageId = yield* makeMessageId(params.messageId);
        const commandId = yield* makeMessageCommandId(query.commandId);
        const commands = yield* MessageCommands;
        return messageCommandAcceptedResponse(
          yield* commands.execute(
            DeleteMessageCommand.make({
              actorAccountId: actorId,
              workspaceId,
              channelId,
              topicId,
              commandId,
              messageId,
              expectedVersion: MessageVersion.make(query.expectedVersion),
            }),
          ),
        );
      }).pipe(Effect.mapError(messageMutationErrorResponse)),
    )
    .handle("getMessageCommandStatus", ({ params }) =>
      Effect.gen(function* () {
        const { actorId, workspaceId } = yield* resolveActorAndWorkspace(params);
        const commandId = yield* makeMessageCommandId(params.commandId);
        const commands = yield* MessageCommands;
        const status = yield* commands.status(actorId, workspaceId, commandId);
        if (Option.isNone(status)) {
          return yield* Effect.fail(TopicErrorResponses.messageCommandUnavailable);
        }
        return messageCommandStatusResponse(status.value);
      }).pipe(Effect.mapError(messageCommandStatusErrorResponse)),
    ),
);
