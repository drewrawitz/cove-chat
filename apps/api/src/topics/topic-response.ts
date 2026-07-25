import type {
  MessageCommandStatus,
  MessageCommandSucceeded,
  TopicArchivePageView,
  TopicMessageView,
  TopicSummaryView,
  TopicView,
} from "@cove/application";
import {
  CreatedTopicResponse,
  MessageCommandAcceptedResponse,
  MessageCommandRejectedStatusResponse,
  MessageCommandStatusResponse,
  TopicArchivePageResponse,
  TopicMessageResponse,
  TopicSummaryResponse,
} from "@cove/protocol";

export const topicResponseMessage = (view: TopicMessageView): TopicMessageResponse =>
  TopicMessageResponse.make({
    id: view.message.id,
    ...(view.message.body === undefined ? {} : { body: view.message.body }),
    position: view.message.position,
    version: view.message.version,
    ...(view.message.producedByCommandId === undefined
      ? {}
      : { producedByCommandId: view.message.producedByCommandId }),
    createdAt: view.message.createdAt,
    edited: view.message.editedAt !== undefined,
    deleted: view.message.deletedAt !== undefined,
    author: {
      id: view.author.id,
      name: view.author.name,
      avatarUrl: view.author.avatarUrl,
    },
  });

export const messageCommandAcceptedResponse = (
  outcome: MessageCommandSucceeded,
): MessageCommandAcceptedResponse =>
  MessageCommandAcceptedResponse.make({
    status: "succeeded",
    commandId: outcome.commandId,
    kind: outcome.kind,
    messageId: outcome.messageId,
    messageVersion: outcome.messageVersion,
  });

export const messageCommandStatusResponse = (
  outcome: MessageCommandStatus,
): MessageCommandStatusResponse =>
  outcome._tag === "succeeded"
    ? messageCommandAcceptedResponse(outcome)
    : MessageCommandRejectedStatusResponse.make({
        status: "rejected",
        commandId: outcome.commandId,
        kind: outcome.kind,
        rejection: outcome.rejection,
        ...(outcome.messageId === undefined ? {} : { messageId: outcome.messageId }),
      });

const topicResponseFields = (view: TopicView | TopicSummaryView) => ({
  id: view.topic.id,
  workspaceId: view.topic.workspaceId,
  channelId: view.topic.channelId,
  title: view.topic.title,
  ...(view.topic.intent === undefined ? {} : { intent: view.topic.intent }),
  createdAt: view.topic.createdAt,
});

export const createdTopicResponse = (view: TopicView): CreatedTopicResponse => {
  const openingBrief = view.messages[0];
  if (openingBrief === undefined) {
    throw new Error("A newly created Topic must include its Opening Brief.");
  }
  return CreatedTopicResponse.make({
    ...topicResponseFields(view),
    openingBrief: topicResponseMessage(openingBrief),
  });
};

const topicSummaryResponse = (view: TopicSummaryView): TopicSummaryResponse =>
  TopicSummaryResponse.make({
    ...topicResponseFields(view),
    latestMessage: {
      id: view.latestMessage.message.id,
      ...(view.topic.latestMessagePreview === undefined
        ? {}
        : { preview: view.topic.latestMessagePreview }),
      position: view.latestMessage.message.position,
      createdAt: view.latestMessage.message.createdAt,
      edited: view.latestMessage.message.editedAt !== undefined,
      deleted: view.latestMessage.message.deletedAt !== undefined,
      author: {
        id: view.latestMessage.author.id,
        name: view.latestMessage.author.name,
        avatarUrl: view.latestMessage.author.avatarUrl,
      },
    },
    messageCount: view.messageCount,
    lastActivityAt: view.topic.lastActivityAt,
  });

export const topicArchivePageResponse = (page: TopicArchivePageView): TopicArchivePageResponse =>
  TopicArchivePageResponse.make({
    topics: page.topics.map(topicSummaryResponse),
    ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
  });
