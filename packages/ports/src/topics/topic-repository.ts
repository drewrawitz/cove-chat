import {
  Message,
  MessageBody,
  MessageId,
  MessagePosition,
  MessageVersion,
  Topic,
  TopicId,
  UserId,
  WorkspaceAvatarUrl,
  WorkspaceId,
  WorkspaceIdentityId,
  WorkspaceIdentityName,
  MessageCommandId,
  type ChannelId,
} from "@cove/domain";
import { Context, type Effect, Schema } from "effect";
import type { PersistenceError } from "../persistence-error.ts";

export const TopicAuthorRecord = Schema.Struct({
  id: WorkspaceIdentityId,
  name: WorkspaceIdentityName,
  avatarUrl: WorkspaceAvatarUrl,
});
export interface TopicAuthorRecord extends Schema.Schema.Type<typeof TopicAuthorRecord> {}

export const StoredMessage = Schema.Struct({
  id: MessageId,
  workspaceId: WorkspaceId,
  topicId: TopicId,
  authorIdentityId: WorkspaceIdentityId,
  body: Schema.optionalKey(MessageBody),
  position: MessagePosition,
  version: MessageVersion,
  producedByCommandId: Schema.optionalKey(MessageCommandId),
  createdAt: Schema.Date,
  editedAt: Schema.optionalKey(Schema.Date),
  deletedAt: Schema.optionalKey(Schema.Date),
});
export interface StoredMessage extends Schema.Schema.Type<typeof StoredMessage> {}

export const TopicMessageRecord = Schema.Struct({
  message: StoredMessage,
  author: TopicAuthorRecord,
});
export interface TopicMessageRecord extends Schema.Schema.Type<typeof TopicMessageRecord> {}

export const TopicSummaryRecord = Schema.Struct({
  topic: Topic,
  latestMessage: TopicMessageRecord,
  messageCount: Schema.Int.check(Schema.isGreaterThan(0)),
});
export interface TopicSummaryRecord extends Schema.Schema.Type<typeof TopicSummaryRecord> {}

export interface TopicArchivePageRecord {
  readonly summaries: ReadonlyArray<TopicSummaryRecord>;
  readonly cursorValid: boolean;
  readonly nextCursor?: string;
}

export interface TopicRepositoryService {
  readonly listArchivePageInChannel: (
    actorAccountId: UserId,
    workspaceId: WorkspaceId,
    channelId: ChannelId,
    cursor?: string,
  ) => Effect.Effect<TopicArchivePageRecord, PersistenceError>;
  readonly findTopicById: (
    workspaceId: WorkspaceId,
    channelId: ChannelId,
    topicId: TopicId,
  ) => Effect.Effect<Topic | undefined, PersistenceError>;
  readonly findMessageById: (
    workspaceId: WorkspaceId,
    topicId: TopicId,
    messageId: MessageId,
  ) => Effect.Effect<TopicMessageRecord | undefined, PersistenceError>;
  readonly insertTopic: (topic: Topic) => Effect.Effect<void, PersistenceError>;
  readonly insertMessage: (message: Message) => Effect.Effect<void, PersistenceError>;
}

export class TopicRepository extends Context.Service<TopicRepository, TopicRepositoryService>()(
  "@cove/ports/TopicRepository",
) {}
