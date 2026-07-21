import { Button } from "@cove/ui/components/button";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, type ReactElement } from "react";
import { CoveApiError } from "../api/cove-fetch.ts";
import {
  getChannelsListPublicChannelsQueryKey,
  useChannelsCreatePublicChannel,
  useChannelsListChannelStewards,
  useChannelsListPublicChannels,
} from "../api/generated/cove-app.ts";
import { requiredFormValue } from "../form-data.ts";

interface WorkspaceChannelsProps {
  readonly workspaceId: string;
}

export function WorkspaceChannels({ workspaceId }: WorkspaceChannelsProps): ReactElement {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const channels = useChannelsListPublicChannels(workspaceId, { query: { retry: false } });
  const stewards = useChannelsListChannelStewards(workspaceId, { query: { retry: false } });
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
          stewardIdentityId: requiredFormValue(form, "channelSteward"),
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
    <section className="mt-10 border-t pt-6" aria-labelledby="channels-heading">
      <p className="font-heading text-sm font-semibold tracking-[0.16em] text-primary uppercase">
        Channels
      </p>
      <h2 id="channels-heading" className="mt-2 font-heading text-2xl font-semibold tracking-tight">
        Durable places for shared work
      </h2>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <nav className="rounded-2xl border p-5" aria-label="Your channels">
          <h3 className="font-heading text-base font-semibold">Your channels</h3>
          {channels.isPending ? (
            <p className="mt-3 text-sm text-muted-foreground" role="status">
              Loading channels…
            </p>
          ) : channels.isError ? (
            <p className="mt-3 text-sm text-destructive" role="alert">
              Cove could not load your channels.
            </p>
          ) : joinedChannels.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Join a channel to keep it here.</p>
          ) : (
            <ul className="mt-3 grid gap-2">
              {joinedChannels.map((channel) => (
                <li key={channel.id}>
                  <Link
                    to="/workspaces/$workspaceId/channels/$channelId"
                    params={{ workspaceId, channelId: channel.id }}
                    aria-label={channel.name}
                    className="block rounded-xl bg-primary/5 px-3 py-2.5 text-sm font-semibold transition-colors hover:bg-primary/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    #{channel.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </nav>

        <section className="rounded-2xl border p-5" aria-label="Discover public channels">
          <h3 className="font-heading text-base font-semibold">Discover public channels</h3>
          {channels.isPending ? (
            <p className="mt-3 text-sm text-muted-foreground" role="status">
              Looking for public channels…
            </p>
          ) : channels.isError ? (
            <p className="mt-3 text-sm text-destructive" role="alert">
              Public channels are unavailable.
            </p>
          ) : discoverableChannels.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              You have joined every public channel.
            </p>
          ) : (
            <ul className="mt-3 grid gap-3">
              {discoverableChannels.map((channel) => (
                <li key={channel.id} className="rounded-xl bg-muted/40 p-3">
                  <p className="text-sm font-semibold">{channel.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{channel.purpose}</p>
                  <Link
                    to="/workspaces/$workspaceId/channels/$channelId"
                    params={{ workspaceId, channelId: channel.id }}
                    aria-label={`Read ${channel.name}`}
                    className="mt-3 inline-block text-sm font-semibold text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    Read channel
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <form
        className="mt-5 grid gap-4 rounded-2xl border bg-muted/20 p-5 sm:grid-cols-2"
        onSubmit={create}
      >
        <div className="sm:col-span-2">
          <h3 className="font-heading text-base font-semibold">Create a Public Channel</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Every Full Member can discover and read it. Joining adds it to their navigation.
          </p>
        </div>
        <label className="text-sm font-medium" htmlFor="channelName">
          Channel name
          <input
            id="channelName"
            name="channelName"
            required
            className="mt-2 h-11 w-full rounded-xl border bg-background px-3 font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            placeholder="product-lab"
          />
        </label>
        <label className="text-sm font-medium" htmlFor="channelSteward">
          Initial Channel Steward
          <select
            id="channelSteward"
            name="channelSteward"
            required
            disabled={stewards.isPending || stewards.isError}
            className="mt-2 h-11 w-full rounded-xl border bg-background px-3 font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {stewards.data?.stewards.map((steward) => (
              <option key={steward.id} value={steward.id}>
                {steward.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium sm:col-span-2" htmlFor="channelPurpose">
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
        <div className="sm:col-span-2">
          <Button
            type="submit"
            disabled={
              createChannel.isPending || !stewards.isSuccess || stewards.data.stewards.length === 0
            }
          >
            {createChannel.isPending ? "Creating…" : "Create Public Channel"}
          </Button>
          {createChannel.isError ? (
            <p className="mt-3 text-sm text-destructive" role="alert">
              {createChannelErrorMessage(createChannel.error)}
            </p>
          ) : null}
        </div>
      </form>
    </section>
  );
}

function createChannelErrorMessage(error: unknown): string {
  if (error instanceof CoveApiError && error.info.code === "CHANNEL_STEWARD_UNAVAILABLE") {
    return "Choose an active Full Member as the initial Channel Steward.";
  }
  return "Cove could not create this channel. Try again.";
}
