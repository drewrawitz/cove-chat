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
import { useAccountConversationRuntime } from "../account-conversation-state-context.tsx";
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
  const [draftCleanupFailed, setDraftCleanupFailed] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { state: conversationState } = useAccountConversationRuntime();
  const leaveChannel = useChannelsLeaveChannel();

  const setOpen = (open: boolean): void => {
    if (leaveChannel.isPending) return;
    if (draftCleanupFailed && !open) return;
    if (open) leaveChannel.reset();
    setDialogOpen(open);
  };

  const finishAccessLoss = async (): Promise<void> => {
    try {
      conversationState.clearChannelDrafts(workspaceId, channelId);
    } catch {
      setDraftCleanupFailed(true);
      setDialogOpen(true);
      return;
    }
    setDraftCleanupFailed(false);
    setDialogOpen(false);
    await navigate(
      visibility === "private"
        ? {
            to: "/workspaces/$workspaceId/channels/$channelId",
            params: { workspaceId, channelId: generalChannelId },
          }
        : {
            to: "/workspaces/$workspaceId",
            params: { workspaceId },
          },
    );
    queryClient.removeQueries({
      queryKey: getChannelsGetChannelQueryKey(workspaceId, channelId),
    });
  };

  const leave = (): void => {
    leaveChannel.mutate(
      { workspaceId, channelId },
      {
        onSuccess: async () => {
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

          if (visibility === "private" || willLoseAccess) {
            await finishAccessLoss();
            return;
          }

          setDialogOpen(false);
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
        <DialogPopup className="w-[min(32rem,calc(100vw-2rem))]">
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

          {draftCleanupFailed ? (
            <p className="px-6 pt-6 text-sm text-destructive sm:px-8" role="alert">
              Cove could not remove this Channel’s saved drafts from this browser.
            </p>
          ) : null}

          <footer className="flex justify-end gap-3 p-6 sm:px-8">
            {draftCleanupFailed ? null : (
              <DialogClose className={buttonVariants({ variant: "secondary", size: "lg" })}>
                Keep channel
              </DialogClose>
            )}
            <Button
              type="button"
              size="lg"
              variant="destructive"
              disabled={leaveChannel.isPending}
              onClick={draftCleanupFailed ? () => void finishAccessLoss() : leave}
            >
              {draftCleanupFailed
                ? "Retry removing saved drafts"
                : leaveChannel.isPending
                  ? "Leaving…"
                  : "Leave channel"}
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
