/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { SnackbarProvider } from "./snackbar.tsx";
import { TopicMessages } from "./topic-messages.tsx";

const apiHarness = vi.hoisted(() => ({
  addMessage: vi.fn(),
  editMessage: vi.fn(),
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
    useTopicsEditMessage: () => ({ ...mutation(), mutate: apiHarness.editMessage }),
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
const scrollTo = vi.fn();

beforeEach(() => {
  apiHarness.addMessage.mockReset();
  apiHarness.addMessage.mockResolvedValue(newReply);
  apiHarness.editMessage.mockReset();
  scrollIntoView.mockClear();
  scrollTo.mockClear();
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView,
  });
  Object.defineProperty(window, "scrollTo", {
    configurable: true,
    value: scrollTo,
  });
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    callback(0);
    return 1;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
});

const topicMessages = (messages: ReadonlyArray<typeof openingMessage>) => (
  <SnackbarProvider>
    <TopicMessages
      canReply
      channelId="channel-1"
      currentIdentity={currentIdentity}
      messages={messages}
      topicId="topic-1"
      workspaceId="workspace-1"
    />
  </SnackbarProvider>
);

const openOpeningBriefEditor = (): HTMLTextAreaElement => {
  fireEvent.click(
    screen.getByRole("button", {
      name: "More actions for opening brief by Bob in Cove: Capture the remaining launch risks.",
    }),
  );
  fireEvent.click(screen.getByRole("menuitem", { name: "Edit opening brief" }));

  return screen.getByLabelText("Edit opening brief") as HTMLTextAreaElement;
};

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

test("keeps message metadata and body in a compact column beside the avatar", () => {
  render(topicMessages([openingMessage]));

  const author = screen.getByRole("heading", { name: currentIdentity.name });
  const body = screen.getByText(openingMessage.body);
  const contentColumn = body.parentElement;

  expect(contentColumn?.contains(author)).toBe(true);
  expect(contentColumn?.querySelector("img")).toBeNull();
  expect(author.parentElement?.querySelector("time")).not.toBeNull();
  expect(author.parentElement?.classList.contains("flex")).toBe(true);
  expect(body.closest("li")?.classList.contains("py-5")).toBe(true);
});

test("opens a Topic with only its opening brief at the top", () => {
  render(topicMessages([openingMessage]));

  expect(scrollTo).toHaveBeenCalledOnce();
  expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" });
});

test("opens a Topic with replies at the latest message only once", () => {
  Object.defineProperty(document.documentElement, "scrollHeight", {
    configurable: true,
    value: 2400,
  });
  const { rerender } = render(topicMessages([openingMessage, unrelatedReply]));

  expect(scrollTo).toHaveBeenCalledOnce();
  expect(scrollTo).toHaveBeenCalledWith({ top: 2400, behavior: "auto" });

  rerender(topicMessages([openingMessage, unrelatedReply, newReply]));
  expect(scrollTo).toHaveBeenCalledOnce();
});

test("opens a Topic at the latest message when Strict Mode replays effects", () => {
  Object.defineProperty(document.documentElement, "scrollHeight", {
    configurable: true,
    value: 2400,
  });
  const pendingFrames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  vi.mocked(window.requestAnimationFrame).mockImplementation((callback) => {
    nextFrame += 1;
    pendingFrames.set(nextFrame, callback);
    return nextFrame;
  });
  vi.mocked(window.cancelAnimationFrame).mockImplementation((frame) => {
    pendingFrames.delete(frame);
  });

  render(<StrictMode>{topicMessages([openingMessage, unrelatedReply])}</StrictMode>);
  for (const callback of pendingFrames.values()) callback(0);

  expect(scrollTo).toHaveBeenCalledOnce();
  expect(scrollTo).toHaveBeenCalledWith({ top: 2400, behavior: "auto" });
});

test("focuses the message editor when Edit is selected", () => {
  render(topicMessages([openingMessage]));

  const editor = openOpeningBriefEditor();

  expect(editor).toBe(document.activeElement);
  expect(editor.selectionStart).toBe(openingMessage.body.length);
  expect(editor.selectionEnd).toBe(openingMessage.body.length);
});

test("discards message edits with Escape", () => {
  render(topicMessages([openingMessage]));
  const editor = openOpeningBriefEditor();
  fireEvent.change(editor, { target: { value: "An unfinished change" } });

  fireEvent.keyDown(editor, { key: "Escape" });

  expect(screen.queryByLabelText("Edit opening brief")).toBeNull();
  expect(screen.getByText(openingMessage.body)).toBeDefined();
});

test.each([
  { shortcut: "Command", modifier: { metaKey: true } },
  { shortcut: "Control", modifier: { ctrlKey: true } },
])("saves message edits with $shortcut+Enter", ({ modifier }) => {
  render(topicMessages([openingMessage]));
  const editor = openOpeningBriefEditor();
  fireEvent.change(editor, { target: { value: "A keyboard-first edit" } });

  fireEvent.keyDown(editor, { key: "Enter", ...modifier });

  expect(apiHarness.editMessage).toHaveBeenCalledWith(
    {
      workspaceId: "workspace-1",
      channelId: "channel-1",
      topicId: "topic-1",
      messageId: openingMessage.id,
      data: { body: "A keyboard-first edit" },
    },
    expect.objectContaining({ onSuccess: expect.any(Function) }),
  );
});

test("presents message editing as a composer with Cancel before Save", () => {
  render(topicMessages([openingMessage]));
  const editor = openOpeningBriefEditor();
  const form = editor.form;

  expect(form?.classList.contains("rounded-2xl")).toBe(true);
  expect(form?.parentElement?.querySelector("img")?.getAttribute("src")).toBe(
    currentIdentity.avatarUrl,
  );
  expect(
    within(form as HTMLFormElement)
      .getAllByRole("button")
      .map((button) => button.textContent),
  ).toEqual(["Cancel", "Save"]);
});

test("scrolls the newly posted reply into view after it renders", async () => {
  const { rerender } = render(topicMessages([openingMessage]));

  fireEvent.click(screen.getByRole("button", { name: /Reply/ }));
  fireEvent.change(screen.getByLabelText("Write a reply"), {
    target: { value: newReply.body },
  });
  fireEvent.click(screen.getByRole("button", { name: "Post" }));

  await waitFor(() => {
    expect(apiHarness.addMessage).toHaveBeenCalled();
  });
  expect(scrollIntoView).not.toHaveBeenCalled();

  rerender(topicMessages([openingMessage, unrelatedReply]));
  expect(scrollIntoView).not.toHaveBeenCalled();

  rerender(topicMessages([openingMessage, unrelatedReply, newReply]));

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
