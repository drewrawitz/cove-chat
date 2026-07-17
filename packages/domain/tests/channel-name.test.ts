import { expect, expectTypeOf, it } from "@effect/vitest";
import { Effect } from "effect";
import { InvalidChannelName, makeChannelName, type ChannelName } from "../src/index.ts";

it.effect("creates a channel name after trimming surrounding whitespace", () =>
  Effect.gen(function* () {
    const name = yield* makeChannelName("  product  ");

    expect(name).toBe("product");
    expectTypeOf(name).toEqualTypeOf<ChannelName>();
  }),
);

it.effect("rejects a channel name that is empty after trimming", () =>
  Effect.gen(function* () {
    const error = yield* makeChannelName(" \n ").pipe(Effect.flip);

    expect(error).toBeInstanceOf(InvalidChannelName);
    expect(error).toMatchObject({
      _tag: "Domain.InvalidChannelName",
      reason: "empty",
    });
  }),
);
