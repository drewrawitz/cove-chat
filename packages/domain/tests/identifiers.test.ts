import { expect, expectTypeOf, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import {
  ChannelId,
  UserId,
  WorkspaceId,
  type ChannelId as ChannelIdType,
  type UserId as UserIdType,
  type WorkspaceId as WorkspaceIdType,
} from "../src/index.ts";

it.effect("creates a workspace identifier from a valid value", () =>
  Effect.gen(function* () {
    const id = yield* WorkspaceId.makeEffect("workspace-1");

    expect(id).toBe("workspace-1");
    expectTypeOf(id).toEqualTypeOf<WorkspaceIdType>();
  }),
);

it.effect("rejects an invalid workspace identifier", () =>
  Effect.gen(function* () {
    const error = yield* WorkspaceId.makeEffect("   ").pipe(Effect.flip);

    expect(Schema.isSchemaError(error)).toBe(true);
  }),
);

it.effect("creates a user identifier from a valid value", () =>
  Effect.gen(function* () {
    const id = yield* UserId.makeEffect("user-1");

    expect(id).toBe("user-1");
    expectTypeOf(id).toEqualTypeOf<UserIdType>();
  }),
);

it.effect("rejects an invalid user identifier", () =>
  Effect.gen(function* () {
    const error = yield* UserId.makeEffect("\t").pipe(Effect.flip);

    expect(Schema.isSchemaError(error)).toBe(true);
  }),
);

it.effect("creates a channel identifier from a valid value", () =>
  Effect.gen(function* () {
    const id = yield* ChannelId.makeEffect("channel-1");

    expect(id).toBe("channel-1");
    expectTypeOf(id).toEqualTypeOf<ChannelIdType>();
  }),
);

it.effect("rejects an invalid channel identifier", () =>
  Effect.gen(function* () {
    const error = yield* ChannelId.makeEffect("\n").pipe(Effect.flip);

    expect(Schema.isSchemaError(error)).toBe(true);
  }),
);
