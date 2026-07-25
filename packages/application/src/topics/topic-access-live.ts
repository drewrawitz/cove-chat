import { Message, Topic, makeTopicSummaryPreview } from "@cove/domain";
import {
  type PersistenceError,
  StoredMessage,
  type TopicAuthorRecord,
  type TopicMessageRecord,
  TopicRepository,
  type TopicSummaryRecord,
  TransactionManager,
} from "@cove/ports";
import { Clock, Effect, Layer } from "effect";
import {
  ChannelAccess,
  ChannelAccessFailure,
  type ChannelConversationContext,
} from "../channels/channel-access.ts";
import { ChannelUnavailable } from "../channels/get-channel-for-actor.ts";
import { TopicArchiveCursorInvalid } from "./topic-archive-cursor.ts";
import {
  type AddMessageCommand,
  type CreateTopicCommand,
  MessageMutationForbidden,
  MessageUnavailable,
  type DeleteMessageCommand,
  type EditMessageCommand,
  TopicAccess,
  TopicAccessFailure,
  TopicArchivePageView,
  TopicMessageView,
  TopicSummaryView,
  TopicUnavailable,
  TopicView,
} from "./topic-access.ts";

function messageView(record: TopicMessageRecord): TopicMessageView {
  return TopicMessageView.make(record);
}

function messageViewFromDomain(message: Message, author: TopicAuthorRecord): TopicMessageView {
  return TopicMessageView.make({
    message: StoredMessage.make(message),
    author,
  });
}

function topicSummaryView(record: TopicSummaryRecord): TopicSummaryView {
  return TopicSummaryView.make({
    topic: record.topic,
    latestMessage: messageView(record.latestMessage),
    messageCount: record.messageCount,
  });
}

