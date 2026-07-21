import { Button } from "@cove/ui/components/button";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, type ReactElement } from "react";
import {
  getChannelsListPublicChannelsQueryKey,
  useChannelsCreatePublicChannel,
  useChannelsListPublicChannels,
} from "../api/generated/cove-app.ts";
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
    <div className="mt-6 grid gap-6">
      <nav aria-label="Your channels">
        <p className="px-2 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Your channels
        </p>
        {channels.isPending ? (
          <p className="mt-2 px-2 text-sm text-muted-foreground" role="status">
            Loading channels…
          </p>
        ) : channels.isError ? (
          <p className="mt-2 px-2 text-sm text-destructive" role="alert">
            Channels are unavailable.
          </p>
        ) : joinedChannels.length === 0 ? (
          <p className="mt-2 px-2 text-sm text-muted-foreground">No joined channels.</p>
        ) : (
          <ul className="mt-2 grid gap-1">
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
        <section aria-label="Discover public channels">
          <p className="px-2 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Discover
          </p>
          <ul className="mt-2 grid gap-1">
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

      <details className="rounded-2xl border bg-background/70 p-3 open:bg-background">
        <summary className="cursor-pointer text-sm font-semibold text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          Create channel
        </summary>
        <form className="mt-4 grid gap-4" onSubmit={create}>
          <label className="text-sm font-medium" htmlFor="channelName">
            Channel name
            <input
              id="channelName"
              name="channelName"
              required
              className="mt-2 h-10 w-full rounded-xl border bg-background px-3 font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="product-lab"
            />
          </label>
          <label className="text-sm font-medium" htmlFor="channelPurpose">
            Purpose
            <textarea
              id="channelPurpose"
              name="channelPurpose"
              required
              rows={3}
              className="mt-2 w-full resize-y rounded-xl border bg-background px-3 py-2 font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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
    readonly purpose: string;
  };
  readonly workspaceId: string;
}

function ChannelLink({ activeChannelId, channel, workspaceId }: ChannelLinkProps): ReactElement {
  return (
    <Link
      to="/workspaces/$workspaceId/channels/$channelId"
      params={{ workspaceId, channelId: channel.id }}
      aria-label={channel.name}
      aria-current={channel.id === activeChannelId ? "page" : undefined}
      className="block rounded-xl px-3 py-2.5 transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none aria-[current=page]:bg-primary/10"
    >
      <span className="block truncate text-sm font-semibold">#{channel.name}</span>
      <span className="mt-0.5 block truncate text-xs text-muted-foreground">{channel.purpose}</span>
    </Link>
  );
}
