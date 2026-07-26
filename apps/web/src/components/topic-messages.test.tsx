/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import {
  createAccountConversationState,
  type AccountConversationBroadcast,
  type AccountConversationState,
} from "../account-conversation-state.ts";
import { AccountConversationStateProvider } from "../account-conversation-state-context.tsx";
import { CoveApiError } from "../api/cove-fetch.ts";
import { BroadcastHub, MemoryStorage } from "../test-support/account-conversation-state.ts";
import { SnackbarProvider } from "./snackbar.tsx";
import { TopicMessages } from "./topic-messages.tsx";

const apiHarness = vi.hoisted(() => ({
  addMessage: vi.fn(),
  deleteMessage: vi.fn(),
  editMessage: vi.fn(),
  getMessageCommandStatus: vi.fn(),
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
    useTopicsDeleteMessage: () => ({ ...mutation(), mutateAsync: apiHarness.deleteMessage }),
    useTopicsEditMessage: () => ({ ...mutation(), mutateAsync: apiHarness.editMessage }),
    topicsGetMessageCommandStatus: apiHarness.getMessageCommandStatus,
  };
});

const currentIdentity = {
  id: "identity-1",
  name: "Bob in Cove",
  avatarUrl: "/avatars/bob.svg",
};

const topicScope = {
  workspaceId: "workspace-1",
  channelId: "channel-1",
  topicId: "topic-1",
};

const openingMessage = {
  id: "message-1",
  body: "Capture the remaining launch risks.",
  position: 1,
  version: 1,
  createdAt: "2026-07-22T19:15:00.000Z",
  edited: true,
  deleted: false,
  author: currentIdentity,
};

const newReply = {
  id: "message-4",
  body: "The release candidate passed smoke testing.",
  position: 3,
  version: 1,
  createdAt: "2026-07-22T19:16:00.000Z",
  edited: false,
  deleted: false,
  author: currentIdentity,
};

const unrelatedReply = {
  id: "message-2",
  body: "An incoming reply from someone else.",
  position: 2,
  version: 1,
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
const conversationStates: Array<AccountConversationState> = [];
let conversationState: AccountConversationState;

const makeConversationState = (
  createBroadcastChannel: (name: string) => AccountConversationBroadcast = () => ({
    addEventListener: () => undefined,
    close: () => undefined,
    postMessage: () => undefined,
    removeEventListener: () => undefined,
  }),
  now: () => number = Date.now,
  sourceStorage: Storage = window.sessionStorage,
): AccountConversationState => {
  const state = createAccountConversationState({
    accountId: "account-1",
    storage: window.localStorage,
    sourceStorage,
    createBroadcastChannel,
    now,
  });
  conversationStates.push(state);
  return state;
};

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  conversationState = makeConversationState();
  apiHarness.addMessage.mockReset();
  apiHarness.addMessage.mockResolvedValue(newReply);
  apiHarness.deleteMessage.mockReset();
  apiHarness.deleteMessage.mockResolvedValue({
    status: "succeeded",
    commandId: "delete-command",
    kind: "delete",
    messageId: openingMessage.id,
    messageVersion: 2,
  });
  apiHarness.editMessage.mockReset();
  apiHarness.getMessageCommandStatus.mockReset();
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
  for (const state of conversationStates) state.destroy();
  conversationStates.length = 0;
  Reflect.deleteProperty(window.navigator, "locks");
});

