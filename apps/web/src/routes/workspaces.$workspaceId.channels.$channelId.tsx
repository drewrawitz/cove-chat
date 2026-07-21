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
    <main className="min-h-svh bg-muted/30 p-3 sm:p-5">
      <div className="mx-auto grid min-h-[calc(100svh-1.5rem)] w-full max-w-[96rem] overflow-hidden rounded-3xl border bg-card shadow-sm sm:min-h-[calc(100svh-2.5rem)] lg:grid-cols-[19rem_minmax(0,1fr)]">
        <aside className="border-b bg-muted/20 p-4 lg:border-r lg:border-b-0 lg:p-5">
          <header className="border-b pb-5">
            <div className="flex items-center justify-between gap-3">
              <Link
                className="font-heading text-sm font-semibold tracking-[0.18em] text-primary uppercase"
                to="/"
              >
                Cove
              </Link>
              <Link
                className="text-xs font-medium text-primary hover:underline"
                to="/workspaces/$workspaceId"
                params={{ workspaceId }}
              >
                Manage
              </Link>
            </div>
            <h1 className="mt-4 truncate font-heading text-xl font-semibold tracking-tight">
              {workspace.data.workspace.name}
            </h1>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {workspace.data.identity.name}
            </p>
          </header>

          <ChannelSidebar activeChannelId={channelId} workspaceId={workspaceId} />
        </aside>

        <section className="min-w-0 bg-background">
          <header className="border-b px-5 py-5 sm:px-8 sm:py-6">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div>
                <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">
                  Public Channel
                </p>
                <h2 className="mt-2 font-heading text-3xl font-semibold tracking-tight">
                  #{channel.data.name}
                </h2>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                  {channel.data.purpose}
                </p>
                <p className="mt-3 text-xs font-medium text-muted-foreground">
                  Maintained by {channel.data.maintainer.name}
                </p>
              </div>

              {channel.data.hasChannelMembership ? (
                <span className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
                  Joined
                </span>
              ) : (
                <Button type="button" disabled={joinChannel.isPending} onClick={join}>
                  {joinChannel.isPending ? "Joining…" : "Join channel"}
                </Button>
              )}
            </div>
            {joinChannel.isSuccess ? (
              <p className="mt-3 text-sm text-muted-foreground" role="status">
                You joined #{channel.data.name}.
              </p>
            ) : null}
            {joinChannel.isError ? (
              <p className="mt-3 text-sm text-destructive" role="alert">
                Cove could not join this channel. Refresh and try again.
              </p>
            ) : null}
          </header>

          <div className="px-5 py-8 sm:px-8 sm:py-10">
            <div className="mx-auto max-w-3xl">
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="font-heading text-xl font-semibold">Topics</h3>
                <span className="text-xs font-medium text-muted-foreground">0 open</span>
              </div>
              <section className="mt-5 rounded-2xl border border-dashed bg-muted/20 px-6 py-12 text-center">
                <h4 className="font-heading text-lg font-semibold">No topics yet</h4>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                  Conversations in Cove begin with a named Topic and an Opening Brief. Topic
                  creation arrives in the next conversation slice.
                </p>
              </section>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
