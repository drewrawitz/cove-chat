import { describe, expect, it } from "vite-plus/test";
import {
  combineTopicSummaries,
  completeTopicArchiveRequest,
  failTopicArchiveRequest,
  initialTopicArchivePagination,
  mergeTopicReplies,
  remainingTopicReplyCount,
  startTopicArchiveRequest,
  synchronizedTopicDetail,
  synchronizedTopicSummaries,
  topicProjectionState,
} from "./topic-sync.ts";

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
  messageCount: 2,
  latestMessageId: "message-2",
  latestMessagePreview: null,
  latestMessageAuthorIdentityId: "identity-2",
  latestMessagePosition: 2,
  latestMessageCreatedAt: Date.UTC(2026, 6, 23, 13),
  latestMessageEditedAt: Date.UTC(2026, 6, 23, 14),
  latestMessageDeletedAt: Date.UTC(2026, 6, 23, 15),
  latestMessageAuthor: messages[1]!.author,
  lastActivityAt: Date.UTC(2026, 6, 23, 13),
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

  it("deduplicates archived Topics when new activity moves them into the live window", () => {
    const live = synchronizedTopicSummaries([topic]);
    const archivedOnly = {
      ...live[0]!,
      id: "topic-older",
      title: "Older Topic",
    };

    expect(combineTopicSummaries(live, [live[0]!, archivedOnly]).map(({ id }) => id)).toEqual([
      "topic-1",
      "topic-older",
    ]);

    const initialLiveSnapshot = combineTopicSummaries(live, []);
    expect(combineTopicSummaries([archivedOnly], initialLiveSnapshot).map(({ id }) => id)).toEqual([
      "topic-older",
      "topic-1",
    ]);
  });

  it("starts a fresh archive traversal after a cursor fails", () => {
    const loading = startTopicArchiveRequest({
      cursor: "expired-cursor",
      started: true,
      pending: false,
      error: true,
    });
    expect(loading).toEqual({
      cursor: "expired-cursor",
      started: true,
      pending: true,
      error: false,
    });

    expect(failTopicArchiveRequest()).toEqual({
      started: false,
      pending: false,
      error: true,
    });
    expect(completeTopicArchiveRequest(undefined)).toEqual({
      started: true,
      pending: false,
      error: false,
    });
    expect(initialTopicArchivePagination).not.toHaveProperty("cursor");
  });

  it("preserves flat Message order and tombstone state without duplicates", () => {
    const detail = synchronizedTopicDetail(topic, messages[0], messages.slice(1));

    expect(detail?.messages.map(({ id }) => id)).toEqual(["message-1", "message-2"]);
    expect(detail?.messages[1]).toMatchObject({
      edited: true,
      deleted: true,
    });
    expect(detail?.messages[1]).not.toHaveProperty("body");
  });

  it("merges Reply pages by identity in Topic order without losing a shifted boundary", () => {
    const initial = Array.from({ length: 100 }, (_, index) => ({
      ...messages[0]!,
      id: `message-${index + 902}`,
      position: index + 902,
    }));
    const older = Array.from({ length: 100 }, (_, index) => ({
      ...messages[0]!,
      id: `message-${index + 802}`,
      position: index + 802,
    }));
    const afterNewActivity = Array.from({ length: 100 }, (_, index) => ({
      ...messages[0]!,
      id: `message-${index + 903}`,
      position: index + 903,
    }));

    const loaded = mergeTopicReplies([], initial);
    const withOlder = mergeTopicReplies(loaded, older);
    const shifted = mergeTopicReplies(withOlder, afterNewActivity);

    expect(shifted.map(({ position }) => position)).toEqual(
      Array.from({ length: 201 }, (_, index) => index + 802),
    );
    expect(new Set(shifted.map(({ id }) => id)).size).toBe(shifted.length);
    expect(remainingTopicReplyCount(1_001, withOlder)).toBe(800);
    expect(remainingTopicReplyCount(1_002, shifted)).toBe(800);
  });

  it.each([0, 100, 101, 1_000])(
    "loads all %i Replies across repeatable 100-row boundaries",
    (replyCount) => {
      const allReplies = Array.from({ length: replyCount }, (_, index) => ({
        ...messages[0]!,
        id: `reply-${index + 1}`,
        position: index + 2,
      }));
      const pageBefore = (beforePosition?: number) =>
        allReplies
          .filter(({ position }) => beforePosition === undefined || position < beforePosition)
          .sort((left, right) => right.position - left.position)
          .slice(0, 100);

      let loaded = mergeTopicReplies([], pageBefore());
      while (remainingTopicReplyCount(replyCount + 1, loaded) > 0) {
        const beforePosition = loaded[0]!.position;
        const page = pageBefore(beforePosition);
        loaded = mergeTopicReplies(loaded, page);
        loaded = mergeTopicReplies(loaded, pageBefore(beforePosition));
      }

      expect(loaded.map(({ position }) => position)).toEqual(
        Array.from({ length: replyCount }, (_, index) => index + 2),
      );
      expect(new Set(loaded.map(({ id }) => id)).size).toBe(replyCount);
      expect(remainingTopicReplyCount(replyCount + 1, loaded)).toBe(0);
    },
  );

  it("keeps a just-created Topic syncing until its delayed projection arrives", () => {
    expect([
      topicProjectionState({
        queryResultType: "complete",
        topicAvailable: false,
        justCreated: true,
      }),
      topicProjectionState({
        queryResultType: "complete",
        topicAvailable: true,
        justCreated: true,
      }),
    ]).toEqual(["syncing", "available"]);

    expect(
      topicProjectionState({
        queryResultType: "complete",
        topicAvailable: false,
        justCreated: false,
      }),
    ).toBe("unavailable");
  });
});
