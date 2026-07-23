/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { SnackbarProvider } from "./snackbar.tsx";
import { TopicMessages } from "./topic-messages.tsx";

const apiHarness = vi.hoisted(() => ({
  addMessage: vi.fn(),
}));

vi.mock("../api/generated/cove-app.ts", () => {
  const mutation = () => ({
    isPending: false,
    isError: false,
    mutate: vi.fn(),
    reset: vi.fn(),
  });

  return {
    useTopicsAddMessage: () => ({ ...mutation(), mutateAsync: apiHarness.addMessage }),
    useTopicsDeleteMessage: mutation,
    useTopicsEditMessage: mutation,
  };
});

const currentIdentity = {
  id: "identity-1",
  name: "Bob in Cove",
  avatarUrl: "/avatars/bob.svg",
};

const openingMessage = {
  id: "message-1",
  body: "Capture the remaining launch risks.",
  position: 1,
  createdAt: "2026-07-22T19:15:00.000Z",
  edited: true,
  deleted: false,
  author: currentIdentity,
};

const newReply = {
  id: "message-4",
  body: "The release candidate passed smoke testing.",
  position: 3,
  createdAt: "2026-07-22T19:16:00.000Z",
  edited: false,
  deleted: false,
  author: currentIdentity,
};

const unrelatedReply = {
  id: "message-2",
  body: "An incoming reply from someone else.",
  position: 2,
  createdAt: "2026-07-22T19:15:30.000Z",
  edited: false,
  deleted: false,
  author: {
    id: "identity-2",
    name: "Alice in Cove",
    avatarUrl: "/avatars/alice.svg",
  },
};

const scrollIntoView = vi.fn();

beforeEach(() => {
  apiHarness.addMessage.mockReset();
  apiHarness.addMessage.mockResolvedValue(newReply);
  scrollIntoView.mockClear();
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView,
  });
});

afterEach(() => {
  cleanup();
});

const topicMessages = (
  messages: ReadonlyArray<typeof openingMessage>,
  refresh: () => Promise<void> = () => Promise.resolve(),
) => (
  <SnackbarProvider>
    <TopicMessages
      canReply
      channelId="channel-1"
      currentIdentity={currentIdentity}
      messages={messages}
      refresh={refresh}
      topicId="topic-1"
      workspaceId="workspace-1"
    />
  </SnackbarProvider>
);

test("identifies messages by author and timestamp instead of a numbered heading", () => {
  const markup = renderToStaticMarkup(
    <SnackbarProvider>
      <TopicMessages
        canReply
        channelId="channel-1"
        currentIdentity={{
          id: "identity-1",
          name: "Bob in Cove",
          avatarUrl: "/avatars/bob.svg",
        }}
        messages={[
          {
            id: "message-1",
            body: "Capture the remaining launch risks.",
            position: 1,
            createdAt: "2026-07-22T19:15:00.000Z",
            edited: true,
            deleted: false,
            author: {
              id: "identity-1",
              name: "Bob in Cove",
              avatarUrl: "/avatars/bob.svg",
            },
          },
          {
            id: "message-2",
            body: "A repeated reply.",
            position: 2,
            createdAt: "2026-07-22T19:15:20.000Z",
            edited: false,
            deleted: false,
            author: {
              id: "identity-1",
              name: "Bob in Cove",
              avatarUrl: "/avatars/bob.svg",
            },
          },
          {
            id: "message-3",
            body: "A repeated reply.",
            position: 3,
            createdAt: "2026-07-22T19:15:40.000Z",
            edited: false,
            deleted: false,
            author: {
              id: "identity-1",
              name: "Bob in Cove",
              avatarUrl: "/avatars/bob.svg",
            },
          },
        ]}
        refresh={() => Promise.resolve()}
        topicId="topic-1"
        workspaceId="workspace-1"
      />
    </SnackbarProvider>,
  );

  expect(markup).toContain(">Bob in Cove</h3>");
  expect(markup).toContain('dateTime="2026-07-22T19:15:00.000Z"');
  expect(markup).toContain(">…</time>");
  expect(markup).toContain(
    'aria-label="More actions for opening brief by Bob in Cove: Capture the remaining launch risks."',
  );
  expect(markup).toContain("More actions for reply 1 by Bob in Cove");
  expect(markup).toContain("More actions for reply 2 by Bob in Cove");
  expect(markup).toContain(">Reply");
  expect(markup).toContain('aria-keyshortcuts="R"');
  expect(markup).not.toContain(">Opening Brief</h3>");
  expect(markup).not.toContain("Message 1");
});

test("scrolls the newly posted reply into view after it renders", async () => {
  const refresh = vi.fn(() => Promise.resolve());
  const { rerender } = render(topicMessages([openingMessage], refresh));

  fireEvent.click(screen.getByRole("button", { name: /Reply/ }));
  fireEvent.change(screen.getByLabelText("Write a reply"), {
    target: { value: newReply.body },
  });
  fireEvent.click(screen.getByRole("button", { name: "Post" }));

  await waitFor(() => {
    expect(apiHarness.addMessage).toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
  });
  expect(scrollIntoView).not.toHaveBeenCalled();

  rerender(topicMessages([openingMessage, unrelatedReply], refresh));
  expect(scrollIntoView).not.toHaveBeenCalled();

  rerender(topicMessages([openingMessage, unrelatedReply, newReply], refresh));

  await waitFor(() => {
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
  });
  expect(scrollIntoView.mock.contexts[0]).toBe(
    document.getElementById(`topic-message-${newReply.id}`),
  );
});

test("keeps the current scroll position when a reply arrives without a local post", () => {
  const { rerender } = render(topicMessages([openingMessage]));

  rerender(topicMessages([openingMessage, newReply]));

  expect(scrollIntoView).not.toHaveBeenCalled();
});
