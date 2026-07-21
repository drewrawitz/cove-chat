import { expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import {
  AcceptWorkspaceInvitationRequest,
  ChangeWorkspaceRoleRequest,
  CreateWorkspaceRequest,
  InviteWorkspaceMemberRequest,
  RedeemWorkspaceInvitationRequest,
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

it.effect("defaults omitted workspace identity avatars at the HTTP boundary", () =>
  Effect.gen(function* () {
    const created = yield* Schema.decodeUnknownEffect(CreateWorkspaceRequest)({
      name: "Product Studio",
      identity: { name: "Alice Product" },
    });
    const updated = yield* Schema.decodeUnknownEffect(UpdateWorkspaceIdentityRequest)({
      name: "Alice Design",
    });

    expect(created.identity.avatarUrl).toBe("/avatars/default.svg");
    expect(updated.avatarUrl).toBe("/avatars/default.svg");
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

it.effect("decodes invitation acceptance and role administration requests", () =>
  Effect.gen(function* () {
    expect(
      yield* Schema.decodeUnknownEffect(InviteWorkspaceMemberRequest)({
        email: "member@example.test",
      }),
    ).toEqual({ email: "member@example.test" });
    expect(
      yield* Schema.decodeUnknownEffect(AcceptWorkspaceInvitationRequest)({
        initialIdentityProfile: { name: "Invited Member" },
      }),
    ).toEqual({
      initialIdentityProfile: {
        name: "Invited Member",
        avatarUrl: "/avatars/default.svg",
      },
    });
    expect(
      yield* Schema.decodeUnknownEffect(RedeemWorkspaceInvitationRequest)({
        token: "invitation-secret",
        displayName: "Invited Account",
        initialIdentityProfile: { name: "Invited Member" },
      }),
    ).toEqual({
      token: "invitation-secret",
      displayName: "Invited Account",
      initialIdentityProfile: {
        name: "Invited Member",
        avatarUrl: "/avatars/default.svg",
      },
    });
    expect(
      yield* Schema.decodeUnknownEffect(ChangeWorkspaceRoleRequest)({ role: "owner" }),
    ).toEqual({ role: "owner" });
    expect(
      yield* Schema.decodeUnknownEffect(ChangeWorkspaceRoleRequest)({ role: "guest" }).pipe(
        Effect.as(false),
        Effect.catch(() => Effect.succeed(true)),
      ),
    ).toBe(true);
  }),
);