const make = Effect.gen(function* () {
  const channels = yield* ChannelAccess;
  const repository = yield* TopicRepository;
  const transactions = yield* TransactionManager;

  const accessFailure = (operation: string) => new TopicAccessFailure({ operation });
  const recoverFailure = <A, E, R>(
    operation: string,
    effect: Effect.Effect<A, E | ChannelAccessFailure | PersistenceError, R>,
  ): Effect.Effect<A, E | TopicAccessFailure, R> =>
    effect.pipe(
      Effect.catchTag("Application.ChannelAccessFailure", () =>
        Effect.fail(accessFailure(operation)),
      ),
      Effect.catchTag("Ports.PersistenceError", () => Effect.fail(accessFailure(operation))),
    );

  const conversationContext = Effect.fn("TopicAccess.conversationContext")(function* (
    actorAccountId: CreateTopicCommand["actorAccountId"],
    workspaceId: CreateTopicCommand["workspaceId"],
    channelId: CreateTopicCommand["channelId"],
  ): Effect.fn.Return<ChannelConversationContext, ChannelUnavailable | ChannelAccessFailure> {
    return yield* channels.getConversationContextForActor(actorAccountId, workspaceId, channelId);
  });

  const messageMutationTarget = Effect.fn("TopicAccess.messageMutationTarget")(function* (
    command: EditMessageCommand | DeleteMessageCommand,
  ) {
    const context = yield* conversationContext(
      command.actorAccountId,
      command.workspaceId,
      command.channelId,
    );
    if (!context.hasChannelMembership) {
      return yield* Effect.fail(new ChannelUnavailable({ channelId: command.channelId }));
    }

    const topic = yield* repository.findTopicById(
      command.workspaceId,
      command.channelId,
      command.topicId,
    );
    if (topic === undefined) {
      return yield* Effect.fail(new TopicUnavailable({ topicId: command.topicId }));
    }
    const current = yield* repository.findMessageById(
      command.workspaceId,
      command.topicId,
      command.messageId,
    );
    if (current === undefined || current.message.deletedAt !== undefined) {
      return yield* Effect.fail(new MessageUnavailable({ messageId: command.messageId }));
    }
    if (current.message.authorIdentityId !== context.actor.id) {
      return yield* Effect.fail(new MessageMutationForbidden({ messageId: command.messageId }));
    }
    return current;
  });

  return TopicAccess.of({
    listArchiveForActor: Effect.fn("TopicAccess.listArchiveForActor")(
      function* (actorAccountId, workspaceId, channelId, cursor) {
        yield* conversationContext(actorAccountId, workspaceId, channelId);
        const page = yield* repository.listArchivePageInChannel(
          actorAccountId,
          workspaceId,
          channelId,
          cursor,
        );
        if (!page.cursorValid) {
          return yield* Effect.fail(new TopicArchiveCursorInvalid());
        }
        const topics = page.summaries.map(topicSummaryView);
        return TopicArchivePageView.make({
          topics,
          ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
        });
      },
      (effect) => recoverFailure("TopicAccess.listArchiveForActor", effect),
    ),
    create: Effect.fn("TopicAccess.create")(
      (command) =>
        transactions.run(
          Effect.gen(function* () {
            const context = yield* conversationContext(
              command.actorAccountId,
              command.workspaceId,
              command.channelId,
            );
            if (!context.hasChannelMembership) {
              return yield* Effect.fail(new ChannelUnavailable({ channelId: command.channelId }));
            }

            const now = new Date(yield* Clock.currentTimeMillis);
            const topic = Topic.make({
              id: command.topicId,
              workspaceId: command.workspaceId,
              channelId: command.channelId,
              title: command.title,
              ...(command.intent === undefined ? {} : { intent: command.intent }),
              openedByIdentityId: context.actor.id,
              messageCount: 1,
              latestMessageId: command.openingBriefMessageId,
              latestMessagePreview: makeTopicSummaryPreview(command.openingBrief),
              latestMessageAuthorIdentityId: context.actor.id,
              latestMessagePosition: 1,
              latestMessageCreatedAt: now,
              lastActivityAt: now,
              createdAt: now,
            });
            const openingBrief = Message.make({
              id: command.openingBriefMessageId,
              workspaceId: command.workspaceId,
              topicId: command.topicId,
              authorIdentityId: context.actor.id,
              body: command.openingBrief,
              position: 1,
              createdAt: now,
            });

            yield* repository.insertTopic(topic);
            yield* repository.insertMessage(openingBrief);

            return TopicView.make({
              topic,
              messages: [messageViewFromDomain(openingBrief, context.actor)],
            });
          }),
        ),
      (effect) => recoverFailure("TopicAccess.create", effect),
    ),
    addMessage: Effect.fn("TopicAccess.addMessage")(
      (command: AddMessageCommand) =>
        transactions.run(
          Effect.gen(function* () {
            const context = yield* conversationContext(
              command.actorAccountId,
              command.workspaceId,
              command.channelId,
            );
            if (!context.hasChannelMembership) {
              return yield* Effect.fail(new ChannelUnavailable({ channelId: command.channelId }));
            }

            const topic = yield* repository.findTopicById(
              command.workspaceId,
              command.channelId,
              command.topicId,
            );
            if (topic === undefined) {
              return yield* Effect.fail(new TopicUnavailable({ topicId: command.topicId }));
            }

            const message = yield* repository.appendMessage({
              id: command.messageId,
              workspaceId: command.workspaceId,
              topicId: command.topicId,
              authorIdentityId: context.actor.id,
              body: command.body,
              createdAt: new Date(yield* Clock.currentTimeMillis),
            });
            return messageViewFromDomain(message, context.actor);
          }),
        ),
      (effect) => recoverFailure("TopicAccess.addMessage", effect),
    ),
    editMessage: Effect.fn("TopicAccess.editMessage")(
      (command: EditMessageCommand) =>
        transactions.run(
          Effect.gen(function* () {
            const current = yield* messageMutationTarget(command);

            const message = yield* repository.editMessage({
              workspaceId: command.workspaceId,
              topicId: command.topicId,
              messageId: command.messageId,
              body: command.body,
              editedAt: new Date(yield* Clock.currentTimeMillis),
            });
            return messageViewFromDomain(message, current.author);
          }),
        ),
      (effect) => recoverFailure("TopicAccess.editMessage", effect),
    ),
    deleteMessage: Effect.fn("TopicAccess.deleteMessage")(
      (command: DeleteMessageCommand) =>
        transactions.run(
          Effect.gen(function* () {
            const current = yield* messageMutationTarget(command);

            const message = yield* repository.tombstoneMessage({
              workspaceId: command.workspaceId,
              topicId: command.topicId,
              messageId: command.messageId,
              deletedAt: new Date(yield* Clock.currentTimeMillis),
            });
            return messageViewFromDomain(message, current.author);
          }),
        ),
      (effect) => recoverFailure("TopicAccess.deleteMessage", effect),
    ),
  });
});

export const TopicAccessLive = Layer.effect(TopicAccess, make);
