import type {
  TopicArchivePageView,
  TopicMessageView,
  TopicSummaryView,
  TopicView,
} from "@cove/application";
import {
  TopicArchivePageResponse,
  TopicMessageResponse,
  TopicResponse,
  TopicSummaryResponse,
} from "@cove/protocol";

export const topicResponseMessage = (view: TopicMessageView): TopicMessageResponse =>
  TopicMessageResponse.make({
    id: view.message.id,
    ...(view.message.body === undefined ? {} : { body: view.message.body }),
    position: view.message.position,
    createdAt: view.message.createdAt,
    edited: view.message.editedAt !== undefined,
    deleted: view.message.deletedAt !== undefined,
    author: {
      id: view.author.id,
      name: view.author.name,
      avatarUrl: view.author.avatarUrl,
    },
  });

const topicResponseFields = (view: TopicView | TopicSummaryView) => ({
  id: view.topic.id,
  workspaceId: view.topic.workspaceId,
  channelId: view.topic.channelId,
  title: view.topic.title,
  ...(view.topic.intent === undefined ? {} : { intent: view.topic.intent }),
  createdAt: view.topic.createdAt,
});

export const topicResponse = (view: TopicView): TopicResponse =>
  TopicResponse.make({
    ...topicResponseFields(view),
    messages: view.messages.map(topicResponseMessage),
  });

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
