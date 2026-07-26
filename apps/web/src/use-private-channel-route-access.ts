import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useAccountConversationRuntime } from "./account-conversation-state-context.tsx";
import { getChannelsGetChannelQueryKey } from "./api/generated/cove-app.ts";
import {
  authoritativeChannelAccessState,
  type PrivateChannelAccessState,
} from "./private-channel-access.ts";
import { usePrivateChannelAccess } from "./use-private-channel-access.ts";

interface AccessQuery<Data> {
  readonly data?: Data;
  readonly error: unknown;
  readonly isFetching: boolean;
  readonly isPending: boolean;
  readonly refetch: () => Promise<unknown>;
}

interface PrivateChannelRouteAccessOptions {
  readonly channel: AccessQuery<{ readonly visibility: "private" | "public" }>;
  readonly channelId: string;
  readonly workspace: AccessQuery<{ readonly generalChannelId: string }>;
  readonly workspaceId: string;
}

export interface PrivateChannelRouteAccess {
  readonly state: PrivateChannelAccessState | "cleanup-required";
  readonly retryCleanup: () => void;
}

export function usePrivateChannelRouteAccess({
  channel,
  channelId,
  workspace,
  workspaceId,
}: PrivateChannelRouteAccessOptions): PrivateChannelRouteAccess {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { state: conversationState } = useAccountConversationRuntime();
  const [cleanupFailed, setCleanupFailed] = useState(false);
  const refreshAuthoritativeAccess = useCallback(
    () => Promise.all([workspace.refetch(), channel.refetch()]),
    [channel.refetch, workspace.refetch],
  );
  const generalChannelId = workspace.data?.generalChannelId;
  const onRevoked = useCallback((): void => {
    try {
      conversationState.clearChannelDrafts(workspaceId, channelId);
      setCleanupFailed(false);
    } catch {
      setCleanupFailed(true);
      return;
    }
    queryClient.removeQueries({
      queryKey: getChannelsGetChannelQueryKey(workspaceId, channelId),
    });
    if (generalChannelId === undefined) {
      void navigate({ to: "/workspaces/$workspaceId", params: { workspaceId }, replace: true });
      return;
    }
    void navigate({
      to: "/workspaces/$workspaceId/channels/$channelId",
      params: { workspaceId, channelId: generalChannelId },
      replace: true,
    });
  }, [channelId, conversationState, generalChannelId, navigate, queryClient, workspaceId]);
  const workspaceAccess = authoritativeChannelAccessState({
    error: workspace.error,
    isFetching: workspace.isFetching,
    isPending: workspace.isPending,
  });
  const channelAccess = authoritativeChannelAccessState({
    error: channel.error,
    isFetching: channel.isFetching,
    isPending: channel.isPending,
  });

  const state = usePrivateChannelAccess({
    authoritativeAccess: workspaceAccess === "available" ? channelAccess : workspaceAccess,
    channelId,
    onRevoked,
    refreshAuthoritativeAccess,
    visibility: channel.data?.visibility,
    workspaceId,
  });
  const authoritativeAccessLost = workspaceAccess === "revoked" || channelAccess === "revoked";

  useEffect(() => {
    if (authoritativeAccessLost && state !== "revoked") onRevoked();
  }, [authoritativeAccessLost, onRevoked, state]);

  return {
    state: cleanupFailed ? "cleanup-required" : state,
    retryCleanup: onRevoked,
  };
}
