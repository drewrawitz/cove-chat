import { expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import {
  CreatePublicChannelRequest,
  CreateTopicRequest,
  MessageMutationRequest,
  TopicArchivePageResponse,
  TopicResponse,
} from "../../src/index.ts";

const latestMessage = {
  id: "message-2",
  preview: "The release candidate passed smoke testing.",
  position: 2,
  createdAt: new Date("2026-07-22T12:05:00.000Z"),
  edited: false,
  deleted: false,
  author: {
    id: "identity-2",
    name: "Bob",
    avatarUrl: "/avatars/bob.svg",
  },
};

it.effect("encodes stable Topic archive pages with bounded latest previews", () =>
  Effect.gen(function* () {
    const encoded = yield* Schema.encodeUnknownEffect(TopicArchivePageResponse)({
      topics: [
        {
          id: "topic-1",
          workspaceId: "workspace-1",
          channelId: "channel-1",
          title: "Release readiness",
          intent: "question",
          latestMessage,
          messageCount: 2,
          lastActivityAt: new Date("2026-07-22T12:05:00.000Z"),
          createdAt: new Date("2026-07-22T12:00:00.000Z"),
        },
        {
          id: "topic-2",
          workspaceId: "workspace-1",
          channelId: "channel-1",
          title: "Launch notes",
          latestMessage,
          messageCount: 2,
          lastActivityAt: new Date("2026-07-22T12:05:00.000Z"),
          createdAt: new Date("2026-07-22T13:00:00.000Z"),
        },
      ],
      nextCursor: "opaque-next-page",
    });
    expect(encoded.topics[0]).toMatchObject({
      id: "topic-1",
      intent: "question",
      latestMessage: {
        preview: "The release candidate passed smoke testing.",
        author: { name: "Bob" },
      },
      messageCount: 2,
    });
    expect(encoded.topics[1]).not.toHaveProperty("intent");
    expect(encoded.nextCursor).toBe("opaque-next-page");
  }),
);

it.effect("rejects multibyte content and summary previews above their UTF-8 byte limits", () =>
  Effect.gen(function* () {
    const oversizedTitle = Schema.decodeUnknownEffect(CreateTopicRequest)({
      title: "é".repeat(257),
      openingBrief: "Context",
    });
    const oversizedPurpose = Schema.decodeUnknownEffect(CreatePublicChannelRequest)({
      name: "general",
      purpose: "é".repeat(1025),
    });
    const oversizedPreview = Schema.decodeUnknownEffect(TopicArchivePageResponse)({
      topics: [
        {
          id: "topic-1",
          workspaceId: "workspace-1",
          channelId: "channel-1",
          title: "Release readiness",
          latestMessage: { ...latestMessage, preview: "é".repeat(257) },
          messageCount: 2,
          lastActivityAt: new Date("2026-07-22T12:05:00.000Z").toISOString(),
          createdAt: new Date("2026-07-22T12:00:00.000Z").toISOString(),
        },
      ],
    });
    const oversizedOpeningBrief = Schema.decodeUnknownEffect(CreateTopicRequest)({
      title: "Release readiness",
      openingBrief: "é".repeat(4097),
    });
    const oversizedMessage = Schema.decodeUnknownEffect(MessageMutationRequest)({
      body: "é".repeat(4097),
    });

    expect(yield* oversizedTitle.pipe(Effect.flip)).toBeDefined();
    expect(yield* oversizedPurpose.pipe(Effect.flip)).toBeDefined();
    expect(yield* oversizedPreview.pipe(Effect.flip)).toBeDefined();
    expect(yield* oversizedOpeningBrief.pipe(Effect.flip)).toBeDefined();
    expect(yield* oversizedMessage.pipe(Effect.flip)).toBeDefined();
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
        {
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
        },
        {
          id: "message-2",
          position: 2,
          createdAt: new Date("2026-07-22T12:05:00.000Z"),
          edited: true,
          deleted: true,
          author: latestMessage.author,
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
