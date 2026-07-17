import { expect, expectTypeOf, it } from "@effect/vitest";
import { Effect } from "effect";
import {
  InvalidIdentifier,
  makeChannelId,
  makeUserId,
  makeWorkspaceId,
  type ChannelId as ChannelIdType,
  type UserId as UserIdType,
  type WorkspaceId as WorkspaceIdType,
} from "../src/index.ts";

it.effect("creates a workspace identifier from a valid value", () =>
  Effect.gen(function* () {
    const id = yield* makeWorkspaceId("workspace-1");

    expect(id).toBe("workspace-1");
    expectTypeOf(id).toEqualTypeOf<WorkspaceIdType>();
  }),
);

it.effect("rejects an invalid workspace identifier", () =>
  Effect.gen(function* () {
    const error = yield* makeWorkspaceId("   ").pipe(Effect.flip);

    expect(error).toBeInstanceOf(InvalidIdentifier);
    expect(error).toMatchObject({
      _tag: "Domain.InvalidIdentifier",
      identifier: "workspace",
      reason: "empty",
    });
  }),
);

it.effect("distinguishes an untrimmed identifier from an empty one", () =>
  Effect.gen(function* () {
    const error = yield* makeWorkspaceId(" workspace-1 ").pipe(Effect.flip);

    expect(error).toMatchObject({
      _tag: "Domain.InvalidIdentifier",
      identifier: "workspace",
      reason: "not-trimmed",
    });
  }),
);

it.effect("creates a user identifier from a valid value", () =>
  Effect.gen(function* () {
    const id = yield* makeUserId("user-1");

    expect(id).toBe("user-1");
    expectTypeOf(id).toEqualTypeOf<UserIdType>();
  }),
);

it.effect("rejects an invalid user identifier", () =>
  Effect.gen(function* () {
    const error = yield* makeUserId("\t").pipe(Effect.flip);

    expect(error).toBeInstanceOf(InvalidIdentifier);
    expect(error).toMatchObject({
      _tag: "Domain.InvalidIdentifier",
      identifier: "user",
      reason: "empty",
    });
  }),
);

it.effect("creates a channel identifier from a valid value", () =>
  Effect.gen(function* () {
    const id = yield* makeChannelId("channel-1");

    expect(id).toBe("channel-1");
    expectTypeOf(id).toEqualTypeOf<ChannelIdType>();
  }),
);

it.effect("rejects an invalid channel identifier", () =>
  Effect.gen(function* () {
    const error = yield* makeChannelId("\n").pipe(Effect.flip);

    expect(error).toBeInstanceOf(InvalidIdentifier);
    expect(error).toMatchObject({
      _tag: "Domain.InvalidIdentifier",
      identifier: "channel",
      reason: "empty",
    });
  }),
);
