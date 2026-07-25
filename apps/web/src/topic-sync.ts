import type { TopicIntent } from "./topic-intent.ts";

interface SynchronizedTopicAuthor {
  readonly id: string;
  readonly name: string;
  readonly avatarUrl: string;
}

export interface SynchronizedTopicMessage {
  readonly id: string;
  readonly body?: string | null;
  readonly position: number;
  readonly version: number;
  readonly producedByCommandId?: string | null;
  readonly createdAt: number;
  readonly editedAt?: number | null;
  readonly deletedAt?: number | null;
  readonly author?: SynchronizedTopicAuthor;
}

export interface SynchronizedTopic {
  readonly id: string;
  readonly title: string;
  readonly intent?: TopicIntent | null;
  readonly messageCount: number;
  readonly latestMessageId: string;
  readonly latestMessagePreview?: string | null;
  readonly latestMessagePosition: number;
  readonly latestMessageCreatedAt: number;
  readonly latestMessageEditedAt?: number | null;
  readonly latestMessageDeletedAt?: number | null;
  readonly lastActivityAt: number;
  readonly latestMessageAuthor?: SynchronizedTopicAuthor;
}

export interface TopicMessageView {
  readonly id: string;
  readonly body?: string;
  readonly position: number;
  readonly version: number;
  readonly producedByCommandId?: string;
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
  readonly lastActivityAt: string;
  readonly latestMessage: {
    readonly preview?: string;
    readonly position: number;
    readonly createdAt: string;
    readonly deleted: boolean;
    readonly author: SynchronizedTopicAuthor;
  };
}

export type TopicProjectionState = "syncing" | "available" | "unavailable";

export interface TopicArchivePagination {
  readonly cursor?: string;
  readonly started: boolean;
  readonly pending: boolean;
  readonly error: boolean;
}

export const initialTopicArchivePagination: TopicArchivePagination = {
  started: false,
  pending: false,
  error: false,
};

export const startTopicArchiveRequest = (
  state: TopicArchivePagination,
): TopicArchivePagination => ({
  ...state,
  pending: true,
  error: false,
});

export const completeTopicArchiveRequest = (
  nextCursor: string | undefined,
): TopicArchivePagination => ({
  ...(nextCursor === undefined ? {} : { cursor: nextCursor }),
  started: true,
  pending: false,
  error: false,
});

export const failTopicArchiveRequest = (): TopicArchivePagination => ({
  started: false,
  pending: false,
  error: true,
});

export function topicProjectionState({
  queryResultType,
  topicAvailable,
  justCreated,
}: {
  readonly queryResultType: "unknown" | "complete" | "error";
  readonly topicAvailable: boolean;
  readonly justCreated: boolean;
}): TopicProjectionState {
  if (queryResultType === "error") return "unavailable";
  if (topicAvailable) return "available";
  if (queryResultType === "unknown" || justCreated) return "syncing";
  return "unavailable";
}

const topicMessageView = (message: SynchronizedTopicMessage): TopicMessageView | undefined => {
  if (message.author === undefined) return undefined;

  const deleted = message.deletedAt != null;
  return {
    id: message.id,
    ...(deleted || message.body == null ? {} : { body: message.body }),
    position: message.position,
    version: message.version,
    ...(message.producedByCommandId == null
      ? {}
      : { producedByCommandId: message.producedByCommandId }),
    createdAt: new Date(message.createdAt).toISOString(),
    edited: message.editedAt != null,
    deleted,
    author: message.author,
  };
};

export function synchronizedTopicDetail(
  topic: SynchronizedTopic | undefined,
  openingBrief: SynchronizedTopicMessage | undefined,
  replies: ReadonlyArray<SynchronizedTopicMessage>,
): TopicDetailView | undefined {
  if (topic === undefined || openingBrief === undefined || openingBrief.position !== 1) {
    return undefined;
  }

  const fields = {
    id: topic.id,
    title: topic.title,
    messages: [openingBrief, ...replies].flatMap((message) => {
      const view = topicMessageView(message);
      return view === undefined ? [] : [view];
    }),
  };
  return topic.intent == null ? fields : { ...fields, intent: topic.intent };
}

export function mergeTopicReplies(
  loaded: ReadonlyArray<SynchronizedTopicMessage>,
  incoming: ReadonlyArray<SynchronizedTopicMessage>,
): ReadonlyArray<SynchronizedTopicMessage> {
  const byId = new Map<string, SynchronizedTopicMessage>();
  for (const message of loaded) {
    if (message.position > 1) byId.set(message.id, message);
  }
  for (const message of incoming) {
    if (message.position > 1) byId.set(message.id, message);
  }
  const merged = [...byId.values()].sort(
    (left, right) => left.position - right.position || left.id.localeCompare(right.id),
  );
  const unchanged =
    merged.length === loaded.length &&
    merged.every((message, index) => sameSynchronizedTopicMessage(message, loaded[index]));
  return unchanged ? loaded : merged;
}

function sameSynchronizedTopicMessage(
  message: SynchronizedTopicMessage,
  previous: SynchronizedTopicMessage | undefined,
): boolean {
  return (
    previous !== undefined &&
    message.id === previous.id &&
    message.body === previous.body &&
    message.position === previous.position &&
    message.version === previous.version &&
    message.producedByCommandId === previous.producedByCommandId &&
    message.createdAt === previous.createdAt &&
    message.editedAt === previous.editedAt &&
    message.deletedAt === previous.deletedAt &&
    message.author?.id === previous.author?.id &&
    message.author?.name === previous.author?.name &&
    message.author?.avatarUrl === previous.author?.avatarUrl
  );
}

export function remainingTopicReplyCount(
  messageCount: number,
  loadedReplies: ReadonlyArray<SynchronizedTopicMessage>,
): number {
  return Math.max(0, messageCount - 1 - loadedReplies.length);
}

export function synchronizedTopicSummaries(
  topics: ReadonlyArray<SynchronizedTopic>,
): ReadonlyArray<TopicSummaryView> {
  return topics.flatMap((topic) => {
    if (topic.latestMessageAuthor === undefined) return [];

    const fields = {
      id: topic.id,
      title: topic.title,
      messageCount: topic.messageCount,
      lastActivityAt: new Date(topic.lastActivityAt).toISOString(),
      latestMessage: {
        ...(topic.latestMessagePreview == null ? {} : { preview: topic.latestMessagePreview }),
        position: topic.latestMessagePosition,
        createdAt: new Date(topic.latestMessageCreatedAt).toISOString(),
        deleted: topic.latestMessageDeletedAt != null,
        author: topic.latestMessageAuthor,
      },
    };
    return topic.intent == null ? [fields] : [{ ...fields, intent: topic.intent }];
  });
}

export function combineTopicSummaries(
  liveTopics: ReadonlyArray<TopicSummaryView>,
  archivedTopics: ReadonlyArray<TopicSummaryView>,
): ReadonlyArray<TopicSummaryView> {
  const liveTopicIds = new Set(liveTopics.map(({ id }) => id));
  return [...liveTopics, ...archivedTopics.filter(({ id }) => !liveTopicIds.has(id))];
}
