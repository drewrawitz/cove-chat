import { Button } from "@cove/ui/components/button";
import { useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { type ReactElement } from "react";
import {
  getChannelsGetPublicChannelQueryKey,
  getChannelsListPublicChannelsQueryKey,
  useChannelsGetPublicChannel,
  useChannelsJoinPublicChannel,
  useWorkspacesGetWorkspace,
} from "../api/generated/cove-app.ts";
import { channelDisplayName } from "../channel-display-name.ts";
import { ChannelSidebar } from "../components/channel-sidebar.tsx";
import { PageMessage } from "../components/page-message.tsx";

export const Route = createFileRoute("/workspaces/$workspaceId/channels/$channelId")({
  component: PublicChannel,
});

function PublicChannel(): ReactElement {
  const { workspaceId, channelId } = Route.useParams();
  const queryClient = useQueryClient();
  const workspace = useWorkspacesGetWorkspace(workspaceId, { query: { retry: false } });
  const channel = useChannelsGetPublicChannel(workspaceId, channelId, {
    query: { retry: false },
  });
  const joinChannel = useChannelsJoinPublicChannel();

  if (workspace.isPending || channel.isPending) {
    return <PageMessage message="Opening channel…" />;
  }
  if (workspace.isError || channel.isError) {
    return (
      <PageMessage message="This channel is not available in this workspace.">
        <Link
          className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
          to="/workspaces/$workspaceId"
          params={{ workspaceId }}
        >
          Return to workspace management
        </Link>
      </PageMessage>
    );
  }

  const displayName = channelDisplayName(channel.data.name);

  const join = (): void => {
    joinChannel.mutate(
      { workspaceId, channelId },
      {
        onSuccess: async () => {
          await Promise.all([
            queryClient.invalidateQueries({
              queryKey: getChannelsGetPublicChannelQueryKey(workspaceId, channelId),
            }),
            queryClient.invalidateQueries({
              queryKey: getChannelsListPublicChannelsQueryKey(workspaceId),
            }),
          ]);
        },
      },
    );
  };

  return (
    <main className="dark min-h-svh bg-background text-foreground">
      <div className="min-h-svh w-full lg:grid lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="border-b border-sidebar-border bg-sidebar text-sidebar-foreground lg:sticky lg:top-0 lg:h-svh lg:overflow-y-auto lg:border-r lg:border-b-0">
          <div className="p-4 lg:p-5">
            <header>
              <div className="flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary font-heading text-base font-semibold text-primary-foreground">
                  {workspace.data.workspace.name.slice(0, 1).toLocaleUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <h1 className="truncate text-base font-semibold">
                    {workspace.data.workspace.name}
                  </h1>
                  <p className="truncate text-xs text-muted-foreground">
                    {workspace.data.identity.name}
                  </p>
                </div>
              </div>

              <nav className="mt-7 grid gap-1" aria-label="Workspace navigation">
                <Link
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-sidebar-accent focus-visible:ring-3 focus-visible:ring-sidebar-ring/50 focus-visible:outline-none"
                  to="/"
                >
                  <span className="text-muted-foreground" aria-hidden="true">
                    ←
                  </span>
                  All workspaces
                </Link>
                <Link
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-sidebar-accent focus-visible:ring-3 focus-visible:ring-sidebar-ring/50 focus-visible:outline-none"
                  to="/workspaces/$workspaceId"
                  params={{ workspaceId }}
                >
                  <span className="text-muted-foreground" aria-hidden="true">
                    ⚙
                  </span>
                  Workspace settings
                </Link>
              </nav>
            </header>

            <ChannelSidebar activeChannelId={channelId} workspaceId={workspaceId} />
          </div>
        </aside>

        <section className="min-w-0 bg-background">
          <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14 lg:px-12 lg:pt-24 xl:px-16">
            <header className="flex flex-wrap items-start justify-between gap-6 pb-10">
              <div className="min-w-0 flex-1">
                <h2 className="text-4xl font-semibold tracking-tight sm:text-5xl">{displayName}</h2>
                <p className="mt-3 max-w-3xl text-base text-muted-foreground sm:text-lg">
                  Public <span aria-hidden="true">·</span> {channel.data.purpose}
                </p>
                <p className="mt-3 text-sm text-muted-foreground">
                  Maintained by {channel.data.maintainer.name}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <img
                  className="size-10 rounded-full border border-border bg-muted object-cover"
                  src={channel.data.maintainer.avatarUrl}
                  alt=""
                />
                {channel.data.hasChannelMembership ? (
                  <span className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm font-medium text-muted-foreground">
                    Joined
                  </span>
                ) : (
                  <Button type="button" size="lg" disabled={joinChannel.isPending} onClick={join}>
                    {joinChannel.isPending ? "Joining…" : "Join channel"}
                  </Button>
                )}
              </div>
            </header>

            {joinChannel.isSuccess ? (
              <p className="-mt-6 mb-6 text-sm text-muted-foreground" role="status">
                You joined {displayName}.
              </p>
            ) : null}
            {joinChannel.isError ? (
              <p className="-mt-6 mb-6 text-sm text-destructive" role="alert">
                Cove could not join this channel. Refresh and try again.
              </p>
            ) : null}

            <section aria-labelledby="topics-heading">
              <div className="flex items-baseline justify-between gap-4 border-b pb-4">
                <h3 id="topics-heading" className="text-lg font-semibold">
                  Topics
                </h3>
                <span className="text-sm text-muted-foreground">0 open</span>
              </div>

              <div className="flex min-h-72 flex-col items-center justify-center border-b px-6 py-16 text-center">
                <span
                  className="flex size-12 items-center justify-center rounded-full border border-border bg-muted/30 text-xl text-muted-foreground"
                  aria-hidden="true"
                >
                  ◌
                </span>
                <h4 className="mt-5 text-lg font-semibold">No topics yet</h4>
                <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                  Conversations in Cove begin with a named Topic and an Opening Brief. Topic
                  creation arrives in the next conversation slice.
                </p>
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
