import { Button } from "@cove/ui/components/button";
import { Link } from "@tanstack/react-router";
import { type ReactElement, useState } from "react";
import {
  getChannelsListPrivateChannelsQueryKey,
  useChannelsAddChannelMember,
  useChannelsListPrivateChannelsForAdministration,
} from "../api/generated/cove-app.ts";
import { channelDisplayName } from "../channel-display-name.ts";
import { ChannelMemberForm } from "./channel-member-form.tsx";
import { useJoinChannel } from "./use-join-channel.ts";

interface PrivateChannelAdministrationProps {
  readonly currentIdentityId: string;
  readonly workspaceId: string;
}

export function PrivateChannelAdministration({
  currentIdentityId,
  workspaceId,
}: PrivateChannelAdministrationProps): ReactElement {
  const channels = useChannelsListPrivateChannelsForAdministration(workspaceId, {
    query: { retry: false },
  });
  const joinChannelMutation = useChannelsAddChannelMember();
  const [joiningChannelId, setJoiningChannelId] = useState<string>();
  const joinChannel = useJoinChannel({
    additionalRefresh: channels.refetch,
    queriesToInvalidate: [getChannelsListPrivateChannelsQueryKey(workspaceId)],
    successMessage: (channelName) => `You joined ${channelName}.`,
  });

  const join = (channelId: string, channelName: string): void => {
    setJoiningChannelId(channelId);
    joinChannelMutation.mutate(
      { workspaceId, channelId, workspaceIdentityId: currentIdentityId },
      {
        onSuccess: () => joinChannel.onJoined(channelName),
        onSettled: () => setJoiningChannelId(undefined),
      },
    );
  };

  return (
    <section aria-label="Private Channel administration" className="mt-10 border-t pt-6">
      <h2 className="font-heading text-xl font-semibold">Private Channel administration</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Manage membership and inspect metadata without receiving conversation access. Joining is
        always an explicit, visible action.
      </p>

      {channels.isPending ? (
        <p className="mt-5 text-sm text-muted-foreground" role="status">
          Loading Private Channels…
        </p>
      ) : channels.isError ? (
        <p className="mt-5 text-sm text-destructive" role="alert">
          Cove could not load Private Channel administration.
        </p>
      ) : channels.data.channels.length === 0 ? (
        <p className="mt-5 rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">
          No Private Channels yet.
        </p>
      ) : (
        <ul className="mt-5 grid gap-3">
          {channels.data.channels.map((channel) => {
            const displayName = channelDisplayName(channel.name);
            const isJoining = joiningChannelId === channel.id;
            return (
              <li
                className="grid gap-4 rounded-2xl border p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                key={channel.id}
              >
                <div className="min-w-0">
                  <h3 className="font-medium">{displayName}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{channel.purpose}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Maintained by {channel.maintainer.name} · {channel.members.length}{" "}
                    {channel.members.length === 1 ? "member" : "members"}
                  </p>
                </div>
                {channel.actorHasChannelMembership ? (
                  <Link
                    to="/workspaces/$workspaceId/channels/$channelId"
                    params={{ workspaceId, channelId: channel.id }}
                    aria-label={`Open ${displayName}`}
                    className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    Open channel
                  </Link>
                ) : (
                  <Button
                    type="button"
                    aria-label={`Join ${displayName}`}
                    disabled={joinChannelMutation.isPending}
                    onClick={() => join(channel.id, displayName)}
                  >
                    {isJoining ? "Joining…" : "Join channel"}
                  </Button>
                )}
                <ChannelMemberForm
                  channelId={channel.id}
                  channelName={displayName}
                  className="border-t pt-4 sm:col-span-2"
                  excludedIdentityId={currentIdentityId}
                  label={`Member to add to ${displayName}`}
                  onMembershipChanged={joinChannel.refresh}
                  workspaceId={workspaceId}
                />
              </li>
            );
          })}
        </ul>
      )}

      {joinChannelMutation.isError ? (
        <p className="mt-4 text-sm text-destructive" role="alert">
          Cove could not join that Private Channel. Refresh and try again.
        </p>
      ) : null}
    </section>
  );
}
