/** @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { type ReactElement } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { createAccountConversationState } from "./account-conversation-state.ts";
import type { AuthoritativeChannelAccess } from "./private-channel-access.ts";
import { usePrivateChannelAccess } from "./use-private-channel-access.ts";

const zeroHarness = vi.hoisted(() => ({
  channel: {
    id: "channel-1",
    visibility: "private",
  } as { readonly id: string; readonly visibility: "private" } | undefined,
  connection: { name: "connected" },
  query: undefined as unknown,
  result: { type: "complete" },
}));

vi.mock("@rocicorp/zero/react", () => ({
  useConnectionState: () => zeroHarness.connection,
  useQuery: (query: unknown) => {
    zeroHarness.query = query;
    return [zeroHarness.channel, zeroHarness.result];
  },
}));

function AccessView({
  authoritativeAccess,
  onRevoked,
  refreshAuthoritativeAccess,
  visibility = "private",
}: {
  readonly authoritativeAccess: AuthoritativeChannelAccess;
  readonly onRevoked: () => void;
  readonly refreshAuthoritativeAccess: () => Promise<unknown>;
  readonly visibility?: "private" | "public";
}): ReactElement {
  const state = usePrivateChannelAccess({
    authoritativeAccess,
    channelId: "channel-1",
    onRevoked,
    refreshAuthoritativeAccess,
    visibility,
    workspaceId: "workspace-1",
  });
  return <output>{state}</output>;
}

beforeEach(() => {
  window.localStorage.clear();
  zeroHarness.channel = { id: "channel-1", visibility: "private" };
  zeroHarness.connection = { name: "connected" };
  zeroHarness.query = undefined;
  zeroHarness.result = { type: "complete" };
});

afterEach(cleanup);

test("keeps a Private Channel hidden until its initial access reads complete", () => {
  zeroHarness.result = { type: "unknown" };
  const view = render(
    <AccessView
      authoritativeAccess="available"
      onRevoked={() => undefined}
      refreshAuthoritativeAccess={async () => undefined}
    />,
  );

  expect(screen.getByText("checking")).toBeDefined();

  zeroHarness.result = { type: "complete" };
  view.rerender(
    <AccessView
      authoritativeAccess="available"
      onRevoked={() => undefined}
      refreshAuthoritativeAccess={async () => undefined}
    />,
  );
  expect(screen.getByText("available")).toBeDefined();
});

test("does not subscribe to synchronized membership for a Public Channel", () => {
  render(
    <AccessView
      authoritativeAccess="available"
      onRevoked={() => undefined}
      refreshAuthoritativeAccess={async () => undefined}
      visibility="public"
    />,
  );

  expect(zeroHarness.query).toBeUndefined();
  expect(screen.getByText("available")).toBeDefined();
});

test("stays hidden during fresh HTTP authorization after reconnect", async () => {
  zeroHarness.connection = { name: "disconnected" };
  let finishRefresh = (): void => undefined;
  const refresh = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finishRefresh = resolve;
      }),
  );
  const onRevoked = vi.fn();
  const view = render(
    <AccessView
      authoritativeAccess="available"
      onRevoked={onRevoked}
      refreshAuthoritativeAccess={refresh}
    />,
  );
  expect(screen.getByText("offline")).toBeDefined();

  zeroHarness.connection = { name: "connected" };
  view.rerender(
    <AccessView
      authoritativeAccess="available"
      onRevoked={onRevoked}
      refreshAuthoritativeAccess={refresh}
    />,
  );

  expect(screen.getByText("checking")).toBeDefined();
  expect(refresh).toHaveBeenCalledOnce();
  finishRefresh();
  await waitFor(() => expect(screen.getByText("available")).toBeDefined());
});

test("reports synchronized revocation and lets the route clear every Channel draft", async () => {
  const state = createAccountConversationState({
    accountId: "account-1",
    storage: window.localStorage,
    createBroadcastChannel: () => ({
      addEventListener: () => undefined,
      close: () => undefined,
      postMessage: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
  state.writeDraft(
    { workspaceId: "workspace-1", channelId: "channel-1", topicId: "topic-1" },
    "Sensitive draft",
  );
  zeroHarness.channel = undefined;
  const onRevoked = (): void => state.clearChannelDrafts("workspace-1", "channel-1");

  render(
    <AccessView
      authoritativeAccess="available"
      onRevoked={onRevoked}
      refreshAuthoritativeAccess={async () => undefined}
    />,
  );

  expect(screen.getByText("revoked")).toBeDefined();
  await waitFor(() =>
    expect(
      state.readDraft({
        workspaceId: "workspace-1",
        channelId: "channel-1",
        topicId: "topic-1",
      }),
    ).toBe(""),
  );
  state.destroy();
});
