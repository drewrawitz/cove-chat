import { Button } from "@cove/ui/components/button";
import { useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { type ReactElement } from "react";
import {
  getChannelsGetPublicChannelQueryKey,
  getChannelsListPublicChannelsQueryKey,
  useChannelsGetPublicChannel,
  useChannelsJoinPublicChannel,
} from "../api/generated/cove-app.ts";
import { PageMessage } from "../components/page-message.tsx";
import { WorkspaceChannels } from "../components/workspace-channels.tsx";

export const Route = createFileRoute("/workspaces/$workspaceId/channels/$channelId")({
  component: PublicChannel,
});

function PublicChannel(): ReactElement {
  const { workspaceId, channelId } = Route.useParams();
  const queryClient = useQueryClient();
  const channel = useChannelsGetPublicChannel(workspaceId, channelId, {
    query: { retry: false },
  });
  const joinChannel = useChannelsJoinPublicChannel();

  if (channel.isPending) return <PageMessage message="Opening channel…" />;
  if (channel.isError) {
    return (
      <PageMessage message="This channel is not available in this workspace.">
        <Link
          className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
          to="/workspaces/$workspaceId"
          params={{ workspaceId }}
        >
          Return to workspace
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
    <main className="min-h-svh bg-muted/30 p-5 sm:p-8">
      <div className="mx-auto grid w-full max-w-6xl gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.7fr)]">
        <article className="h-fit overflow-hidden rounded-3xl border bg-card shadow-sm">
          <header className="border-b bg-primary/5 p-6 sm:p-8">
            <Link
              to="/workspaces/$workspaceId"
              params={{ workspaceId }}
              className="text-sm font-semibold text-primary hover:underline"
            >
              Back to workspace
            </Link>
            <h1 className="mt-5 font-heading text-3xl font-semibold tracking-tight">
              #{channel.data.name}
            </h1>
            <p className="mt-3 max-w-2xl text-muted-foreground">{channel.data.purpose}</p>
            <p className="mt-5 text-sm font-medium">Stewarded by {channel.data.steward.name}</p>
          </header>
          <div className="p-6 sm:p-8">
            <h2 className="font-heading text-xl font-semibold">Public Channel</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Full Members can read this channel without joining. Join when you want it kept in your
              channel navigation.
            </p>
            {channel.data.hasChannelMembership ? (
              <p className="mt-5 rounded-xl bg-primary/5 p-4 text-sm font-medium">
                This channel is in your navigation.
              </p>
            ) : (
              <Button
                className="mt-5"
                type="button"
                disabled={joinChannel.isPending}
                onClick={join}
              >
                {joinChannel.isPending ? "Joining…" : "Join channel"}
              </Button>
            )}
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
          </div>
        </article>

        <aside className="rounded-3xl border bg-card p-5 shadow-sm">
          <WorkspaceChannels workspaceId={workspaceId} />
        </aside>
      </div>
    </main>
  );
}
