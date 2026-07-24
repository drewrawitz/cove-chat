import { Schema } from "effect";
import { protocolUtf8ByteLimit } from "../content-bounds.ts";
import { TopicIntentValue } from "./topic-intent.ts";

const TopicRequestValue = Schema.Trimmed.check(Schema.isNonEmpty());
const TopicTitleRequestValue = TopicRequestValue.check(protocolUtf8ByteLimit(512));
const MessageBodyRequestValue = TopicRequestValue.check(protocolUtf8ByteLimit(8 * 1024));

export const TopicIntentRequest = TopicIntentValue;

export const CreateTopicRequest = Schema.Struct({
  title: TopicTitleRequestValue,
  openingBrief: MessageBodyRequestValue,
  intent: Schema.optionalKey(TopicIntentRequest),
}).annotate({ identifier: "CreateTopicRequest" });
export interface CreateTopicRequest extends Schema.Schema.Type<typeof CreateTopicRequest> {}

export const MessageMutationRequest = Schema.Struct({
  body: MessageBodyRequestValue,
}).annotate({ identifier: "MessageMutationRequest" });
export interface MessageMutationRequest extends Schema.Schema.Type<typeof MessageMutationRequest> {}
