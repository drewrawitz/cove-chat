import { expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { ChannelAccessFacts, canViewChannel } from "../src/index.ts";

const accessCases = [
  {
    name: "a workspace member can view a public channel",
    facts: {
      visibility: "public",
      isWorkspaceMember: true,
      isChannelMember: false,
    },
    expected: true,
  },
  {
    name: "a non-member cannot view a public channel",
    facts: {
      visibility: "public",
      isWorkspaceMember: false,
      isChannelMember: false,
    },
    expected: false,
  },
  {
    name: "a workspace member cannot view a private channel without channel membership",
    facts: {
      visibility: "private",
      isWorkspaceMember: true,
      isChannelMember: false,
    },
    expected: false,
  },
  {
    name: "a private-channel member can view the private channel",
    facts: {
      visibility: "private",
      isWorkspaceMember: true,
      isChannelMember: true,
    },
    expected: true,
  },
  {
    name: "channel membership cannot bypass workspace membership",
    facts: {
      visibility: "private",
      isWorkspaceMember: false,
      isChannelMember: true,
    },
    expected: false,
  },
] as const;

it.effect.each(accessCases)("$name", ({ facts, expected }) =>
  Effect.sync(() => {
    const accessFacts = ChannelAccessFacts.make(facts);

    expect(canViewChannel(accessFacts)).toBe(expected);
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
