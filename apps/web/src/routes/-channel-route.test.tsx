import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
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
  Outlet: () => <p>Rendered Topic detail route</p>,
}));

test("renders the matched Topic route instead of leaving the Channel list on screen", async () => {
  await import("./workspaces.$workspaceId.channels.$channelId.tsx");

  const ChannelRoute = routeHarness.component;
  if (ChannelRoute === undefined) {
    throw new Error("Channel route component was not registered");
  }

  const markup = renderToStaticMarkup(<ChannelRoute />);
  expect(markup).toContain("Rendered Topic detail route");
});