const topicMessages = (
  messages: ComponentProps<typeof TopicMessages>["messages"],
  pagination?: {
    readonly hasError: boolean;
    readonly isLoading: boolean;
    readonly load: () => void;
    readonly remainingCount: number;
  },
  state = conversationState,
  runtime: {
    readonly repairZeroCache?: () => Promise<void>;
    readonly restartZero?: () => void;
  } = {},
) => (
  <AccountConversationStateProvider
    state={state}
    repairZeroCache={runtime.repairZeroCache ?? (async () => undefined)}
    restartZero={runtime.restartZero ?? (() => undefined)}
  >
    <SnackbarProvider>
      <TopicMessages
        canReply
        channelId="channel-1"
        currentIdentity={currentIdentity}
        messages={messages}
        olderRepliesPagination={pagination}
        topicId="topic-1"
        workspaceId="workspace-1"
      />
    </SnackbarProvider>
  </AccountConversationStateProvider>
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

const openMessageDeleteDialog = (actionName: string, menuItemName: string): void => {
  fireEvent.click(screen.getByRole("button", { name: actionName }));
  fireEvent.click(screen.getByRole("menuitem", { name: menuItemName }));
};

const failStorageWritesFor = (keySuffix: string) => {
  const setItem = Storage.prototype.setItem.bind(window.localStorage);
  return vi.spyOn(Storage.prototype, "setItem").mockImplementation((key, value) => {
    if (key.endsWith(keySuffix)) throw new DOMException("Storage unavailable");
    setItem(key, value);
  });
};

test("identifies messages by author and timestamp instead of a numbered heading", () => {
  const markup = renderToStaticMarkup(
    topicMessages([
      {
        id: "message-1",
        body: "Capture the remaining launch risks.",
        position: 1,
        version: 1,
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
        version: 1,
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
        version: 1,
        createdAt: "2026-07-22T19:15:40.000Z",
        edited: false,
        deleted: false,
        author: {
          id: "identity-1",
          name: "Bob in Cove",
          avatarUrl: "/avatars/bob.svg",
        },
      },
    ]),
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

  expect(apiHarness.editMessage).toHaveBeenCalledWith({
    workspaceId: "workspace-1",
    channelId: "channel-1",
    topicId: "topic-1",
    messageId: openingMessage.id,
    data: {
      commandId: expect.any(String),
      expectedVersion: 1,
      body: "A keyboard-first edit",
    },
  });
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

test("prevents edit form submission after storage becomes unavailable", async () => {
  render(topicMessages([openingMessage]));
  const editor = openOpeningBriefEditor();
  const storage = failStorageWritesFor(":drafts");
  expect(() => conversationState.writeDraft(topicScope, "Cannot persist")).toThrow();
  storage.mockRestore();
  await screen.findByText(/Browser storage is unavailable/);
  const submit = new Event("submit", { bubbles: true, cancelable: true });

  await act(async () => {
    editor.form?.dispatchEvent(submit);
  });

  expect(submit.defaultPrevented).toBe(true);
  expect(apiHarness.editMessage).not.toHaveBeenCalled();
});

test("reports an edit that cannot be added to the durable command journal", async () => {
  render(topicMessages([openingMessage]));
  const editor = openOpeningBriefEditor();
  fireEvent.change(editor, { target: { value: "A locally durable edit" } });
  const storage = failStorageWritesFor(":commands");

  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(
    await screen.findByText("Browser storage is unavailable. Cove could not save this change."),
  ).toBeDefined();
  expect(apiHarness.editMessage).not.toHaveBeenCalled();
  storage.mockRestore();
});

test("reports a deletion that cannot be added to the durable command journal", async () => {
  render(topicMessages([openingMessage]));
  openMessageDeleteDialog(
    `More actions for opening brief by ${currentIdentity.name}: ${openingMessage.body}`,
    "Delete opening brief",
  );
  const storage = failStorageWritesFor(":commands");

  fireEvent.click(screen.getByRole("button", { name: "Delete opening brief" }));

  expect(
    await screen.findByText("Browser storage is unavailable. Cove could not save this change."),
  ).toBeDefined();
  expect(apiHarness.deleteMessage).not.toHaveBeenCalled();
  storage.mockRestore();
});

test("keeps unrelated Reply and Message controls enabled during an edit", async () => {
  apiHarness.editMessage.mockReturnValue(new Promise(() => undefined));
  render(topicMessages([openingMessage, newReply]));

  fireEvent.click(
    screen.getByRole("button", {
      name: `More actions for reply 2 by ${currentIdentity.name}: ${newReply.body}`,
    }),
  );
  fireEvent.click(screen.getByRole("menuitem", { name: "Edit reply" }));
  fireEvent.change(screen.getByLabelText("Edit reply"), {
    target: { value: "An edit still awaiting HTTP." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(apiHarness.editMessage).toHaveBeenCalledOnce());

  fireEvent.click(screen.getByRole("button", { name: /Reply/ }));
  fireEvent.change(screen.getByLabelText("Write a reply"), {
    target: { value: "An independent reply." },
  });
  expect(screen.getByRole("button", { name: "Post" }).hasAttribute("disabled")).toBe(false);

  openOpeningBriefEditor();
  expect(screen.getByRole("button", { name: "Save" }).hasAttribute("disabled")).toBe(false);
});

test("restores a rejected deletion with an explanation that can be dismissed", async () => {
  apiHarness.deleteMessage.mockRejectedValue(
    new CoveApiError(409, {
      code: "CHANNEL_UNAVAILABLE",
      message: "Channel is unavailable.",
    }),
  );
  render(topicMessages([openingMessage]));

  openMessageDeleteDialog(
    `More actions for opening brief by ${currentIdentity.name}: ${openingMessage.body}`,
    "Delete opening brief",
  );
  fireEvent.click(screen.getByRole("button", { name: "Delete opening brief" }));

  await waitFor(() => {
    expect(screen.getByRole("alert").textContent).toBe(
      "This deletion was rejected. The opening brief was restored.",
    );
  });
  expect(screen.getByText(openingMessage.body)).toBeDefined();

  fireEvent.click(screen.getByRole("button", { name: "Dismiss deletion error" }));
  expect(screen.queryByRole("alert")).toBeNull();
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
  expect(scrollIntoView).toHaveBeenCalledOnce();
  expect((scrollIntoView.mock.contexts[0] as Element).id).toMatch(/^topic-message-optimistic-/);

  rerender(topicMessages([openingMessage, unrelatedReply]));
  expect(scrollIntoView).toHaveBeenCalledOnce();

  const commandId = apiHarness.addMessage.mock.calls[0]?.[0]?.data.commandId as string;
  rerender(
    topicMessages([
      openingMessage,
      unrelatedReply,
      { ...newReply, producedByCommandId: commandId },
    ]),
  );

  await waitFor(() => {
    expect(scrollIntoView).toHaveBeenCalledOnce();
  });
});

test("keeps a successful post successful when clearing its draft fails", async () => {
  render(topicMessages([openingMessage]));
  fireEvent.click(screen.getByRole("button", { name: /Reply/ }));
  fireEvent.change(screen.getByLabelText("Write a reply"), {
    target: { value: newReply.body },
  });
  const storage = failStorageWritesFor(":drafts");

  fireEvent.click(screen.getByRole("button", { name: "Post" }));

  await waitFor(() => expect(apiHarness.addMessage).toHaveBeenCalledOnce());
  expect(await screen.findByRole("button", { name: /Reply/ })).toBeDefined();
  expect(screen.queryByText("Cove could not add this reply. Refresh and try again.")).toBeNull();
  storage.mockRestore();
});

test("restores an Account-scoped Topic draft after remount", () => {
  const firstRender = render(topicMessages([openingMessage]));
  fireEvent.click(screen.getByRole("button", { name: /Reply/ }));
  fireEvent.change(screen.getByLabelText("Write a reply"), {
    target: { value: "An unsent Reply survives reload." },
  });
  firstRender.unmount();

  render(topicMessages([openingMessage]));
  fireEvent.click(screen.getByRole("button", { name: /Reply/ }));

  expect((screen.getByLabelText("Write a reply") as HTMLTextAreaElement).value).toBe(
    "An unsent Reply survives reload.",
  );
});

test("shows one unresolved overlay across tabs while only the source tab dispatches HTTP", async () => {
  apiHarness.addMessage.mockReturnValue(new Promise(() => undefined));
  const hub = new BroadcastHub();
  const sourceState = makeConversationState(hub.create, undefined, new MemoryStorage());
  const otherState = makeConversationState(hub.create, undefined, new MemoryStorage());
  const source = render(topicMessages([openingMessage], undefined, sourceState));
  const other = render(topicMessages([openingMessage], undefined, otherState));

  fireEvent.click(within(source.container).getByRole("button", { name: /Reply/ }));
  fireEvent.change(within(source.container).getByLabelText("Write a reply"), {
    target: { value: "Shared pending Reply" },
  });
  fireEvent.click(within(source.container).getByRole("button", { name: "Post" }));

  await waitFor(() => {
    expect(
      within(within(source.container).getByRole("list", { name: "Topic messages" })).getByText(
        "Shared pending Reply",
      ),
    ).toBeDefined();
    expect(
      within(within(other.container).getByRole("list", { name: "Topic messages" })).getByText(
        "Shared pending Reply",
      ),
    ).toBeDefined();
  });
  expect(apiHarness.addMessage).toHaveBeenCalledOnce();

  const commandId = apiHarness.addMessage.mock.calls[0]?.[0]?.data.commandId as string;
  sourceState.markCommandUncertain(commandId);
  await waitFor(() =>
    expect(within(source.container).getByRole("button", { name: "Retry" })).toBeDefined(),
  );
  expect(within(other.container).queryByRole("button", { name: "Retry" })).toBeNull();

  fireEvent.click(within(source.container).getByRole("button", { name: "Retry" }));
  expect(apiHarness.addMessage).toHaveBeenCalledTimes(2);
});

test("keeps one HTTP-first overlay until the authoritative Zero row arrives", async () => {
  const view = render(topicMessages([openingMessage]));

  fireEvent.click(screen.getByRole("button", { name: /Reply/ }));
  fireEvent.change(screen.getByLabelText("Write a reply"), {
    target: { value: newReply.body },
  });
  fireEvent.click(screen.getByRole("button", { name: "Post" }));

  await waitFor(() => {
    expect(screen.getByRole("status").textContent).toBe("Syncing…");
  });
  const commandId = apiHarness.addMessage.mock.calls[0]?.[0]?.data.commandId as string;
  expect(conversationState.commandsFor(topicScope)).toMatchObject([
    { commandId, phase: "syncing" },
  ]);

  view.rerender(topicMessages([{ ...newReply, producedByCommandId: commandId }]));

  await waitFor(() => expect(conversationState.commandsFor(topicScope)).toEqual([]));
  expect(
    within(screen.getByRole("list", { name: "Topic messages" })).getAllByText(newReply.body),
  ).toHaveLength(1);
  expect(apiHarness.addMessage).toHaveBeenCalledOnce();
});

test("reconciles a Zero-first row while the source HTTP response is still pending", async () => {
  let resolveAddMessage = (_message: typeof newReply): void => undefined;
  apiHarness.addMessage.mockReturnValue(
    new Promise<typeof newReply>((resolve) => {
      resolveAddMessage = resolve;
    }),
  );
  const view = render(topicMessages([openingMessage]));

  fireEvent.click(screen.getByRole("button", { name: /Reply/ }));
  fireEvent.change(screen.getByLabelText("Write a reply"), {
    target: { value: newReply.body },
  });
  fireEvent.click(screen.getByRole("button", { name: "Post" }));
  await waitFor(() => expect(apiHarness.addMessage).toHaveBeenCalledOnce());
  const commandId = apiHarness.addMessage.mock.calls[0]?.[0]?.data.commandId as string;

  view.rerender(topicMessages([{ ...newReply, producedByCommandId: commandId }]));

  await waitFor(() => expect(conversationState.commandsFor(topicScope)).toEqual([]));
  expect(
    within(screen.getByRole("list", { name: "Topic messages" })).getAllByText(newReply.body),
  ).toHaveLength(1);

  resolveAddMessage(newReply);
  await waitFor(() => expect(screen.getByRole("button", { name: /Reply/ })).toBeDefined());
  expect(conversationState.commandsFor(topicScope)).toEqual([]);
  expect(apiHarness.addMessage).toHaveBeenCalledOnce();
});

test("restores an unresolved overlay after reload without replaying its command", () => {
  conversationState.startCommand(
    {
      workspaceId: "workspace-1",
      channelId: "channel-1",
      topicId: "topic-1",
    },
    {
      kind: "create",
      commandId: "restored-command",
      body: "Restored unresolved Reply",
      author: currentIdentity,
      createdAt: "2026-07-25T12:00:00.000Z",
    },
  );
  const restoredState = makeConversationState();

  render(topicMessages([openingMessage], undefined, restoredState));

  expect(screen.getByText("Restored unresolved Reply")).toBeDefined();
  expect(apiHarness.addMessage).not.toHaveBeenCalled();
});

test("checks one delayed receipt and restarts Zero at most once across reload", async () => {
  const timedState = makeConversationState(undefined, () => Date.now() - 10_001);
  const restartZero = vi.fn();
  apiHarness.getMessageCommandStatus.mockResolvedValue({
    status: "succeeded",
    commandId: "accepted-command",
    kind: "create",
    messageId: "message-2",
    messageVersion: 1,
  });
  timedState.startCommand(
    {
      workspaceId: "workspace-1",
      channelId: "channel-1",
      topicId: "topic-1",
    },
    {
      kind: "create",
      commandId: "accepted-command",
      body: "Accepted but not synchronized",
      author: currentIdentity,
      createdAt: "2026-07-25T12:00:00.000Z",
    },
  );
  timedState.markCommandAccepted("accepted-command");
  const firstTab = render(topicMessages([openingMessage], undefined, timedState, { restartZero }));

  await waitFor(() => expect(apiHarness.getMessageCommandStatus).toHaveBeenCalledOnce());
  expect(apiHarness.getMessageCommandStatus).toHaveBeenCalledWith(
    "workspace-1",
    "accepted-command",
  );
  expect(restartZero).toHaveBeenCalledOnce();
  firstTab.unmount();

  const reloadedState = makeConversationState();
  render(topicMessages([openingMessage], undefined, reloadedState, { restartZero }));
  await new Promise((resolve) => window.setTimeout(resolve, 0));

  expect(apiHarness.getMessageCommandStatus).toHaveBeenCalledOnce();
  expect(restartZero).toHaveBeenCalledOnce();
  expect(reloadedState.commandsFor(topicScope)[0]).toMatchObject({
    receiptCheckStartedAt: expect.any(String),
    zeroRestartedAt: expect.any(String),
  });
});

test("serializes delayed receipt reconciliation across tabs", async () => {
  let lockTail = Promise.resolve();
  Object.defineProperty(window.navigator, "locks", {
    configurable: true,
    value: {
      request: async <Value,>(_name: string, callback: () => Promise<Value>): Promise<Value> => {
        const previous = lockTail;
        let releaseLock = (): void => undefined;
        lockTail = new Promise<void>((resolve) => {
          releaseLock = resolve;
        });
        await previous;
        try {
          return await callback();
        } finally {
          releaseLock();
        }
      },
    } as LockManager,
  });
  const sourceState = makeConversationState(undefined, () => Date.now() - 10_001);
  sourceState.startCommand(topicScope, {
    kind: "create",
    commandId: "shared-accepted-command",
    body: "Accepted in both tabs",
    author: currentIdentity,
    createdAt: "2026-07-25T12:00:00.000Z",
  });
  sourceState.markCommandAccepted("shared-accepted-command");
  const otherState = makeConversationState();
  const restartZero = vi.fn();
  apiHarness.getMessageCommandStatus.mockResolvedValue({
    status: "succeeded",
    commandId: "shared-accepted-command",
    kind: "create",
    messageId: "message-2",
    messageVersion: 1,
  });

  render(topicMessages([openingMessage], undefined, sourceState, { restartZero }));
  render(topicMessages([openingMessage], undefined, otherState, { restartZero }));

  await waitFor(() => expect(apiHarness.getMessageCommandStatus).toHaveBeenCalled());
  await new Promise((resolve) => window.setTimeout(resolve, 10));
  expect(apiHarness.getMessageCommandStatus).toHaveBeenCalledOnce();
  expect(restartZero).toHaveBeenCalledOnce();
});

test("offers cache-only synchronization repair after thirty seconds without replaying work", async () => {
  const timedState = makeConversationState(undefined, () => Date.now() - 30_001);
  const repairZeroCache = vi.fn(async () => undefined);
  timedState.writeDraft(
    {
      workspaceId: "workspace-1",
      channelId: "channel-1",
      topicId: "topic-1",
    },
    "Preserve this draft",
  );
  timedState.startCommand(
    {
      workspaceId: "workspace-1",
      channelId: "channel-1",
      topicId: "topic-1",
    },
    {
      kind: "create",
      commandId: "delayed-command",
      body: "Still synchronizing",
      author: currentIdentity,
      createdAt: "2026-07-25T12:00:00.000Z",
    },
  );
  timedState.markCommandAccepted("delayed-command");
  render(
    topicMessages([openingMessage], undefined, timedState, {
      repairZeroCache,
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Repair synchronization" }));

  expect(repairZeroCache).toHaveBeenCalledOnce();
  expect(timedState.readDraft(topicScope)).toBe("Preserve this draft");
  expect(timedState.commandsFor(topicScope)).toHaveLength(1);
  expect(apiHarness.addMessage).not.toHaveBeenCalled();
});

test.each([
  new CoveApiError(401, {
    code: "UNAUTHENTICATED",
    message: "Authentication is required.",
  }),
  new CoveApiError(403, {
    code: "CSRF_VALIDATION_FAILED",
    message: "CSRF validation failed.",
  }),
])("keeps an unreceipted $status response on the explicit retry path", async (error) => {
  apiHarness.addMessage.mockRejectedValue(error);
  render(topicMessages([openingMessage]));

  fireEvent.click(screen.getByRole("button", { name: /Reply/ }));
  fireEvent.change(screen.getByLabelText("Write a reply"), {
    target: { value: newReply.body },
  });
  fireEvent.click(screen.getByRole("button", { name: "Post" }));

  await waitFor(() => {
    expect(screen.getByRole("status").textContent).toBe("Delivery uncertain.");
  });
  expect(
    within(screen.getByRole("list", { name: "Topic messages" })).getByText(newReply.body),
  ).toBeDefined();
  expect(screen.getByRole("button", { name: "Retry" })).toBeDefined();
  expect(screen.queryByText("Cove could not add this reply. Refresh and try again.")).toBeNull();
});

test("keeps the current scroll position when a reply arrives without a local post", () => {
  const { rerender } = render(topicMessages([openingMessage]));

  rerender(topicMessages([openingMessage, newReply]));

  expect(scrollIntoView).not.toHaveBeenCalled();
});

test("states how many older Replies remain and loads them deliberately", () => {
  const onLoadOlderReplies = vi.fn();
  const { rerender } = render(
    topicMessages([openingMessage, unrelatedReply], {
      hasError: false,
      isLoading: false,
      load: onLoadOlderReplies,
      remainingCount: 800,
    }),
  );

  expect(screen.getByText("800 older Replies remain.")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Load older Replies" }));
  expect(onLoadOlderReplies).toHaveBeenCalledOnce();

  rerender(
    topicMessages([openingMessage, unrelatedReply], {
      hasError: false,
      isLoading: true,
      load: onLoadOlderReplies,
      remainingCount: 800,
    }),
  );
  expect(
    screen.getByRole("button", { name: "Loading older Replies…" }).hasAttribute("disabled"),
  ).toBe(true);

  rerender(
    topicMessages([openingMessage, unrelatedReply], {
      hasError: true,
      isLoading: false,
      load: onLoadOlderReplies,
      remainingCount: 1,
    }),
  );
  expect(screen.getByText("1 older Reply remains.")).toBeDefined();
  expect(screen.getByRole("alert").textContent).toBe(
    "Cove could not load older Replies. Try again.",
  );

  rerender(
    topicMessages([openingMessage, unrelatedReply], {
      hasError: false,
      isLoading: false,
      load: onLoadOlderReplies,
      remainingCount: 0,
    }),
  );
  expect(screen.queryByRole("button", { name: "Load older Replies" })).toBeNull();
});
