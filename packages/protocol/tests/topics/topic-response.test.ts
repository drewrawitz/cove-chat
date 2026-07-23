import { expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { TopicListResponse, TopicResponse } from "../../src/index.ts";

const openingBrief = {
  id: "message-1",
  body: "Capture the remaining launch risks.",
  position: 1,
  createdAt: new Date("2026-07-22T12:00:00.000Z"),
  edited: false,
  deleted: false,
  author: {
    id: "identity-1",
    name: "Alice",
    avatarUrl: "/avatars/alice.svg",
  },
};

it.effect("encodes Topic summaries with an optional intent and required Opening Brief", () =>
  Effect.gen(function* () {
    const encoded = yield* Schema.encodeUnknownEffect(TopicListResponse)({
      topics: [
        {
          id: "topic-1",
          workspaceId: "workspace-1",
          channelId: "channel-1",
          title: "Release readiness",
          intent: "question",
          openingBrief,
          messageCount: 1,
          createdAt: new Date("2026-07-22T12:00:00.000Z"),
        },
        {
          id: "topic-2",
          workspaceId: "workspace-1",
          channelId: "channel-1",
          title: "Launch notes",
          openingBrief,
          messageCount: 1,
          createdAt: new Date("2026-07-22T13:00:00.000Z"),
        },
      ],
    });
    expect(encoded.topics[0]).toMatchObject({
      id: "topic-1",
      intent: "question",
      openingBrief: { body: "Capture the remaining launch risks." },
      messageCount: 1,
    });
    expect(encoded.topics[1]).not.toHaveProperty("intent");
  }),
);

it.effect("encodes the complete Topic as a flat Message list", () =>
  Effect.gen(function* () {
    const encoded = yield* Schema.encodeUnknownEffect(TopicResponse)({
      id: "topic-1",
      workspaceId: "workspace-1",
      channelId: "channel-1",
      title: "Release readiness",
      messages: [
        openingBrief,
        {
          id: "message-2",
          position: 2,
          createdAt: new Date("2026-07-22T12:05:00.000Z"),
          edited: true,
          deleted: true,
          author: openingBrief.author,
        },
      ],
      createdAt: new Date("2026-07-22T12:00:00.000Z"),
    });

    expect(encoded).toMatchObject({
      id: "topic-1",
      messages: [
        { id: "message-1", position: 1, edited: false, deleted: false },
        { id: "message-2", position: 2, edited: true, deleted: true },
      ],
    });
    expect(encoded.messages[1]).not.toHaveProperty("body");
    expect(encoded).not.toHaveProperty("intent");
  }),
);
