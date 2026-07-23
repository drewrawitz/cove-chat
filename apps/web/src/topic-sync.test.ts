import { describe, expect, it } from "vite-plus/test";
import { synchronizedTopicDetail, synchronizedTopicSummaries } from "./topic-sync.ts";

const messages = [
  {
    id: "message-1",
    workspaceId: "workspace-1",
    topicId: "topic-1",
    authorIdentityId: "identity-1",
    body: "Opening context",
    position: 1,
    createdAt: Date.UTC(2026, 6, 23, 12),
    author: {
      id: "identity-1",
      workspaceId: "workspace-1",
      accountId: "account-1",
      name: "Alice",
      avatarUrl: "/alice.svg",
      role: "member" as const,
      membershipStartedAt: Date.UTC(2026, 0, 1),
      createdAt: Date.UTC(2026, 0, 1),
    },
  },
  {
    id: "message-2",
    workspaceId: "workspace-1",
    topicId: "topic-1",
    authorIdentityId: "identity-2",
    position: 2,
    createdAt: Date.UTC(2026, 6, 23, 13),
    editedAt: Date.UTC(2026, 6, 23, 14),
    deletedAt: Date.UTC(2026, 6, 23, 15),
    author: {
      id: "identity-2",
      workspaceId: "workspace-1",
      accountId: "account-2",
      name: "Bob",
      avatarUrl: "/bob.svg",
      role: "owner" as const,
      membershipStartedAt: Date.UTC(2026, 0, 1),
      createdAt: Date.UTC(2026, 0, 1),
    },
  },
];

const topic = {
  id: "topic-1",
  workspaceId: "workspace-1",
  channelId: "channel-1",
  title: "Launch readiness",
  intent: "question" as const,
  openedByIdentityId: "identity-1",
  createdAt: Date.UTC(2026, 6, 23, 12),
  messages,
};

describe("synchronized Topic views", () => {
  it("derives the channel summary from the latest committed Message", () => {
    expect(synchronizedTopicSummaries([topic])).toEqual([
      expect.objectContaining({
        id: "topic-1",
        messageCount: 2,
        latestMessage: expect.objectContaining({
          position: 2,
          deleted: true,
          author: expect.objectContaining({ name: "Bob" }),
        }),
      }),
    ]);
  });

  it("preserves flat Message order and tombstone state without duplicates", () => {
    const detail = synchronizedTopicDetail(topic);

    expect(detail?.messages.map(({ id }) => id)).toEqual(["message-1", "message-2"]);
    expect(detail?.messages[1]).toMatchObject({
      edited: true,
      deleted: true,
    });
    expect(detail?.messages[1]).not.toHaveProperty("body");
  });
});
