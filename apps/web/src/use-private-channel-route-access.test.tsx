/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { CoveApiError } from "./api/cove-fetch.ts";
import { usePrivateChannelRouteAccess } from "./use-private-channel-route-access.ts";

const harness = vi.hoisted(() => {
  const clearChannelDrafts = vi.fn();
  const listeners = new Set<() => void>();
  let snapshot: { readonly storageHealth: "healthy" | "recovered" | "unavailable" } = {
    storageHealth: "healthy",
  };
  return {
    clearChannelDrafts,
    cleanupShouldFail: false,
    conversationState: { clearChannelDrafts },
    getSnapshot: () => snapshot,
    navigate: vi.fn(async () => undefined),
    refetch: vi.fn(async () => undefined),
    removeQueries: vi.fn(),
    setStorageHealth: (storageHealth: "healthy" | "recovered" | "unavailable") => {
      snapshot = { storageHealth };
      for (const listener of listeners) listener();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
});

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ removeQueries: harness.removeQueries }),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => harness.navigate,
}));

vi.mock("./account-conversation-state-context.tsx", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useAccountConversationRuntime: () => ({
      state: harness.conversationState,
    }),
    useAccountConversationSnapshot: () =>
      useSyncExternalStore(harness.subscribe, harness.getSnapshot, harness.getSnapshot),
  };
});

vi.mock("./api/generated/cove-app.ts", () => ({
  getChannelsGetChannelQueryKey: (workspaceId: string, channelId: string) => [
    "channel",
    workspaceId,
    channelId,
  ],
}));

vi.mock("./use-private-channel-access.ts", () => ({
  usePrivateChannelAccess: () => "available",
}));

function AccessProbe({
  channelId = "channel-1",
  error,
  workspaceId = "workspace-1",
}: {
  readonly channelId?: string;
  readonly error: unknown;
  readonly workspaceId?: string;
}) {
  const access = usePrivateChannelRouteAccess({
    channel: {
      data: { visibility: "public" },
      error,
      isFetching: false,
      isPending: false,
      refetch: harness.refetch,
    },
    channelId,
    workspace: {
      data: { generalChannelId: "general-1" },
      error: undefined,
      isFetching: false,
      isPending: false,
      refetch: harness.refetch,
    },
    workspaceId,
  });

  return (
    <>
      <output>{access.state}</output>
      <button type="button" onClick={access.retryCleanup}>
        Retry cleanup
      </button>
    </>
  );
}

beforeEach(() => {
  harness.cleanupShouldFail = false;
  harness.setStorageHealth("healthy");
  harness.clearChannelDrafts.mockReset().mockImplementation(() => {
    if (harness.cleanupShouldFail) {
      harness.setStorageHealth("unavailable");
      throw new DOMException("Storage unavailable");
    }
    if (harness.getSnapshot().storageHealth === "unavailable") {
      harness.setStorageHealth("recovered");
    }
  });
  harness.navigate.mockClear();
  harness.refetch.mockClear();
  harness.removeQueries.mockClear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test("clears Channel drafts immediately after confirmed public HTTP access loss", async () => {
  render(
    <AccessProbe
      error={
        new CoveApiError(404, {
          code: "CHANNEL_UNAVAILABLE",
          message: "Channel is unavailable.",
        })
      }
    />,
  );

  await waitFor(() =>
    expect(harness.clearChannelDrafts).toHaveBeenCalledWith("workspace-1", "channel-1"),
  );
  expect(harness.navigate).toHaveBeenCalledWith({
    to: "/workspaces/$workspaceId/channels/$channelId",
    params: { workspaceId: "workspace-1", channelId: "general-1" },
    replace: true,
  });
});

test("surfaces and retries a failed authoritative-revocation draft cleanup", async () => {
  harness.cleanupShouldFail = true;
  render(
    <AccessProbe
      error={
        new CoveApiError(403, {
          code: "CHANNEL_UNAVAILABLE",
          message: "Channel is unavailable.",
        })
      }
    />,
  );

  expect(await screen.findByText("cleanup-required")).toBeDefined();
  expect(harness.navigate).not.toHaveBeenCalled();

  harness.cleanupShouldFail = false;
  fireEvent.click(screen.getByRole("button", { name: "Retry cleanup" }));

  await waitFor(() => expect(harness.navigate).toHaveBeenCalled());
  expect(harness.navigate).toHaveBeenCalled();
});

test("does not carry a draft-cleanup failure into another Channel", async () => {
  harness.cleanupShouldFail = true;
  const unavailable = new CoveApiError(403, {
    code: "CHANNEL_UNAVAILABLE",
    message: "Channel is unavailable.",
  });
  const view = render(<AccessProbe error={unavailable} />);
  expect(await screen.findByText("cleanup-required")).toBeDefined();

  view.rerender(<AccessProbe channelId="channel-2" error={undefined} />);

  expect(await screen.findByText("available")).toBeDefined();
});
