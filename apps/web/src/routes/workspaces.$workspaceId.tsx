import { Outlet, createFileRoute } from "@tanstack/react-router";
import { type ReactElement } from "react";

export const Route = createFileRoute("/workspaces/$workspaceId")({
  component: WorkspaceRoute,
});

function WorkspaceRoute(): ReactElement {
  return <Outlet />;
}
