/** @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import {
  useAccountConversationRuntime,
  useAccountConversationSnapshot,
} from "../../account-conversation-state-context.tsx";
import { COVE_INVALID_SESSION_EVENT, CoveApiError } from "../../api/cove-fetch.ts";
import { CoveSyncProvider } from "./cove-sync-provider.tsx";

const zeroHarness = vi.hoisted(() => ({
  account: {
    data: { id: "account-1" } as { readonly id: string } | undefined,
    error: undefined as unknown,
    isError: false,
    isPending: false,
  },
  connection: { name: "connected" } as
    | { readonly name: "connected" }
    | { readonly name: "error"; readonly reason: string }
    | { readonly name: "needs-auth" },
  onClientStateNotFound: undefined as (() => void) | undefined,
  delete: vi.fn(async () => ({ errors: [] as ReadonlyArray<Error> })),
  navigate: vi.fn(async () => undefined),
}));

vi.mock("@rocicorp/zero/react", async () => {
  const { useEffect: useReactEffect } = await import("react");
  return {
    useConnectionState: () => zeroHarness.connection,
    ZeroProvider: ({
      children,
      init,
      onClientStateNotFound,
    }: {
      readonly children: ReactNode;
      readonly init?: (zero: { readonly delete: typeof zeroHarness.delete }) => void;
      readonly onClientStateNotFound?: () => void;
    }) => {
      useReactEffect(() => {
        zeroHarness.onClientStateNotFound = onClientStateNotFound;
        init?.({ delete: zeroHarness.delete });
      }, [init, onClientStateNotFound]);
      return children;
    },
  };
});

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => zeroHarness.navigate,
}));

vi.mock("../../api/generated/cove-app.ts", () => ({
  useAuthMe: () => zeroHarness.account,
}));

const scope = {
  workspaceId: "workspace-1",
  channelId: "channel-1",
  topicId: "topic-1",
};

function PersistedWork(): ReactElement {
  const { state } = useAccountConversationRuntime();
  const snapshot = useAccountConversationSnapshot();

  useEffect(() => {
    state.writeDraft(scope, "Unsent private work");
    state.startCommand(scope, {
      kind: "create",
      commandId: "command-1",
      body: "Unresolved private work",
      author: {
        id: "identity-1",
        name: "Alice in Cove",
        avatarUrl: "/avatars/alice.svg",
      },
      createdAt: "2026-07-25T12:00:00.000Z",
    });
  }, [state]);

  return <output>{`${snapshot.drafts.length}:${snapshot.commands.length}`}</output>;
}

const renderProvider = (queryClient = new QueryClient()) =>
  render(
    <QueryClientProvider client={queryClient}>
      <CoveSyncProvider>
        <PersistedWork />
      </CoveSyncProvider>
    </QueryClientProvider>,
  );
const rerenderProvider = (
  view: ReturnType<typeof renderProvider>,
  queryClient = new QueryClient(),
): void => {
  view.rerender(
    <QueryClientProvider client={queryClient}>
      <CoveSyncProvider>
        <PersistedWork />
      </CoveSyncProvider>
    </QueryClientProvider>,
  );
};
const reportClientStateNotFound = (): void => {
  if (zeroHarness.onClientStateNotFound === undefined) {
    throw new Error("ZeroProvider did not register onClientStateNotFound.");
  }
  act(() => zeroHarness.onClientStateNotFound?.());
};

beforeEach(() => {
  window.localStorage.clear();
  zeroHarness.account = {
    data: { id: "account-1" },
    error: undefined,
    isError: false,
    isPending: false,
  };
  zeroHarness.connection = { name: "connected" };
  zeroHarness.delete.mockReset();
  zeroHarness.delete.mockResolvedValue({ errors: [] });
  zeroHarness.navigate.mockClear();
  zeroHarness.onClientStateNotFound = undefined;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test("automatically rebuilds Zero once, then stops and offers manual recovery", async () => {
  renderProvider();
  await screen.findByText("1:1");

  reportClientStateNotFound();
  await waitFor(() => expect(zeroHarness.delete).toHaveBeenCalledOnce());
  reportClientStateNotFound();
  expect(await screen.findByText("1:1")).toBeDefined();
  expect(await screen.findByRole("button", { name: "Reset synchronized cache" })).toBeDefined();
  expect(zeroHarness.delete).toHaveBeenCalledOnce();

  fireEvent.click(screen.getByRole("button", { name: "Reset synchronized cache" }));
  await waitFor(() => expect(zeroHarness.delete).toHaveBeenCalledTimes(2));
  expect(screen.getByText("1:1")).toBeDefined();
});

test("manual recovery retries a Zero cache deletion that reported errors", async () => {
  zeroHarness.delete
    .mockResolvedValueOnce({ errors: [new Error("Database deletion blocked")] })
    .mockResolvedValueOnce({ errors: [] });
  renderProvider();
  await screen.findByText("1:1");

  reportClientStateNotFound();
  const manualRepair = await screen.findByRole("button", {
    name: "Reset synchronized cache",
  });
  expect(zeroHarness.delete).toHaveBeenCalledOnce();

  fireEvent.click(manualRepair);

  await waitFor(() => expect(zeroHarness.delete).toHaveBeenCalledTimes(2));
  expect(screen.getByText("1:1")).toBeDefined();
});

test("does not rebuild Zero from generic connection error text", async () => {
  zeroHarness.connection = {
    name: "error",
    reason: "IndexedDB quota database network failure",
  };
  renderProvider();

  await screen.findByText("1:1");
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  expect(zeroHarness.delete).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Reset synchronized cache" })).toBeNull();
});

test("clears Account state and navigates when Zero needs authentication", async () => {
  const view = renderProvider();
  await screen.findByText("1:1");
  zeroHarness.connection = { name: "needs-auth" };

  rerenderProvider(view);

  await screen.findByText("Removing this Account’s conversation data…");
  await waitFor(() => expect(zeroHarness.delete).toHaveBeenCalledOnce());
  expect(zeroHarness.navigate).toHaveBeenCalledWith({ to: "/", replace: true });
  expect(
    Object.keys(window.localStorage).filter((key) => key.startsWith("cove:account-conversation:")),
  ).toEqual([]);
});

test("waits for initial authentication instead of mounting anonymous Zero", async () => {
  zeroHarness.account = {
    data: undefined,
    error: undefined,
    isError: false,
    isPending: true,
  };
  const view = renderProvider();

  expect(screen.getByText("Opening Cove…")).toBeDefined();
  expect(screen.queryByText("1:1")).toBeNull();

  zeroHarness.account = {
    data: { id: "account-1" },
    error: undefined,
    isError: false,
    isPending: false,
  };
  rerenderProvider(view);

  expect(await screen.findByText("1:1")).toBeDefined();
});

test("invalid-session discovery clears the Account cache, journal, drafts, and HTTP cache", async () => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(["private-channel"], { secret: true });
  renderProvider(queryClient);
  await screen.findByText("1:1");

  window.dispatchEvent(new Event(COVE_INVALID_SESSION_EVENT));

  await screen.findByText("Removing this Account’s conversation data…");
  await waitFor(() => expect(zeroHarness.delete).toHaveBeenCalledOnce());
  expect(queryClient.getQueryCache().getAll()).toEqual([]);
  expect(
    Object.keys(window.localStorage).filter((key) => key.startsWith("cove:account-conversation:")),
  ).toEqual([]);
  expect(zeroHarness.navigate).toHaveBeenCalledWith({ to: "/", replace: true });
});

test("does not finish invalid-session cleanup until every Zero database is erased", async () => {
  zeroHarness.delete
    .mockResolvedValueOnce({ errors: [new Error("IndexedDB remained open")] })
    .mockResolvedValueOnce({ errors: [] });
  renderProvider();
  await screen.findByText("1:1");

  window.dispatchEvent(new Event(COVE_INVALID_SESSION_EVENT));

  const retry = await screen.findByRole("button", {
    name: "Retry removing conversation data",
  });
  expect(zeroHarness.navigate).not.toHaveBeenCalled();

  fireEvent.click(retry);

  await waitFor(() => expect(zeroHarness.delete).toHaveBeenCalledTimes(2));
  expect(zeroHarness.navigate).toHaveBeenCalledWith({ to: "/", replace: true });
});

test("does not finish Account cleanup until local erasure succeeds", async () => {
  renderProvider();
  await screen.findByText("1:1");
  const removeItem = vi.spyOn(Storage.prototype, "removeItem").mockImplementationOnce(() => {
    throw new DOMException("Storage unavailable");
  });

  window.dispatchEvent(new Event(COVE_INVALID_SESSION_EVENT));

  const retry = await screen.findByRole("button", {
    name: "Retry removing conversation data",
  });
  expect(zeroHarness.delete).not.toHaveBeenCalled();
  expect(zeroHarness.navigate).not.toHaveBeenCalled();

  removeItem.mockRestore();
  fireEvent.click(retry);

  await waitFor(() => expect(zeroHarness.delete).toHaveBeenCalledOnce());
  expect(zeroHarness.navigate).toHaveBeenCalledWith({ to: "/", replace: true });
});

test("clears the last active Account when an invalid session is discovered on browser load", async () => {
  const activeSession = renderProvider();
  await screen.findByText("1:1");
  activeSession.unmount();
  zeroHarness.delete.mockClear();
  zeroHarness.account = {
    data: undefined,
    error: new CoveApiError(401, {
      code: "UNAUTHENTICATED",
      message: "Authentication is required.",
    }),
    isError: true,
    isPending: false,
  };

  render(
    <QueryClientProvider client={new QueryClient()}>
      <CoveSyncProvider>
        <p>Signed out</p>
      </CoveSyncProvider>
    </QueryClientProvider>,
  );

  await waitFor(() => expect(zeroHarness.delete).toHaveBeenCalledOnce());
  expect(
    Object.keys(window.localStorage).filter((key) => key.startsWith("cove:account-conversation:")),
  ).toEqual([]);
  expect(await screen.findByText("Signed out")).toBeDefined();
});
