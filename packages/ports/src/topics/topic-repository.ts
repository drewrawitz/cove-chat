import {
  Message,
  MessageBody,
  MessageId,
  Topic,
  TopicId,
  WorkspaceAvatarUrl,
  WorkspaceId,
  WorkspaceIdentityId,
  WorkspaceIdentityName,
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

export const TopicMessageRecord = Schema.Struct({
  message: Message,
  author: TopicAuthorRecord,
});
export interface TopicMessageRecord extends Schema.Schema.Type<typeof TopicMessageRecord> {}

export const TopicSummaryRecord = Schema.Struct({
  topic: Topic,
  latestMessage: TopicMessageRecord,
  messageCount: Schema.Int.check(Schema.isGreaterThan(0)),
});
export interface TopicSummaryRecord extends Schema.Schema.Type<typeof TopicSummaryRecord> {}

export const TopicRecord = Schema.Struct({
  topic: Topic,
  messages: Schema.Array(TopicMessageRecord),
});
export interface TopicRecord extends Schema.Schema.Type<typeof TopicRecord> {}

export interface MessageAppend {
  readonly id: MessageId;
  readonly workspaceId: WorkspaceId;
  readonly topicId: TopicId;
  readonly authorIdentityId: WorkspaceIdentityId;
  readonly body: MessageBody;
  readonly createdAt: Date;
}

export interface MessageEdit {
  readonly workspaceId: WorkspaceId;
  readonly topicId: TopicId;
  readonly messageId: MessageId;
  readonly body: MessageBody;
  readonly editedAt: Date;
}

export interface MessageTombstone {
  readonly workspaceId: WorkspaceId;
  readonly topicId: TopicId;
  readonly messageId: MessageId;
  readonly deletedAt: Date;
}

export interface TopicRepositoryService {
  readonly listSummariesInChannel: (
    workspaceId: WorkspaceId,
    channelId: ChannelId,
  ) => Effect.Effect<ReadonlyArray<TopicSummaryRecord>, PersistenceError>;
  readonly findById: (
    workspaceId: WorkspaceId,
    channelId: ChannelId,
    topicId: TopicId,
  ) => Effect.Effect<TopicRecord | undefined, PersistenceError>;
  readonly insertTopic: (topic: Topic) => Effect.Effect<void, PersistenceError>;
  readonly insertMessage: (message: Message) => Effect.Effect<void, PersistenceError>;
  readonly appendMessage: (message: MessageAppend) => Effect.Effect<Message, PersistenceError>;
  readonly editMessage: (edit: MessageEdit) => Effect.Effect<Message, PersistenceError>;
  readonly tombstoneMessage: (
    tombstone: MessageTombstone,
  ) => Effect.Effect<Message, PersistenceError>;
}

export class TopicRepository extends Context.Service<TopicRepository, TopicRepositoryService>()(
  "@cove/ports/TopicRepository",
) {}
