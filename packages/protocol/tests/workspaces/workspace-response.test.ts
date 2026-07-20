import { expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import {
  WorkspaceCreatedResponse,
  WorkspaceIdentityUpdateResponse,
  WorkspaceJoinedResponse,
} from "../../src/index.ts";

const occurredAt = new Date("2026-07-18T14:30:00.000Z");

it.effect("encodes stable profile-free workspace mutation outcomes", () =>
  Effect.gen(function* () {
    expect(
      yield* Schema.encodeUnknownEffect(WorkspaceCreatedResponse)({
        outcome: "WorkspaceCreated",
        workspaceId: "workspace-1",
        workspaceIdentityId: "identity-1",
        occurredAt,
      }),
    ).toEqual({
      outcome: "WorkspaceCreated",
      workspaceId: "workspace-1",
      workspaceIdentityId: "identity-1",
      occurredAt: "2026-07-18T14:30:00.000Z",
    });

    expect(
      yield* Schema.encodeUnknownEffect(WorkspaceJoinedResponse)({
        outcome: "WorkspaceMembershipReactivated",
        workspaceId: "workspace-1",
        workspaceIdentityId: "identity-1",
        occurredAt,
      }),
    ).toEqual({
      outcome: "WorkspaceMembershipReactivated",
      workspaceId: "workspace-1",
      workspaceIdentityId: "identity-1",
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
