import { Button, buttonVariants } from "@cove/ui/components/button";
import {
  DialogBackdrop,
  DialogClose,
  DialogDescription,
  DialogPopup,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from "@cove/ui/components/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, type ReactElement, useRef, useState } from "react";
import {
  getChannelsListPublicChannelsQueryKey,
  getChannelsListPrivateChannelsQueryKey,
  useChannelsCreatePrivateChannel,
  useChannelsCreatePublicChannel,
  useChannelsListPrivateChannels,
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
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const channelNameInput = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const publicChannels = useChannelsListPublicChannels(workspaceId, { query: { retry: false } });
  const privateChannels = useChannelsListPrivateChannels(workspaceId, { query: { retry: false } });
  const createPublicChannel = useChannelsCreatePublicChannel();
  const createPrivateChannel = useChannelsCreatePrivateChannel();

  const create = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const visibility = requiredFormValue(form, "channelVisibility");
    const command = {
      workspaceId,
      data: {
        name: requiredFormValue(form, "channelName"),
        purpose: requiredFormValue(form, "channelPurpose"),
      },
    };
    const onSuccess = async (created: { readonly id: string }): Promise<void> => {
      formElement.reset();
      setCreateDialogOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: getChannelsListPublicChannelsQueryKey(workspaceId),
        }),
        queryClient.invalidateQueries({
          queryKey: getChannelsListPrivateChannelsQueryKey(workspaceId),
        }),
      ]);
      await navigate({
        to: "/workspaces/$workspaceId/channels/$channelId",
        params: { workspaceId, channelId: created.id },
      });
    };

    if (visibility === "private") {
      createPrivateChannel.mutate(command, { onSuccess });
    } else {
      createPublicChannel.mutate(command, { onSuccess });
    }
  };

  const joinedChannels = [
    ...(publicChannels.data?.channels.filter((channel) => channel.hasChannelMembership) ?? []),
    ...(privateChannels.data?.channels ?? []),
  ];
  const discoverableChannels =
    publicChannels.data?.channels.filter((channel) => !channel.hasChannelMembership) ?? [];
  const joinedChannelsPending = publicChannels.isPending || privateChannels.isPending;
  const joinedChannelsError = publicChannels.isError || privateChannels.isError;
  const channelCreationPending = createPublicChannel.isPending || createPrivateChannel.isPending;
  const channelCreationError = createPublicChannel.isError || createPrivateChannel.isError;
  const setDialogOpen = (open: boolean): void => {
    if (open) {
      createPublicChannel.reset();
      createPrivateChannel.reset();
    }
    setCreateDialogOpen(open);
  };

  return (
    <div className="mt-8">
      <nav aria-label="Your channels">
        <p className="px-3 text-xs font-semibold text-muted-foreground">Channels</p>
        <ChannelList
          activeChannelId={activeChannelId}
          channels={joinedChannels}
          emptyMessage="No joined channels."
          isError={joinedChannelsError}
          isPending={joinedChannelsPending}
          workspaceId={workspaceId}
        />
      </nav>

      {discoverableChannels.length === 0 ? null : (
        <section className="mt-7" aria-label="Discover public channels">
          <p className="px-3 text-xs font-semibold text-muted-foreground">Discover</p>
          <ChannelList
            activeChannelId={activeChannelId}
            channels={discoverableChannels}
            emptyMessage="No public channels to discover."
            isError={publicChannels.isError}
            isPending={publicChannels.isPending}
            workspaceId={workspaceId}
          />
        </section>
      )}

      <DialogRoot open={createDialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger className="mt-1 flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors outline-none hover:bg-sidebar-accent focus-visible:ring-3 focus-visible:ring-sidebar-ring/50">
          <span
            aria-hidden="true"
            className="flex size-5 items-center justify-center text-lg leading-none text-muted-foreground"
          >
            +
          </span>
          New channel
        </DialogTrigger>
        <DialogPortal>
          <DialogBackdrop />
          <DialogPopup className="dark bg-card" initialFocus={channelNameInput}>
            <form onSubmit={create}>
              <header className="flex items-start justify-between gap-6 border-b p-6 sm:p-8">
                <div>
                  <DialogTitle>Create a new channel</DialogTitle>
                  <DialogDescription className="mt-2">
                    Give the channel a clear name, purpose, and audience.
                  </DialogDescription>
                </div>
                <DialogClose
                  aria-label="Close new channel dialog"
                  className="flex size-10 shrink-0 items-center justify-center rounded-lg text-2xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <span aria-hidden="true">×</span>
                </DialogClose>
              </header>

              <div className="grid gap-7 p-6 sm:p-8">
                <label className="text-base font-semibold" htmlFor="channelName">
                  Channel name
                  <input
                    id="channelName"
                    ref={channelNameInput}
                    name="channelName"
                    required
                    className="mt-3 h-12 w-full rounded-lg border bg-background px-4 font-normal outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    placeholder="Marketing, Design, Android"
                  />
                </label>
                <label className="text-base font-semibold" htmlFor="channelPurpose">
                  Purpose
                  <textarea
                    id="channelPurpose"
                    name="channelPurpose"
                    required
                    rows={5}
                    className="mt-3 w-full resize-y rounded-lg border bg-background px-4 py-3 font-normal outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    placeholder="What’s this channel about?"
                  />
                </label>
                <fieldset>
                  <legend className="text-base font-semibold">Visibility</legend>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="flex cursor-pointer gap-3 rounded-lg border bg-muted/20 px-4 py-3 text-sm has-checked:border-primary has-checked:bg-primary/5">
                      <input
                        type="radio"
                        name="channelVisibility"
                        value="public"
                        defaultChecked
                        className="mt-1 accent-primary"
                      />
                      <span>
                        <strong className="font-medium text-foreground">Public</strong>
                        <span className="mt-1 block text-muted-foreground">
                          Every Full Member can discover and read it.
                        </span>
                      </span>
                    </label>
                    <label className="flex cursor-pointer gap-3 rounded-lg border bg-muted/20 px-4 py-3 text-sm has-checked:border-primary has-checked:bg-primary/5">
                      <input
                        type="radio"
                        name="channelVisibility"
                        value="private"
                        className="mt-1 accent-primary"
                      />
                      <span>
                        <strong className="font-medium text-foreground">Private</strong>
                        <span className="mt-1 block text-muted-foreground">
                          Only explicitly added Channel Members can read it.
                        </span>
                      </span>
                    </label>
                  </div>
                </fieldset>
                {channelCreationError ? (
                  <p className="text-sm text-destructive" role="alert">
                    Cove could not create this channel. Try again.
                  </p>
                ) : null}
              </div>

              <footer className="flex justify-end gap-3 border-t p-6 sm:px-8">
                <DialogClose className={buttonVariants({ variant: "secondary", size: "lg" })}>
                  Cancel
                </DialogClose>
                <Button type="submit" size="lg" disabled={channelCreationPending}>
                  {channelCreationPending ? "Creating…" : "Create channel"}
                </Button>
              </footer>
            </form>
          </DialogPopup>
        </DialogPortal>
      </DialogRoot>
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

interface ChannelListProps {
  readonly activeChannelId: string;
  readonly channels: ReadonlyArray<ChannelLinkProps["channel"]>;
  readonly emptyMessage: string;
  readonly isError: boolean;
  readonly isPending: boolean;
  readonly workspaceId: string;
}

function ChannelList({
  activeChannelId,
  channels,
  emptyMessage,
  isError,
  isPending,
  workspaceId,
}: ChannelListProps): ReactElement {
  if (isPending) {
    return (
      <p className="mt-3 px-3 text-sm text-muted-foreground" role="status">
        Loading channels…
      </p>
    );
  }
  if (isError) {
    return (
      <p className="mt-3 px-3 text-sm text-destructive" role="alert">
        Channels are unavailable.
      </p>
    );
  }
  if (channels.length === 0) {
    return <p className="mt-3 px-3 text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <ul className="mt-3 grid gap-0.5">
      {channels.map((channel) => (
        <li key={channel.id}>
          <ChannelLink
            activeChannelId={activeChannelId}
            channel={channel}
            workspaceId={workspaceId}
          />
        </li>
      ))}
    </ul>
  );
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
