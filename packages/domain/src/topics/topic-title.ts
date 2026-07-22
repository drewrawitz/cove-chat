import { Effect, Schema } from "effect";

export const TopicTitle = Schema.Trim.check(Schema.isNonEmpty()).pipe(Schema.brand("TopicTitle"));
export type TopicTitle = typeof TopicTitle.Type;

export class InvalidTopicTitle extends Schema.TaggedErrorClass<InvalidTopicTitle>()(
  "Domain.InvalidTopicTitle",
  { reason: Schema.Literal("empty") },
) {}

export function makeTopicTitle(value: string) {
  return Schema.decodeUnknownEffect(TopicTitle)(value).pipe(
    Effect.mapError(() => new InvalidTopicTitle({ reason: "empty" })),
  );
}
