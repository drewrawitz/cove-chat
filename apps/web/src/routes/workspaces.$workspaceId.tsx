import { Outlet, createFileRoute } from "@tanstack/react-router";
import { type ReactElement } from "react";
import { useAuthMe } from "../api/generated/cove-app.ts";
import { PageMessage } from "../components/page-message.tsx";
import { SignIn } from "../components/sign-in.tsx";

export const Route = createFileRoute("/workspaces/$workspaceId")({
  component: WorkspaceRoute,
});

function WorkspaceRoute(): ReactElement {
  const account = useAuthMe({ query: { retry: false, retryOnMount: false } });

  if (account.isPending) return <PageMessage message="Opening Cove…" />;
  if (account.isError && account.error.status === 401) return <SignIn />;
  if (account.isError) return <PageMessage message="Cove could not load your account." />;

  return <Outlet />;
}
