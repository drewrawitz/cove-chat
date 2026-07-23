import { expect, it } from "@effect/vitest";
import {
  InvalidMessageBody,
  InvalidTopicTitle,
  TopicIntent,
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
