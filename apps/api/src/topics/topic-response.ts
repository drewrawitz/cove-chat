import type { TopicMessageView, TopicSummaryView, TopicView } from "@cove/application";
import {
  TopicMessageResponse,
  TopicListResponse,
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
    openingBrief: topicResponseMessage(view.openingBrief),
    messageCount: view.messageCount,
  });

export const topicListResponse = (topics: ReadonlyArray<TopicSummaryView>): TopicListResponse =>
  TopicListResponse.make({ topics: topics.map(topicSummaryResponse) });
