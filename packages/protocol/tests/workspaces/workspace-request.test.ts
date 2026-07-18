import { expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import {
  CreateWorkspaceRequest,
  EndWorkspaceMembershipRequest,
  JoinWorkspaceRequest,
  UpdateWorkspaceIdentityRequest,
} from "../../src/index.ts";

it.effect("decodes workspace creation at the HTTP boundary", () =>
  Effect.gen(function* () {
    expect(
      yield* Schema.decodeUnknownEffect(CreateWorkspaceRequest)({
        commandId: "create-workspace-command",
        name: "Product Studio",
        identity: {
          name: "Alice Product",
          avatarUrl: "/avatars/alice.svg",
        },
      }),
    ).toEqual({
      commandId: "create-workspace-command",
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
        commandId: "update-identity-command",
        name: "Alice Design",
        avatarUrl: "/avatars/default.svg",
      }),
    ).toEqual({
      commandId: "update-identity-command",
      name: "Alice Design",
      avatarUrl: "/avatars/default.svg",
    });
  }),
);

it.effect("rejects invalid workspace creation values", () =>
  Effect.gen(function* () {
    const invalidRequests: ReadonlyArray<unknown> = [
      {
        commandId: "create-invalid-name",
        name: " ",
        identity: { name: "Alice", avatarUrl: "/avatars/alice.svg" },
      },
      {
        commandId: "create-invalid-identity",
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
        commandId: "update-invalid-avatar",
        name: "Alice",
        avatarUrl: "",
      }).pipe(
        Effect.as(false),
        Effect.catch(() => Effect.succeed(true)),
      ),
    ).toBe(true);
  }),
);

it.effect("decodes join and leave command identities at the HTTP boundary", () =>
  Effect.gen(function* () {
    expect(
      yield* Schema.decodeUnknownEffect(JoinWorkspaceRequest)({
        commandId: "join-command",
        initialIdentityProfile: {
          name: "Alice Joining",
          avatarUrl: "/avatars/joining.svg",
        },
      }),
    ).toEqual({
      commandId: "join-command",
      initialIdentityProfile: {
        name: "Alice Joining",
        avatarUrl: "/avatars/joining.svg",
      },
    });
    expect(
      yield* Schema.decodeUnknownEffect(EndWorkspaceMembershipRequest)({
        commandId: "leave-command",
      }),
    ).toEqual({ commandId: "leave-command" });
  }),
);
