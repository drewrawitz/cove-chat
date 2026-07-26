/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { CoveApiError } from "./api/cove-fetch.ts";
import { usePrivateChannelRouteAccess } from "./use-private-channel-route-access.ts";

const harness = vi.hoisted(() => {
  const clearChannelDrafts = vi.fn();
  return {
    clearChannelDrafts,
    conversationState: { clearChannelDrafts },
    navigate: vi.fn(async () => undefined),
    refetch: vi.fn(async () => undefined),
    removeQueries: vi.fn(),
  };
});

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ removeQueries: harness.removeQueries }),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => harness.navigate,
}));

vi.mock("./account-conversation-state-context.tsx", () => ({
  useAccountConversationRuntime: () => ({
    state: harness.conversationState,
  }),
}));

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

function AccessProbe({ error }: { readonly error: unknown }) {
  const access = usePrivateChannelRouteAccess({
    channel: {
      data: { visibility: "public" },
      error,
      isFetching: false,
      isPending: false,
      refetch: harness.refetch,
    },
    channelId: "channel-1",
    workspace: {
      data: { generalChannelId: "general-1" },
      error: undefined,
      isFetching: false,
      isPending: false,
      refetch: harness.refetch,
    },
    workspaceId: "workspace-1",
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
  harness.clearChannelDrafts.mockReset();
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
  harness.clearChannelDrafts.mockImplementation(() => {
    throw new DOMException("Storage unavailable");
  });
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

  harness.clearChannelDrafts.mockImplementation(() => undefined);
  fireEvent.click(screen.getByRole("button", { name: "Retry cleanup" }));

  await waitFor(() => expect(harness.navigate).toHaveBeenCalled());
  expect(harness.navigate).toHaveBeenCalled();
});
