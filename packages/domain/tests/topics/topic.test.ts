import { expect, it } from "@effect/vitest";
import {
  InvalidChannelPurpose,
  InvalidMessageBody,
  InvalidTopicTitle,
  TopicIntent,
  makeChannelPurpose,
  makeMessageBody,
  makeTopicTitle,
} from "../../src/index.ts";
import { Effect, Schema } from "effect";

it.effect("requires a title and Opening Brief for a Topic", () =>
  Effect.gen(function* () {
    const title = yield* makeTopicTitle("  Release readiness  ");
    const openingBrief = yield* makeMessageBody("  Capture the remaining launch risks.  ");

    expect(title).toBe("Release readiness");
    expect(openingBrief).toBe("Capture the remaining launch risks.");

    const titleError = yield* makeTopicTitle("   ").pipe(Effect.flip);
    const openingBriefError = yield* makeMessageBody("   ").pipe(Effect.flip);

    expect(titleError).toBeInstanceOf(InvalidTopicTitle);
    expect(openingBriefError).toBeInstanceOf(InvalidMessageBody);
  }),
);

it.effect("recognizes the optional Topic Intent vocabulary", () =>
  Effect.gen(function* () {
    const decodeIntent = Schema.decodeUnknownEffect(TopicIntent);

    const intents = yield* Effect.all([
      decodeIntent("question"),
      decodeIntent("proposal"),
      decodeIntent("decision"),
      decodeIntent("update"),
      decodeIntent("discussion"),
    ]);

    expect(intents).toEqual(["question", "proposal", "decision", "update", "discussion"]);
    const unsupportedIntent = yield* decodeIntent("announcement").pipe(Effect.flip);
    expect(unsupportedIntent).toBeDefined();
  }),
);

it.effect("bounds Topic titles and Channel purposes by normalized UTF-8 bytes", () =>
  Effect.gen(function* () {
    expect(yield* makeTopicTitle("é".repeat(256))).toBe("é".repeat(256));
    expect(yield* makeChannelPurpose(` ${"é".repeat(1024)} `)).toBe("é".repeat(1024));
    expect(yield* makeMessageBody(` ${"é".repeat(4096)} `)).toBe("é".repeat(4096));

    const titleError = yield* makeTopicTitle("é".repeat(257)).pipe(Effect.flip);
    const purposeError = yield* makeChannelPurpose("é".repeat(1025)).pipe(Effect.flip);
    const messageError = yield* makeMessageBody("é".repeat(4097)).pipe(Effect.flip);

    expect(titleError).toMatchObject({
      _tag: "Domain.InvalidTopicTitle",
      reason: "too_long",
    } satisfies Partial<InvalidTopicTitle>);
    expect(purposeError).toMatchObject({
      _tag: "Domain.InvalidChannelPurpose",
      reason: "too_long",
    } satisfies Partial<InvalidChannelPurpose>);
    expect(messageError).toMatchObject({
      _tag: "Domain.InvalidMessageBody",
      reason: "too_long",
    } satisfies Partial<InvalidMessageBody>);
  }),
);
