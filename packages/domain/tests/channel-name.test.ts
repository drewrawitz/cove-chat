import { expect, expectTypeOf, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { ChannelName, type ChannelName as ChannelNameType } from "../src/index.ts";

it.effect("creates a channel name after trimming surrounding whitespace", () =>
  Effect.gen(function* () {
    const name = yield* Schema.decodeUnknownEffect(ChannelName)("  product  ");

    expect(name).toBe("product");
    expectTypeOf(name).toEqualTypeOf<ChannelNameType>();
  }),
);

it.effect("rejects a channel name that is empty after trimming", () =>
  Effect.gen(function* () {
    const error = yield* Schema.decodeUnknownEffect(ChannelName)(" \n ").pipe(Effect.flip);

    expect(Schema.isSchemaError(error)).toBe(true);
  }),
);
