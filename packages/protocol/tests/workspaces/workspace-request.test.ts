import { expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import {
  CreateWorkspaceRequest,
  JoinWorkspaceRequest,
  UpdateWorkspaceIdentityRequest,
} from "../../src/index.ts";

it.effect("decodes workspace creation at the HTTP boundary", () =>
  Effect.gen(function* () {
    expect(
      yield* Schema.decodeUnknownEffect(CreateWorkspaceRequest)({
        name: "Product Studio",
        identity: {
          name: "Alice Product",
          avatarUrl: "/avatars/alice.svg",
        },
      }),
    ).toEqual({
      name: "Product Studio",
      identity: {
        name: "Alice Product",
        avatarUrl: "/avatars/alice.svg",
      },
    });
  }),
);

it.effect("decodes workspace identity updates at the HTTP boundary", () =>
  Effect.gen(function* () {
    expect(
      yield* Schema.decodeUnknownEffect(UpdateWorkspaceIdentityRequest)({
        name: "Alice Design",
        avatarUrl: "/avatars/default.svg",
      }),
    ).toEqual({
      name: "Alice Design",
      avatarUrl: "/avatars/default.svg",
    });
  }),
);

it.effect("rejects invalid workspace creation values", () =>
  Effect.gen(function* () {
    const invalidRequests: ReadonlyArray<unknown> = [
      {
        name: " ",
        identity: { name: "Alice", avatarUrl: "/avatars/alice.svg" },
      },
      {
        name: "Product Studio",
        identity: { name: " Alice ", avatarUrl: "/avatars/alice.svg" },
      },
    ];

    expect(
      yield* Effect.forEach(invalidRequests, (request) =>
        Schema.decodeUnknownEffect(CreateWorkspaceRequest)(request).pipe(
          Effect.as(false),
          Effect.catch(() => Effect.succeed(true)),
        ),
      ),
    ).toEqual([true, true]);
  }),
);

it.effect("rejects invalid workspace identity update values", () =>
  Effect.gen(function* () {
    expect(
      yield* Schema.decodeUnknownEffect(UpdateWorkspaceIdentityRequest)({
        name: "Alice",
        avatarUrl: "",
      }).pipe(
        Effect.as(false),
        Effect.catch(() => Effect.succeed(true)),
      ),
    ).toBe(true);
  }),
);

it.effect("decodes join negotiation at the HTTP boundary", () =>
  Effect.gen(function* () {
    expect(
      yield* Schema.decodeUnknownEffect(JoinWorkspaceRequest)({
        initialIdentityProfile: {
          name: "Alice Joining",
          avatarUrl: "/avatars/joining.svg",
        },
      }),
    ).toEqual({
      initialIdentityProfile: {
        name: "Alice Joining",
        avatarUrl: "/avatars/joining.svg",
      },
    });
  }),
);
