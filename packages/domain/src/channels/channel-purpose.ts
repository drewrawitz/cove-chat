import { Effect, Schema } from "effect";
import {
  CHANNEL_PURPOSE_MAX_BYTES,
  isWithinUtf8ByteLimit,
  utf8ByteLength,
} from "../content-bounds.ts";

export const ChannelPurpose = Schema.Trim.check(
  Schema.isNonEmpty(),
  Schema.makeFilter(isWithinUtf8ByteLimit(CHANNEL_PURPOSE_MAX_BYTES)),
).pipe(Schema.brand("ChannelPurpose"));
export type ChannelPurpose = typeof ChannelPurpose.Type;

export class InvalidChannelPurpose extends Schema.TaggedErrorClass<InvalidChannelPurpose>()(
  "Domain.InvalidChannelPurpose",
  { reason: Schema.Literals(["empty", "too_long"]) },
) {}

export function makeChannelPurpose(value: string) {
  return Schema.decodeUnknownEffect(ChannelPurpose)(value).pipe(
    Effect.mapError(
      () =>
        new InvalidChannelPurpose({
          reason: utf8ByteLength(value.trim()) > CHANNEL_PURPOSE_MAX_BYTES ? "too_long" : "empty",
        }),
    ),
  );
}
