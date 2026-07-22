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
import { useNavigate } from "@tanstack/react-router";
import { type ReactElement, useState } from "react";
import { CoveApiError } from "../api/cove-fetch.ts";
import {
  getChannelsGetChannelMembershipRosterQueryKey,
  getChannelsGetChannelQueryKey,
  getChannelsListPrivateChannelsQueryKey,
  getChannelsListPublicChannelsQueryKey,
  useChannelsLeaveChannel,
} from "../api/generated/cove-app.ts";

interface LeaveChannelProps {
  readonly channelId: string;
  readonly channelName: string;
  readonly generalChannelId: string;
  readonly visibility: "private" | "public";
  readonly willLoseAccess: boolean;
  readonly workspaceId: string;
}

export function LeaveChannel({
  channelId,
  channelName,
  generalChannelId,
  visibility,
  willLoseAccess,
  workspaceId,
}: LeaveChannelProps): ReactElement {
  const [dialogOpen, setDialogOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const leaveChannel = useChannelsLeaveChannel();

  const setOpen = (open: boolean): void => {
    if (leaveChannel.isPending) return;
    if (open) leaveChannel.reset();
    setDialogOpen(open);
  };

  const leave = (): void => {
    leaveChannel.mutate(
      { workspaceId, channelId },
      {
        onSuccess: async () => {
          setDialogOpen(false);
          await Promise.all([
            queryClient.invalidateQueries({
              queryKey: getChannelsListPublicChannelsQueryKey(workspaceId),
            }),
            queryClient.invalidateQueries({
              queryKey: getChannelsListPrivateChannelsQueryKey(workspaceId),
            }),
            queryClient.invalidateQueries({
              queryKey: getChannelsGetChannelMembershipRosterQueryKey(workspaceId, channelId),
            }),
          ]);

          if (visibility === "private") {
            await navigate({
              to: "/workspaces/$workspaceId/channels/$channelId",
              params: { workspaceId, channelId: generalChannelId },
            });
            queryClient.removeQueries({
              queryKey: getChannelsGetChannelQueryKey(workspaceId, channelId),
            });
            return;
          }

          if (willLoseAccess) {
            await navigate({
              to: "/workspaces/$workspaceId",
              params: { workspaceId },
            });
            queryClient.removeQueries({
              queryKey: getChannelsGetChannelQueryKey(workspaceId, channelId),
            });
            return;
          }

          await queryClient.invalidateQueries({
            queryKey: getChannelsGetChannelQueryKey(workspaceId, channelId),
          });
        },
      },
    );
  };

  return (
    <DialogRoot open={dialogOpen} onOpenChange={setOpen}>
      <DialogTrigger className={buttonVariants({ variant: "destructive", size: "lg" })}>
        Leave channel
      </DialogTrigger>
      <DialogPortal>
        <DialogBackdrop />
        <DialogPopup className="dark w-[min(32rem,calc(100vw-2rem))] bg-card">
          <header className="border-b p-6 sm:p-8">
            <DialogTitle>Leave {channelName}?</DialogTitle>
            <DialogDescription className="mt-2 leading-6">
              {willLoseAccess
                ? `You’ll lose access to this ${visibility === "private" ? "Private" : "Public"} Channel. A Channel Maintainer or Workspace administrator will need to add you again.`
                : "This removes the Channel from Your channels. You can still find and rejoin it under Discover."}
            </DialogDescription>
          </header>

          {leaveChannel.isError ? (
            <p className="px-6 pt-6 text-sm text-destructive sm:px-8" role="alert">
              {leaveErrorMessage(leaveChannel.error)}
            </p>
          ) : null}

          <footer className="flex justify-end gap-3 p-6 sm:px-8">
            <DialogClose className={buttonVariants({ variant: "secondary", size: "lg" })}>
              Keep channel
            </DialogClose>
            <Button
              type="button"
              size="lg"
              variant="destructive"
              disabled={leaveChannel.isPending}
              onClick={leave}
            >
              {leaveChannel.isPending ? "Leaving…" : "Leave channel"}
            </Button>
          </footer>
        </DialogPopup>
      </DialogPortal>
    </DialogRoot>
  );
}

function leaveErrorMessage(error: unknown): string {
  if (
    error instanceof CoveApiError &&
    error.info.code === "PRIVATE_CHANNEL_MAINTAINER_CANNOT_LEAVE"
  ) {
    return "A Private Channel Maintainer cannot leave the Channel.";
  }
  return "Cove could not leave this Channel. Refresh and try again.";
}
