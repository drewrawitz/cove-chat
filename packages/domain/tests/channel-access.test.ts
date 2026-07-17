import { expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { ChannelAccessFacts, canViewChannel } from "../src/index.ts";

it.effect("a workspace member can view a public channel", () =>
  Effect.gen(function* () {
    const facts = yield* ChannelAccessFacts.makeEffect({
      visibility: "public",
      isWorkspaceMember: true,
      isChannelMember: false,
    });

    expect(canViewChannel(facts)).toBe(true);
  }),
);

it.effect("a non-member cannot view a public channel", () =>
  Effect.gen(function* () {
    const facts = yield* ChannelAccessFacts.makeEffect({
      visibility: "public",
      isWorkspaceMember: false,
      isChannelMember: false,
    });

    expect(canViewChannel(facts)).toBe(false);
  }),
);

it.effect("a workspace member cannot view a private channel without channel membership", () =>
  Effect.gen(function* () {
    const facts = yield* ChannelAccessFacts.makeEffect({
      visibility: "private",
      isWorkspaceMember: true,
      isChannelMember: false,
    });

    expect(canViewChannel(facts)).toBe(false);
  }),
);

it.effect("a private-channel member can view the private channel", () =>
  Effect.gen(function* () {
    const facts = yield* ChannelAccessFacts.makeEffect({
      visibility: "private",
      isWorkspaceMember: true,
      isChannelMember: true,
    });

    expect(canViewChannel(facts)).toBe(true);
  }),
);

it.effect("channel membership cannot bypass workspace membership", () =>
  Effect.gen(function* () {
    const facts = yield* ChannelAccessFacts.makeEffect({
      visibility: "private",
      isWorkspaceMember: false,
      isChannelMember: true,
    });

    expect(canViewChannel(facts)).toBe(false);
  }),
);

it.effect("rejects unsupported channel visibility", () =>
  Effect.gen(function* () {
    const error = yield* Schema.decodeUnknownEffect(ChannelAccessFacts)({
      visibility: "secret",
      isWorkspaceMember: true,
      isChannelMember: true,
    }).pipe(Effect.flip);

    expect(Schema.isSchemaError(error)).toBe(true);
  }),
);
