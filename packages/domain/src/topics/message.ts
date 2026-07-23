import { Schema } from "effect";
import { MessageId, TopicId, WorkspaceId, WorkspaceIdentityId } from "../identifiers.ts";
import { MessageBody } from "./message-body.ts";

export const MessagePosition = Schema.Int.check(Schema.isGreaterThan(0));
export type MessagePosition = typeof MessagePosition.Type;

export const Message = Schema.Struct({
  id: MessageId,
  workspaceId: WorkspaceId,
  topicId: TopicId,
  authorIdentityId: WorkspaceIdentityId,
  body: Schema.optionalKey(MessageBody),
  position: MessagePosition,
  createdAt: Schema.Date,
  editedAt: Schema.optionalKey(Schema.Date),
  deletedAt: Schema.optionalKey(Schema.Date),
});

export interface Message extends Schema.Schema.Type<typeof Message> {}
