import { Schema } from "effect";

export const TopicIntentValue = Schema.Literals([
  "question",
  "proposal",
  "decision",
  "update",
  "discussion",
]).annotate({ identifier: "TopicIntent" });
export type TopicIntentValue = Schema.Schema.Type<typeof TopicIntentValue>;
