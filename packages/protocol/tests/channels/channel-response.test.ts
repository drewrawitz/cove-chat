import { expect, it } from "@effect/vitest";
import {
  ChannelResponse,
  PrivateChannelAdministrationResponse,
  PrivateChannelListResponse,
  PrivateChannelMemberCandidateListResponse,
} from "../../src/index.ts";
import { Effect, Schema } from "effect";

it.effect("encodes authorized Private Channel content without changing its visibility", () =>
  Effect.gen(function* () {
    const encoded = yield* Schema.encodeUnknownEffect(ChannelResponse)({
      id: "channel-1",
      workspaceId: "workspace-1",
      name: "strategy",
      purpose: "Plan sensitive product strategy.",
      visibility: "private",
      maintainer: {
        id: "identity-1",
        name: "Alice",
        avatarUrl: "/avatars/alice.svg",
      },
      hasChannelMembership: true,
    });

    expect(encoded).toMatchObject({
      id: "channel-1",
      visibility: "private",
      hasChannelMembership: true,
    });
  }),
);

it.effect("encodes Private Channel administration metadata with visible membership", () =>
  Effect.gen(function* () {
    const encoded = yield* Schema.encodeUnknownEffect(PrivateChannelAdministrationResponse)({
      id: "channel-1",
      workspaceId: "workspace-1",
      name: "strategy",
      purpose: "Plan sensitive product strategy.",
      visibility: "private",
      maintainer: {
        id: "identity-1",
        name: "Alice",
        avatarUrl: "/avatars/alice.svg",
      },
      members: [
        {
          id: "identity-1",
          name: "Alice",
          avatarUrl: "/avatars/alice.svg",
        },
      ],
      actorHasChannelMembership: false,
    });

    expect(encoded).toMatchObject({
      visibility: "private",
      members: [{ id: "identity-1" }],
      actorHasChannelMembership: false,
    });
  }),
);

it.effect("encodes the actor's joined Private Channels", () =>
  Effect.gen(function* () {
    const encoded = yield* Schema.encodeUnknownEffect(PrivateChannelListResponse)({
      channels: [
        {
          id: "channel-1",
          workspaceId: "workspace-1",
          name: "strategy",
          purpose: "Plan sensitive product strategy.",
          visibility: "private",
          maintainer: {
            id: "identity-1",
            name: "Alice",
            avatarUrl: "/avatars/alice.svg",
          },
          hasChannelMembership: true,
        },
      ],
    });

    expect(encoded).toMatchObject({
      channels: [{ id: "channel-1", visibility: "private", hasChannelMembership: true }],
    });
  }),
);

it.effect("encodes eligible Private Channel member candidates", () =>
  Effect.gen(function* () {
    const encoded = yield* Schema.encodeUnknownEffect(PrivateChannelMemberCandidateListResponse)({
      members: [{ id: "identity-2", name: "Bob", avatarUrl: "/avatars/bob.svg" }],
    });

    expect(encoded).toEqual({
      members: [{ id: "identity-2", name: "Bob", avatarUrl: "/avatars/bob.svg" }],
    });
  }),
);
