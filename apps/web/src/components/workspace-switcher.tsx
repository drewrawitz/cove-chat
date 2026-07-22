import { Link } from "@tanstack/react-router";
import { type ReactElement, useRef } from "react";
import { useWorkspacesListWorkspaces } from "../api/generated/cove-app.ts";
import { roleLabel } from "../form-data.ts";
import { AccountSignOut } from "./account-sign-out.tsx";

interface WorkspaceSwitcherProps {
  readonly accountDisplayName: string;
  readonly accountEmail: string;
  readonly activeChannelId: string;
  readonly identityName: string;
  readonly workspaceId: string;
  readonly workspaceName: string;
}

export function WorkspaceSwitcher({
  accountDisplayName,
  accountEmail,
  activeChannelId,
  identityName,
  workspaceId,
  workspaceName,
}: WorkspaceSwitcherProps): ReactElement {
  const menu = useRef<HTMLDetailsElement>(null);
  const workspaces = useWorkspacesListWorkspaces({ query: { retry: false } });
  const closeMenu = (): void => menu.current?.removeAttribute("open");

  return (
    <details className="group relative" ref={menu}>
      <summary
        aria-label={`Switch workspace, currently ${workspaceName}`}
        className="flex cursor-pointer list-none items-center gap-3 rounded-lg p-1 outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-3 focus-visible:ring-sidebar-ring/50 [&::-webkit-details-marker]:hidden"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary font-heading text-base font-semibold text-primary-foreground">
          {workspaceName.slice(0, 1).toLocaleUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-left text-base font-semibold">{workspaceName}</span>
          <span className="block truncate text-left text-xs text-muted-foreground">
            {identityName}
          </span>
        </span>
        <span
          className="mr-1 text-sm text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden="true"
        >
          ⌄
        </span>
      </summary>

      <div className="absolute top-[calc(100%+0.5rem)] right-0 left-0 z-30 overflow-hidden rounded-xl border border-sidebar-border bg-popover text-popover-foreground shadow-2xl">
        <p className="px-3 pt-3 pb-2 text-xs font-semibold text-muted-foreground">Workspaces</p>
        {workspaces.isPending ? (
          <p className="px-3 py-3 text-sm text-muted-foreground" role="status">
            Loading workspaces…
          </p>
        ) : workspaces.isError ? (
          <p className="px-3 py-3 text-sm text-destructive" role="alert">
            Workspaces are unavailable.
          </p>
        ) : (
          <ul className="grid gap-0.5 px-1.5 pb-2">
            {workspaces.data.workspaces.map((item) => (
              <li key={item.id}>
                <Link
                  to="/workspaces/$workspaceId/channels/$channelId"
                  params={{
                    workspaceId: item.id,
                    channelId: item.id === workspaceId ? activeChannelId : item.generalChannelId,
                  }}
                  aria-label={`Switch to ${item.name}`}
                  aria-current={item.id === workspaceId ? "page" : undefined}
                  className="flex items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none aria-[current=page]:bg-muted"
                  onClick={closeMenu}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-xs font-semibold text-primary">
                    {item.name.slice(0, 1).toLocaleUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{item.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {item.identity.name} · {roleLabel(item.membership.role)}
                    </span>
                  </span>
                  {item.id === workspaceId ? (
                    <span className="text-primary" aria-hidden="true">
                      ✓
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-0.5 border-t border-border p-1.5">
          <Link
            className="rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            to="/workspaces/$workspaceId"
            params={{ workspaceId }}
            onClick={closeMenu}
          >
            Workspace settings
          </Link>
          <Link
            className="rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            to="/"
            onClick={closeMenu}
          >
            All workspaces
          </Link>
        </div>
        <AccountSignOut displayName={accountDisplayName} email={accountEmail} variant="menu" />
      </div>
    </details>
  );
}
