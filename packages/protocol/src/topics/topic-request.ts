import { Schema } from "effect";
import { TopicIntentValue } from "./topic-intent.ts";

const TopicRequestValue = Schema.Trimmed.check(Schema.isNonEmpty());

export const TopicIntentRequest = TopicIntentValue;

export const CreateTopicRequest = Schema.Struct({
  title: TopicRequestValue,
  openingBrief: TopicRequestValue,
  intent: Schema.optionalKey(TopicIntentRequest),
}).annotate({ identifier: "CreateTopicRequest" });
export interface CreateTopicRequest extends Schema.Schema.Type<typeof CreateTopicRequest> {}
