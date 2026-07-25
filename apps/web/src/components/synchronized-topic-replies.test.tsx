/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { SynchronizedTopicReplies, TOPIC_QUERY_TTL } from "./synchronized-topic-replies.tsx";

const queryHarness = vi.hoisted(() => ({
  bodyByPosition: new Map<number, string>(),
  calls: [] as Array<{
    readonly args: { readonly beforePosition?: number };
    readonly options: unknown;
  }>,
  newestPosition: 102,
  resultTypeByBeforePosition: new Map<number, "complete" | "error">(),
}));

vi.mock("@cove/sync", () => ({
  TOPIC_REPLY_PAGE_SIZE: 100,
  queries: {
    messages: {
      replies: (args: { readonly beforePosition?: number }) => ({ args }),
    },
  },
}));

vi.mock("@rocicorp/zero/react", () => ({
  useQuery: (query: { readonly args: { readonly beforePosition?: number } }, options: unknown) => {
    queryHarness.calls.push({ args: query.args, options });
    const endPosition = (query.args.beforePosition ?? queryHarness.newestPosition + 1) - 1;
    const startPosition = Math.max(2, endPosition - 99);
    const positions = Array.from(
      { length: Math.max(0, endPosition - startPosition + 1) },
      (_, index) => startPosition + index,
    );
    return [
      positions.map((position) => ({
        id: `message-${position}`,
        position,
        createdAt: Date.UTC(2026, 6, 25, 12, position),
        body: queryHarness.bodyByPosition.get(position) ?? `Reply ${position - 1}`,
        author: {
          id: "identity-1",
          name: "Alice",
          avatarUrl: "/alice.svg",
        },
      })),
      {
        type:
          query.args.beforePosition === undefined
            ? "complete"
            : (queryHarness.resultTypeByBeforePosition.get(query.args.beforePosition) ??
              "complete"),
      },
    ] as const;
  },
}));

afterEach(() => {
  cleanup();
  queryHarness.bodyByPosition.clear();
  queryHarness.calls.length = 0;
  queryHarness.newestPosition = 102;
  queryHarness.resultTypeByBeforePosition.clear();
});

test("keeps displaced Reply windows live with an explicit five-minute Zero TTL", async () => {
  const topicReplies = (messageCount: number): ReactElement => (
    <SynchronizedTopicReplies
      channelId="channel-1"
      messageCount={messageCount}
      topicId="topic-1"
      workspaceId="workspace-1"
    >
      {({
        isLoadingOlderReplies,
        loadOlderReplies,
        remainingReplyCount,
        replies,
      }): ReactElement => (
        <>
          <p>{`${replies.length} loaded, ${remainingReplyCount} remaining`}</p>
          <p>{`Boundary reply: ${replies.find(({ position }) => position === 3)?.body ?? "missing"}`}</p>
          <button type="button" disabled={isLoadingOlderReplies} onClick={loadOlderReplies}>
            Load
          </button>
        </>
      )}
    </SynchronizedTopicReplies>
  );
  const view = render(topicReplies(102));

  expect(screen.getByText("100 loaded, 1 remaining")).toBeDefined();
  expect(TOPIC_QUERY_TTL).toBe("5m");
  expect(queryHarness.calls[0]?.options).toEqual({ ttl: "5m" });
  expect(queryHarness.calls[0]?.args).not.toHaveProperty("beforePosition");

  act(() => {
    fireEvent.click(screen.getByRole("button", { name: "Load" }));
  });

  await waitFor(() => {
    expect(screen.getByText("101 loaded, 0 remaining")).toBeDefined();
  });
  expect(screen.getByText("Boundary reply: Reply 2")).toBeDefined();
  expect(
    queryHarness.calls.some(
      ({ args, options }) =>
        args.beforePosition === 3 &&
        typeof options === "object" &&
        options !== null &&
        "ttl" in options &&
        options.ttl === "5m",
    ),
  ).toBe(true);
  expect(
    queryHarness.calls.some(
      ({ args, options }) =>
        args.beforePosition === 103 &&
        typeof options === "object" &&
        options !== null &&
        "ttl" in options &&
        options.ttl === "5m",
    ),
  ).toBe(true);

  queryHarness.newestPosition = 103;
  view.rerender(topicReplies(103));
  await waitFor(() => {
    expect(screen.getByText("102 loaded, 0 remaining")).toBeDefined();
  });

  queryHarness.bodyByPosition.set(3, "Edited while displaced");
  view.rerender(topicReplies(103));
  await waitFor(() => {
    expect(screen.getByText("Boundary reply: Edited while displaced")).toBeDefined();
  });

  queryHarness.newestPosition = 202;
  view.rerender(topicReplies(202));
  await waitFor(() => {
    expect(screen.getByText("201 loaded, 0 remaining")).toBeDefined();
  });
  expect(
    queryHarness.calls.some(
      ({ args, options }) =>
        args.beforePosition === 203 &&
        typeof options === "object" &&
        options !== null &&
        "ttl" in options &&
        options.ttl === "5m",
    ),
  ).toBe(true);
});

test("retries an errored older Reply page without releasing retained live windows", async () => {
  queryHarness.resultTypeByBeforePosition.set(3, "error");
  render(
    <SynchronizedTopicReplies
      channelId="channel-1"
      messageCount={102}
      topicId="topic-1"
      workspaceId="workspace-1"
    >
      {({ loadOlderReplies, olderRepliesError, remainingReplyCount, replies }): ReactElement => (
        <>
          <p>{`${replies.length} loaded, ${remainingReplyCount} remaining`}</p>
          {olderRepliesError ? <p>Older Replies failed</p> : null}
          <button type="button" onClick={loadOlderReplies}>
            Load
          </button>
        </>
      )}
    </SynchronizedTopicReplies>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Load" }));
  await waitFor(() => {
    expect(screen.getByText("Older Replies failed")).toBeDefined();
  });
  expect(screen.getByText("100 loaded, 1 remaining")).toBeDefined();

  const retainedQueryCallsBeforeRetry = queryHarness.calls.filter(
    ({ args }) => args.beforePosition === 103,
  ).length;
  queryHarness.resultTypeByBeforePosition.delete(3);
  fireEvent.click(screen.getByRole("button", { name: "Load" }));

  await waitFor(() => {
    expect(screen.getByText("101 loaded, 0 remaining")).toBeDefined();
  });
  expect(screen.queryByText("Older Replies failed")).toBeNull();
  expect(
    queryHarness.calls.filter(({ args }) => args.beforePosition === 103).length,
  ).toBeGreaterThan(retainedQueryCallsBeforeRetry);
});
