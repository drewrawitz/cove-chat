import { Button } from "@cove/ui/components/button";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, type ReactElement } from "react";
import {
  getChannelsListPublicChannelsQueryKey,
  useChannelsCreatePublicChannel,
  useChannelsListPublicChannels,
} from "../api/generated/cove-app.ts";
import { channelDisplayName } from "../channel-display-name.ts";
import { requiredFormValue } from "../form-data.ts";

interface ChannelSidebarProps {
  readonly activeChannelId: string;
  readonly workspaceId: string;
}

export function ChannelSidebar({
  activeChannelId,
  workspaceId,
}: ChannelSidebarProps): ReactElement {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const channels = useChannelsListPublicChannels(workspaceId, { query: { retry: false } });
  const createChannel = useChannelsCreatePublicChannel();

  const create = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    createChannel.mutate(
      {
        workspaceId,
        data: {
          name: requiredFormValue(form, "channelName"),
          purpose: requiredFormValue(form, "channelPurpose"),
        },
      },
      {
        onSuccess: async (created) => {
          formElement.reset();
          await queryClient.invalidateQueries({
            queryKey: getChannelsListPublicChannelsQueryKey(workspaceId),
          });
          await navigate({
            to: "/workspaces/$workspaceId/channels/$channelId",
            params: { workspaceId, channelId: created.id },
          });
        },
      },
    );
  };

  const joinedChannels =
    channels.data?.channels.filter((channel) => channel.hasChannelMembership) ?? [];
  const discoverableChannels =
    channels.data?.channels.filter((channel) => !channel.hasChannelMembership) ?? [];

  return (
    <div className="mt-8">
      <nav aria-label="Your channels">
        <p className="px-3 text-xs font-semibold text-muted-foreground">Channels</p>
        {channels.isPending ? (
          <p className="mt-3 px-3 text-sm text-muted-foreground" role="status">
            Loading channels…
          </p>
        ) : channels.isError ? (
          <p className="mt-3 px-3 text-sm text-destructive" role="alert">
            Channels are unavailable.
          </p>
        ) : joinedChannels.length === 0 ? (
          <p className="mt-3 px-3 text-sm text-muted-foreground">No joined channels.</p>
        ) : (
          <ul className="mt-3 grid gap-0.5">
            {joinedChannels.map((channel) => (
              <li key={channel.id}>
                <ChannelLink
                  activeChannelId={activeChannelId}
                  channel={channel}
                  workspaceId={workspaceId}
                />
              </li>
            ))}
          </ul>
        )}
      </nav>

      {discoverableChannels.length === 0 ? null : (
        <section className="mt-7" aria-label="Discover public channels">
          <p className="px-3 text-xs font-semibold text-muted-foreground">Discover</p>
          <ul className="mt-3 grid gap-0.5">
            {discoverableChannels.map((channel) => (
              <li key={channel.id}>
                <ChannelLink
                  activeChannelId={activeChannelId}
                  channel={channel}
                  workspaceId={workspaceId}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <details className="group mt-1">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors outline-none hover:bg-sidebar-accent focus-visible:ring-3 focus-visible:ring-sidebar-ring/50 [&::-webkit-details-marker]:hidden">
          <span
            aria-hidden="true"
            className="flex size-5 items-center justify-center text-lg leading-none text-muted-foreground transition-transform group-open:rotate-45"
          >
            +
          </span>
          New channel
        </summary>
        <form
          className="mx-2 mt-2 grid gap-4 rounded-xl border border-sidebar-border bg-background/70 p-4"
          onSubmit={create}
        >
          <label className="text-sm font-medium" htmlFor="channelName">
            Channel name
            <input
              id="channelName"
              name="channelName"
              required
              className="mt-2 h-10 w-full rounded-lg border bg-background px-3 font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="Product Design"
            />
          </label>
          <label className="text-sm font-medium" htmlFor="channelPurpose">
            Purpose
            <textarea
              id="channelPurpose"
              name="channelPurpose"
              required
              rows={3}
              className="mt-2 w-full resize-y rounded-lg border bg-background px-3 py-2 font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="What belongs in this channel?"
            />
          </label>
          <Button type="submit" disabled={createChannel.isPending}>
            {createChannel.isPending ? "Creating…" : "Create channel"}
          </Button>
          {createChannel.isError ? (
            <p className="text-sm text-destructive" role="alert">
              Cove could not create this channel. Try again.
            </p>
          ) : null}
        </form>
      </details>
    </div>
  );
}

interface ChannelLinkProps {
  readonly activeChannelId: string;
  readonly channel: {
    readonly id: string;
    readonly name: string;
  };
  readonly workspaceId: string;
}

function ChannelLink({ activeChannelId, channel, workspaceId }: ChannelLinkProps): ReactElement {
  const displayName = channelDisplayName(channel.name);

  return (
    <Link
      to="/workspaces/$workspaceId/channels/$channelId"
      params={{ workspaceId, channelId: channel.id }}
      aria-label={displayName}
      aria-current={channel.id === activeChannelId ? "page" : undefined}
      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent focus-visible:ring-3 focus-visible:ring-sidebar-ring/50 focus-visible:outline-none aria-[current=page]:bg-sidebar-accent aria-[current=page]:text-sidebar-accent-foreground"
    >
      <span className="text-base leading-none text-primary" aria-hidden="true">
        #
      </span>
      <span className="truncate">{displayName}</span>
    </Link>
  );
}
