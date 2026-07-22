import { Effect, Schema } from "effect";

export const ChannelPurpose = Schema.Trimmed.check(Schema.isNonEmpty()).pipe(
  Schema.brand("ChannelPurpose"),
);
export type ChannelPurpose = typeof ChannelPurpose.Type;

export class InvalidChannelPurpose extends Schema.TaggedErrorClass<InvalidChannelPurpose>()(
  "Domain.InvalidChannelPurpose",
  { reason: Schema.Literal("empty") },
) {}

export function makeChannelPurpose(value: string) {
  return ChannelPurpose.makeEffect(value).pipe(
    Effect.mapError(() => new InvalidChannelPurpose({ reason: "empty" })),
  );
}
