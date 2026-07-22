import { renderToStaticMarkup } from "react-dom/server";
import type { PropsWithChildren, ReactElement } from "react";
import { expect, test, vi } from "vite-plus/test";

const routeHarness = vi.hoisted(() => ({
  component: undefined as (() => ReactElement) | undefined,
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: { readonly component: () => ReactElement }) => {
    routeHarness.component = options.component;
    return {
      useParams: () => ({ workspaceId: "workspace-1", channelId: "channel-1" }),
    };
  },
  Link: ({ children }: PropsWithChildren) => <>{children}</>,
  Outlet: () => <p>Rendered Topic detail route</p>,
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@cove/ui/components/button", () => ({
  Button: ({ children }: PropsWithChildren) => <button type="button">{children}</button>,
}));

vi.mock("../api/generated/cove-app.ts", () => ({
  getChannelsGetChannelQueryKey: vi.fn(),
  getChannelsListPublicChannelsQueryKey: vi.fn(),
  useAuthMe: () => ({
    isPending: false,
    isError: false,
    data: { displayName: "Drew", email: "drew@example.com" },
  }),
  useChannelsGetChannel: () => ({
    isPending: false,
    isError: false,
    data: {
      name: "general",
      visibility: "public",
      purpose: "General discussion",
      hasChannelMembership: true,
      maintainer: { id: "identity-1", name: "Drew", avatarUrl: "https://example.com/avatar" },
    },
  }),
  useChannelsJoinPublicChannel: () => ({
    isPending: false,
    isSuccess: false,
    isError: false,
    mutate: vi.fn(),
  }),
  useTopicsListTopics: () => ({
    isPending: false,
    isError: false,
    data: { topics: [] },
  }),
  useWorkspacesGetWorkspace: () => ({
    isPending: false,
    isError: false,
    data: {
      workspace: { name: "Cove" },
      membership: { role: "member" },
      identity: { id: "identity-1", name: "Drew" },
      generalChannelId: "channel-1",
    },
  }),
}));

vi.mock("../components/channel-loading.tsx", () => ({ ChannelLoading: () => null }));
vi.mock("../components/channel-membership.tsx", () => ({ ChannelMembership: () => null }));
vi.mock("../components/conversation-shell.tsx", () => ({
  ConversationShell: ({ children }: PropsWithChildren) => <>{children}</>,
}));
vi.mock("../components/create-topic.tsx", () => ({ CreateTopic: () => null }));
vi.mock("../components/leave-channel.tsx", () => ({ LeaveChannel: () => null }));
vi.mock("../components/page-message.tsx", () => ({ PageMessage: () => null }));

test("renders the matched Topic route instead of leaving the Channel list on screen", async () => {
  await import("./workspaces.$workspaceId.channels.$channelId.tsx");

  const ChannelRoute = routeHarness.component;
  if (ChannelRoute === undefined) {
    throw new Error("Channel route component was not registered");
  }

  const markup = renderToStaticMarkup(<ChannelRoute />);
  expect(markup).toContain("Rendered Topic detail route");
});
