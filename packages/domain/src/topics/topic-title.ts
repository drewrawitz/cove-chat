import { Effect, Schema } from "effect";
import { TOPIC_TITLE_MAX_BYTES, isWithinUtf8ByteLimit, utf8ByteLength } from "../content-bounds.ts";

export const TopicTitle = Schema.Trim.check(
  Schema.isNonEmpty(),
  Schema.makeFilter(isWithinUtf8ByteLimit(TOPIC_TITLE_MAX_BYTES)),
).pipe(Schema.brand("TopicTitle"));
export type TopicTitle = typeof TopicTitle.Type;

export class InvalidTopicTitle extends Schema.TaggedErrorClass<InvalidTopicTitle>()(
  "Domain.InvalidTopicTitle",
  { reason: Schema.Literals(["empty", "too_long"]) },
) {}

export function makeTopicTitle(value: string) {
  return Schema.decodeUnknownEffect(TopicTitle)(value).pipe(
    Effect.mapError(
      () =>
        new InvalidTopicTitle({
          reason: utf8ByteLength(value.trim()) > TOPIC_TITLE_MAX_BYTES ? "too_long" : "empty",
        }),
    ),
  );
}
