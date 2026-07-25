import { Schema } from "effect";
import { protocolUtf8ByteLimit } from "../content-bounds.ts";
import { TopicIntentValue } from "./topic-intent.ts";

const TopicRequestValue = Schema.Trimmed.check(Schema.isNonEmpty());
const TopicTitleRequestValue = TopicRequestValue.check(protocolUtf8ByteLimit(512));
const MessageBodyRequestValue = TopicRequestValue.check(protocolUtf8ByteLimit(8 * 1024));
const MessageCommandIdRequestValue = TopicRequestValue.check(protocolUtf8ByteLimit(256));
const MessageVersionRequestValue = Schema.Int.check(Schema.isGreaterThan(0));

export const TopicIntentRequest = TopicIntentValue;

export const CreateTopicRequest = Schema.Struct({
  title: TopicTitleRequestValue,
  openingBrief: MessageBodyRequestValue,
  intent: Schema.optionalKey(TopicIntentRequest),
}).annotate({ identifier: "CreateTopicRequest" });
export interface CreateTopicRequest extends Schema.Schema.Type<typeof CreateTopicRequest> {}

export const CreateReplyRequest = Schema.Struct({
  commandId: MessageCommandIdRequestValue,
  body: MessageBodyRequestValue,
}).annotate({ identifier: "CreateReplyRequest" });
export interface CreateReplyRequest extends Schema.Schema.Type<typeof CreateReplyRequest> {}

export const EditMessageRequest = Schema.Struct({
  commandId: MessageCommandIdRequestValue,
  expectedVersion: MessageVersionRequestValue,
  body: MessageBodyRequestValue,
}).annotate({ identifier: "EditMessageRequest" });
export interface EditMessageRequest extends Schema.Schema.Type<typeof EditMessageRequest> {}

export const DeleteMessageRequest = Schema.Struct({
  commandId: MessageCommandIdRequestValue,
  expectedVersion: MessageVersionRequestValue,
}).annotate({ identifier: "DeleteMessageRequest" });
export interface DeleteMessageRequest extends Schema.Schema.Type<typeof DeleteMessageRequest> {}
