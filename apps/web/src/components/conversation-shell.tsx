import type { ReactNode, ReactElement } from "react";
import { ChannelSidebar } from "./channel-sidebar.tsx";
import { WorkspaceSwitcher } from "./workspace-switcher.tsx";

interface ConversationShellProps {
  readonly accountDisplayName: string;
  readonly accountEmail: string;
  readonly activeChannelId: string;
  readonly busy: boolean;
  readonly children: ReactNode;
  readonly identityName: string;
  readonly workspaceId: string;
  readonly workspaceName: string;
}

export function ConversationShell({
  accountDisplayName,
  accountEmail,
  activeChannelId,
  busy,
  children,
  identityName,
  workspaceId,
  workspaceName,
}: ConversationShellProps): ReactElement {
  return (
    <main className="dark min-h-svh bg-background text-foreground [--conversation-sidebar-width:18rem]">
      <div className="min-h-svh w-full lg:grid lg:grid-cols-[var(--conversation-sidebar-width)_minmax(0,1fr)]">
        <aside className="border-b border-sidebar-border bg-sidebar text-sidebar-foreground lg:sticky lg:top-0 lg:h-svh lg:overflow-y-auto lg:border-r lg:border-b-0">
          <div className="p-4 lg:p-5">
            <header>
              <WorkspaceSwitcher
                accountDisplayName={accountDisplayName}
                accountEmail={accountEmail}
                activeChannelId={activeChannelId}
                identityName={identityName}
                workspaceId={workspaceId}
                workspaceName={workspaceName}
              />
            </header>

            <ChannelSidebar activeChannelId={activeChannelId} workspaceId={workspaceId} />
          </div>
        </aside>

        <section className="min-w-0 bg-background" aria-busy={busy}>
          {children}
        </section>
      </div>
    </main>
  );
}
