import type { TopicIntent } from "./topic-intent.ts";

interface SynchronizedTopicAuthor {
  readonly id: string;
  readonly name: string;
  readonly avatarUrl: string;
}

interface SynchronizedTopicMessage {
  readonly id: string;
  readonly body?: string | null;
  readonly position: number;
  readonly createdAt: number;
  readonly editedAt?: number | null;
  readonly deletedAt?: number | null;
  readonly author?: SynchronizedTopicAuthor;
}

export interface SynchronizedTopic {
  readonly id: string;
  readonly title: string;
  readonly intent?: TopicIntent | null;
  readonly messages: ReadonlyArray<SynchronizedTopicMessage>;
}

export interface TopicMessageView {
  readonly id: string;
  readonly body?: string;
  readonly position: number;
  readonly createdAt: string;
  readonly edited: boolean;
  readonly deleted: boolean;
  readonly author: SynchronizedTopicAuthor;
}

export interface TopicDetailView {
  readonly id: string;
  readonly title: string;
  readonly intent?: TopicIntent;
  readonly messages: ReadonlyArray<TopicMessageView>;
}

export interface TopicSummaryView {
  readonly id: string;
  readonly title: string;
  readonly intent?: TopicIntent;
  readonly messageCount: number;
  readonly latestMessage: {
    readonly body?: string;
    readonly position: number;
    readonly createdAt: string;
    readonly deleted: boolean;
    readonly author: SynchronizedTopicAuthor;
  };
}

const topicMessageView = (message: SynchronizedTopicMessage): TopicMessageView | undefined => {
  if (message.author === undefined) return undefined;

  const deleted = message.deletedAt != null;
  return {
    id: message.id,
    ...(deleted || message.body == null ? {} : { body: message.body }),
    position: message.position,
    createdAt: new Date(message.createdAt).toISOString(),
    edited: message.editedAt != null,
    deleted,
    author: message.author,
  };
};

export function synchronizedTopicDetail(
  topic: SynchronizedTopic | undefined,
): TopicDetailView | undefined {
  if (topic === undefined) return undefined;

  const fields = {
    id: topic.id,
    title: topic.title,
    messages: topic.messages.flatMap((message) => {
      const view = topicMessageView(message);
      return view === undefined ? [] : [view];
    }),
  };
  return topic.intent == null ? fields : { ...fields, intent: topic.intent };
}

export function synchronizedTopicSummaries(
  topics: ReadonlyArray<SynchronizedTopic>,
): ReadonlyArray<TopicSummaryView> {
  return topics.flatMap((topic) => {
    const latestMessage = topic.messages.at(-1);
    if (latestMessage?.author === undefined) return [];

    const fields = {
      id: topic.id,
      title: topic.title,
      messageCount: topic.messages.length,
      latestMessage: {
        ...(latestMessage.deletedAt != null || latestMessage.body == null
          ? {}
          : { body: latestMessage.body }),
        position: latestMessage.position,
        createdAt: new Date(latestMessage.createdAt).toISOString(),
        deleted: latestMessage.deletedAt != null,
        author: latestMessage.author,
      },
    };
    return topic.intent == null ? [fields] : [{ ...fields, intent: topic.intent }];
  });
}
