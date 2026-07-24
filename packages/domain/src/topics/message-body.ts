import { Effect, Schema } from "effect";
import {
  MESSAGE_BODY_MAX_BYTES,
  isWithinUtf8ByteLimit,
  utf8ByteLength,
} from "../content-bounds.ts";

export const MessageBody = Schema.Trim.check(
  Schema.isNonEmpty(),
  Schema.makeFilter(isWithinUtf8ByteLimit(MESSAGE_BODY_MAX_BYTES)),
).pipe(Schema.brand("MessageBody"));
export type MessageBody = typeof MessageBody.Type;

export class InvalidMessageBody extends Schema.TaggedErrorClass<InvalidMessageBody>()(
  "Domain.InvalidMessageBody",
  { reason: Schema.Literals(["empty", "too_long"]) },
) {}

export function makeMessageBody(value: string) {
  return Schema.decodeUnknownEffect(MessageBody)(value).pipe(
    Effect.mapError(
      () =>
        new InvalidMessageBody({
          reason: utf8ByteLength(value.trim()) > MESSAGE_BODY_MAX_BYTES ? "too_long" : "empty",
        }),
    ),
  );
}
