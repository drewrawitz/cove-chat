import { Button } from "@cove/ui/components/button";
import { useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { type ReactElement } from "react";
import {
  getChannelsGetChannelQueryKey,
  getChannelsListPublicChannelsQueryKey,
  useAuthMe,
  useChannelsGetChannel,
  useChannelsJoinPublicChannel,
  useWorkspacesGetWorkspace,
} from "../api/generated/cove-app.ts";
import { channelDisplayName } from "../channel-display-name.ts";
import { ChannelLoading } from "../components/channel-loading.tsx";
import { ChannelSidebar } from "../components/channel-sidebar.tsx";
import { PageMessage } from "../components/page-message.tsx";
import { ChannelMembership } from "../components/channel-membership.tsx";
import { LeaveChannel } from "../components/leave-channel.tsx";
import { WorkspaceSwitcher } from "../components/workspace-switcher.tsx";
import { isWorkspaceAdministrator } from "../workspace-role.ts";

export const Route = createFileRoute("/workspaces/$workspaceId/channels/$channelId")({
  component: ChannelPage,
});

function ChannelPage(): ReactElement {
  const { workspaceId, channelId } = Route.useParams();
  const queryClient = useQueryClient();
  const account = useAuthMe({ query: { retry: false } });
  const workspace = useWorkspacesGetWorkspace(workspaceId, { query: { retry: false } });
  const channel = useChannelsGetChannel(workspaceId, channelId, {
    query: { retry: false },
  });
  const joinChannel = useChannelsJoinPublicChannel();

  if (account.isPending || workspace.isPending) {
    return <PageMessage message="Opening workspace…" theme="dark" />;
  }
  if (account.isError) {
    return <PageMessage message="Cove could not load your account." theme="dark" />;
  }
  if (workspace.isError) {
    return (
      <PageMessage message="This channel is not available in this workspace." theme="dark">
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
              queryKey: getChannelsGetChannelQueryKey(workspaceId, channelId),
            }),
            queryClient.invalidateQueries({
              queryKey: getChannelsListPublicChannelsQueryKey(workspaceId),
            }),
          ]);
        },
      },
    );
  };

  let channelContent: ReactElement;
  if (channel.isPending) {
    channelContent = <ChannelLoading />;
  } else if (channel.isError) {
    channelContent = (
      <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14 lg:px-12 lg:pt-24 xl:px-16">
        <p className="text-muted-foreground" role="status">
          This channel is not available in this workspace.
        </p>
        <Link
          className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
          to="/workspaces/$workspaceId"
          params={{ workspaceId }}
        >
          Return to workspace management
        </Link>
      </div>
    );
  } else {
    const displayName = channelDisplayName(channel.data.name);
    const isPrivateMaintainer =
      channel.data.visibility === "private" &&
      channel.data.maintainer.id === workspace.data.identity.id;
    channelContent = (
      <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14 lg:px-12 lg:pt-24 xl:px-16">
        <header className="flex flex-wrap items-start justify-between gap-6 pb-10">
          <div className="min-w-0 flex-1">
            <h2 className="text-4xl font-semibold tracking-tight sm:text-5xl">{displayName}</h2>
            <p className="mt-3 max-w-3xl text-base text-muted-foreground sm:text-lg">
              {channel.data.visibility === "private" ? "Private" : "Public"}{" "}
              <span aria-hidden="true">·</span> {channel.data.purpose}
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              Maintained by {channel.data.maintainer.name}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <ChannelMembership
              canAdminister={
                isWorkspaceAdministrator(workspace.data.membership.role) ||
                channel.data.maintainer.id === workspace.data.identity.id
              }
              channelId={channelId}
              channelName={displayName}
              currentIdentityId={workspace.data.identity.id}
              visibility={channel.data.visibility}
              workspaceId={workspaceId}
            />
            <img
              className="size-10 rounded-full border border-border bg-muted object-cover"
              src={channel.data.maintainer.avatarUrl}
              alt=""
            />
            {channel.data.hasChannelMembership && !isPrivateMaintainer ? (
              <LeaveChannel
                channelId={channelId}
                channelName={displayName}
                generalChannelId={workspace.data.generalChannelId}
                visibility={channel.data.visibility}
                willLoseAccess={
                  channel.data.visibility === "private" ||
                  workspace.data.membership.role === "guest"
                }
                workspaceId={workspaceId}
              />
            ) : channel.data.hasChannelMembership ? (
              <span className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm font-medium text-muted-foreground">
                Joined
              </span>
            ) : channel.data.visibility === "public" ? (
              <Button type="button" size="lg" disabled={joinChannel.isPending} onClick={join}>
                {joinChannel.isPending ? "Joining…" : "Join channel"}
              </Button>
            ) : null}
          </div>
        </header>

        {channel.data.visibility === "public" && joinChannel.isSuccess ? (
          <p className="-mt-6 mb-6 text-sm text-muted-foreground" role="status">
            You joined {displayName}.
          </p>
        ) : null}
        {channel.data.visibility === "public" && joinChannel.isError ? (
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
              Conversations in Cove begin with a named Topic and an Opening Brief. Topic creation
              arrives in the next conversation slice.
            </p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <main className="dark min-h-svh bg-background text-foreground">
      <div className="min-h-svh w-full lg:grid lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="border-b border-sidebar-border bg-sidebar text-sidebar-foreground lg:sticky lg:top-0 lg:h-svh lg:overflow-y-auto lg:border-r lg:border-b-0">
          <div className="p-4 lg:p-5">
            <header>
              <WorkspaceSwitcher
                accountDisplayName={account.data.displayName}
                accountEmail={account.data.email}
                activeChannelId={channelId}
                identityName={workspace.data.identity.name}
                workspaceId={workspaceId}
                workspaceName={workspace.data.workspace.name}
              />
            </header>

            <ChannelSidebar activeChannelId={channelId} workspaceId={workspaceId} />
          </div>
        </aside>

        <section className="min-w-0 bg-background" aria-busy={channel.isPending}>
          {channelContent}
        </section>
      </div>
    </main>
  );
}
