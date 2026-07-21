import { expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import {
  WorkspaceInvitationAcceptedResponse,
  WorkspaceInvitationListResponse,
  WorkspaceInvitationRedeemedResponse,
  WorkspaceRoleChangeResponse,
  WorkspaceAccessResponse,
  WorkspaceCreatedResponse,
  WorkspaceIdentityUpdateResponse,
  FullMemberListResponse,
} from "../../src/index.ts";

const occurredAt = new Date("2026-07-18T14:30:00.000Z");

it.effect("encodes stable profile-free workspace mutation outcomes", () =>
  Effect.gen(function* () {
    expect(
      yield* Schema.encodeUnknownEffect(WorkspaceCreatedResponse)({
        outcome: "WorkspaceCreated",
        workspaceId: "workspace-1",
        workspaceIdentityId: "identity-1",
        generalChannelId: "general",
        occurredAt,
      }),
    ).toEqual({
      outcome: "WorkspaceCreated",
      workspaceId: "workspace-1",
      workspaceIdentityId: "identity-1",
      generalChannelId: "general",
      occurredAt: "2026-07-18T14:30:00.000Z",
    });

    expect(
      yield* Schema.encodeUnknownEffect(WorkspaceIdentityUpdateResponse)({
        outcome: "IdentityProfileUnchanged",
        workspaceId: "workspace-1",
        workspaceIdentityId: "identity-1",
        occurredAt,
      }),
    ).toEqual({
      outcome: "IdentityProfileUnchanged",
      workspaceId: "workspace-1",
      workspaceIdentityId: "identity-1",
      occurredAt: "2026-07-18T14:30:00.000Z",
    });
  }),
);

it.effect("includes the General Channel in Workspace access", () =>
  Effect.gen(function* () {
    expect(
      yield* Schema.encodeUnknownEffect(WorkspaceAccessResponse)({
        workspace: { id: "workspace-1", name: "Product Studio" },
        identity: { id: "identity-1", name: "Alice", avatarUrl: "/alice.svg" },
        membership: { role: "owner" },
        generalChannelId: "general",
      }),
    ).toEqual({
      workspace: { id: "workspace-1", name: "Product Studio" },
      identity: { id: "identity-1", name: "Alice", avatarUrl: "/alice.svg" },
      membership: { role: "owner" },
      generalChannelId: "general",
    });
  }),
);

it.effect("encodes invitation and Workspace Role administration responses", () =>
  Effect.gen(function* () {
    expect(
      yield* Schema.encodeUnknownEffect(WorkspaceInvitationListResponse)({
        invitations: [
          {
            id: "invitation-1",
            workspace: { id: "workspace-1", name: "Product Studio" },
            role: "member",
            requiresIdentityProfile: true,
            invitedAt: occurredAt,
          },
        ],
      }),
    ).toEqual({
      invitations: [
        {
          id: "invitation-1",
          workspace: { id: "workspace-1", name: "Product Studio" },
          role: "member",
          requiresIdentityProfile: true,
          invitedAt: "2026-07-18T14:30:00.000Z",
        },
      ],
    });
    expect(
      yield* Schema.encodeUnknownEffect(WorkspaceInvitationAcceptedResponse)({
        outcome: "WorkspaceInvitationAccepted",
        invitationId: "invitation-1",
        workspaceId: "workspace-1",
        workspaceIdentityId: "identity-1",
        occurredAt,
      }),
    ).toMatchObject({ outcome: "WorkspaceInvitationAccepted", invitationId: "invitation-1" });
    expect(
      yield* Schema.encodeUnknownEffect(WorkspaceInvitationRedeemedResponse)({
        outcome: "WorkspaceInvitationRedeemed",
        account: {
          id: "account-1",
          email: "member@example.test",
          displayName: "Invited Account",
        },
        invitationId: "invitation-1",
        workspaceId: "workspace-1",
        workspaceIdentityId: "identity-1",
        occurredAt,
      }),
    ).toMatchObject({
      outcome: "WorkspaceInvitationRedeemed",
      account: { email: "member@example.test" },
      invitationId: "invitation-1",
    });
    expect(
      yield* Schema.encodeUnknownEffect(WorkspaceRoleChangeResponse)({
        outcome: "WorkspaceRoleChanged",
        workspaceId: "workspace-1",
        workspaceIdentityId: "identity-1",
        previousRole: "member",
        role: "admin",
        occurredAt,
      }),
    ).toMatchObject({ outcome: "WorkspaceRoleChanged", previousRole: "member", role: "admin" });
  }),
);

it.effect("keeps guests out of the Full Member response", () =>
  Effect.gen(function* () {
    expect(
      yield* Schema.decodeUnknownEffect(FullMemberListResponse)({
        members: [
          {
            identity: { id: "identity-1", name: "External Guest", avatarUrl: "/guest.svg" },
            membership: { role: "guest" },
          },
        ],
      }).pipe(
        Effect.as(false),
        Effect.catch(() => Effect.succeed(true)),
      ),
    ).toBe(true);
  }),
);
