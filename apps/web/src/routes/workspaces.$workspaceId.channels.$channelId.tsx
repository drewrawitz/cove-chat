import { Outlet, createFileRoute } from "@tanstack/react-router";
import type { ReactElement } from "react";

export const Route = createFileRoute("/workspaces/$workspaceId/channels/$channelId")({
  component: ChannelRoute,
});

function ChannelRoute(): ReactElement {
  return <Outlet />;
}
