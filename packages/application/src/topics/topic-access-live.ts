import { Message, Topic } from "@cove/domain";
import {
  type PersistenceError,
  type TopicMessageRecord,
  type TopicRecord,
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
import {
  type AddMessageCommand,
  type CreateTopicCommand,
  MessageMutationForbidden,
  MessageUnavailable,
  type DeleteMessageCommand,
  type EditMessageCommand,
  TopicAccess,
  TopicAccessFailure,
  TopicMessageView,
  TopicSummaryView,
  TopicUnavailable,
  TopicView,
} from "./topic-access.ts";

function messageView(record: TopicMessageRecord): TopicMessageView {
  return TopicMessageView.make(record);
}

function topicSummaryView(record: TopicSummaryRecord): TopicSummaryView {
  return TopicSummaryView.make({
    topic: record.topic,
    latestMessage: messageView(record.latestMessage),
    messageCount: record.messageCount,
  });
}

function topicView(record: TopicRecord): TopicView {
  return TopicView.make({
    topic: record.topic,
    messages: record.messages.map(messageView),
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

    const topic = yield* repository.findById(
      command.workspaceId,
      command.channelId,
      command.topicId,
    );
    if (topic === undefined) {
      return yield* Effect.fail(new TopicUnavailable({ topicId: command.topicId }));
    }
    const current = topic.messages.find(({ message }) => message.id === command.messageId);
    if (current === undefined || current.message.deletedAt !== undefined) {
      return yield* Effect.fail(new MessageUnavailable({ messageId: command.messageId }));
    }
    if (current.message.authorIdentityId !== context.actor.id) {
      return yield* Effect.fail(new MessageMutationForbidden({ messageId: command.messageId }));
    }
    return current;
  });

  return TopicAccess.of({
    listForActor: Effect.fn("TopicAccess.listForActor")(
      function* (actorAccountId, workspaceId, channelId) {
        yield* conversationContext(actorAccountId, workspaceId, channelId);
        const summaries = yield* repository.listSummariesInChannel(workspaceId, channelId);
        return summaries.map(topicSummaryView);
      },
      (effect) => recoverFailure("TopicAccess.listForActor", effect),
    ),
    getForActor: Effect.fn("TopicAccess.getForActor")(
      function* (actorAccountId, workspaceId, channelId, topicId) {
        yield* conversationContext(actorAccountId, workspaceId, channelId);
        const record = yield* repository.findById(workspaceId, channelId, topicId);
        if (record === undefined) {
          return yield* Effect.fail(new TopicUnavailable({ topicId }));
        }
        return topicView(record);
      },
      (effect) => recoverFailure("TopicAccess.getForActor", effect),
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
              messages: [
                TopicMessageView.make({
                  message: openingBrief,
                  author: context.actor,
                }),
              ],
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

            const topic = yield* repository.findById(
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
            return TopicMessageView.make({ message, author: context.actor });
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
            return TopicMessageView.make({ message, author: current.author });
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
            return TopicMessageView.make({ message, author: current.author });
          }),
        ),
      (effect) => recoverFailure("TopicAccess.deleteMessage", effect),
    ),
  });
});

export const TopicAccessLive = Layer.effect(TopicAccess, make);
