import { Effect, Schema } from "effect";

export const ContributionBody = Schema.Trim.check(Schema.isNonEmpty()).pipe(
  Schema.brand("ContributionBody"),
);
export type ContributionBody = typeof ContributionBody.Type;

export class InvalidContributionBody extends Schema.TaggedErrorClass<InvalidContributionBody>()(
  "Domain.InvalidContributionBody",
  { reason: Schema.Literal("empty") },
) {}

export function makeContributionBody(value: string) {
  return Schema.decodeUnknownEffect(ContributionBody)(value).pipe(
    Effect.mapError(() => new InvalidContributionBody({ reason: "empty" })),
  );
}
