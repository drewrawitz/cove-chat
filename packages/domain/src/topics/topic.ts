import { Schema } from "effect";
import { ChannelId, MessageId, TopicId, WorkspaceId, WorkspaceIdentityId } from "../identifiers.ts";
import { MessagePosition } from "./message.ts";
import { TopicTitle } from "./topic-title.ts";
import { TopicSummaryPreview } from "./topic-summary-preview.ts";

export const TopicIntent = Schema.Literals([
  "question",
  "proposal",
  "decision",
  "update",
  "discussion",
]);
export type TopicIntent = typeof TopicIntent.Type;

export const Topic = Schema.Struct({
  id: TopicId,
  workspaceId: WorkspaceId,
  channelId: ChannelId,
  title: TopicTitle,
  intent: Schema.optionalKey(TopicIntent),
  openedByIdentityId: WorkspaceIdentityId,
  messageCount: Schema.Int.check(Schema.isGreaterThan(0)),
  latestMessageId: MessageId,
  latestMessagePreview: Schema.optionalKey(TopicSummaryPreview),
  latestMessageAuthorIdentityId: WorkspaceIdentityId,
  latestMessagePosition: MessagePosition,
  latestMessageCreatedAt: Schema.Date,
  latestMessageEditedAt: Schema.optionalKey(Schema.Date),
  latestMessageDeletedAt: Schema.optionalKey(Schema.Date),
  lastActivityAt: Schema.Date,
  createdAt: Schema.Date,
});

export interface Topic extends Schema.Schema.Type<typeof Topic> {}
