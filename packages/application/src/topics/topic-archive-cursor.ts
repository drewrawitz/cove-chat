import { Schema } from "effect";

export class TopicArchiveCursorInvalid extends Schema.TaggedErrorClass<TopicArchiveCursorInvalid>()(
  "Application.TopicArchiveCursorInvalid",
  {},
) {}
