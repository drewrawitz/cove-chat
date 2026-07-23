import { Effect, Schema } from "effect";

export const MessageBody = Schema.Trim.check(Schema.isNonEmpty()).pipe(Schema.brand("MessageBody"));
export type MessageBody = typeof MessageBody.Type;

export class InvalidMessageBody extends Schema.TaggedErrorClass<InvalidMessageBody>()(
  "Domain.InvalidMessageBody",
  { reason: Schema.Literal("empty") },
) {}

export function makeMessageBody(value: string) {
  return Schema.decodeUnknownEffect(MessageBody)(value).pipe(
    Effect.mapError(() => new InvalidMessageBody({ reason: "empty" })),
  );
}
