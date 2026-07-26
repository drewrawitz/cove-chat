import { queries } from "@cove/sync";
import { useConnectionState, useQuery } from "@rocicorp/zero/react";
import { useEffect, useRef, useState } from "react";
import {
  privateChannelAccessState,
  type AuthoritativeChannelAccess,
  type PrivateChannelAccessState,
  type SynchronizedChannelAccess,
} from "./private-channel-access.ts";

interface PrivateChannelAccessOptions {
  readonly authoritativeAccess: AuthoritativeChannelAccess;
  readonly channelId: string;
  readonly onRevoked: () => void;
  readonly refreshAuthoritativeAccess: () => Promise<unknown>;
  readonly visibility?: "private" | "public";
  readonly workspaceId: string;
}

export function usePrivateChannelAccess({
  authoritativeAccess,
  channelId,
  onRevoked,
  refreshAuthoritativeAccess,
  visibility,
  workspaceId,
}: PrivateChannelAccessOptions): PrivateChannelAccessState {
  const connection = useConnectionState();
  const membershipQuery =
    visibility === "private"
      ? queries.access.channelMembership({ workspaceId, channelId })
      : undefined;
  const [synchronizedMembership, synchronizedResult] = useQuery(membershipQuery);
  const previousConnection = useRef(connection.name);
  const [revalidating, setRevalidating] = useState(false);
  const reconnectRequiresRevalidation =
    visibility === "private" &&
    connection.name === "connected" &&
    previousConnection.current !== "connected";

  useEffect(() => {
    const previous = previousConnection.current;
    previousConnection.current = connection.name;
    if (visibility !== "private" || connection.name !== "connected" || previous === "connected") {
      return;
    }
    setRevalidating(true);
    void refreshAuthoritativeAccess().finally(() => setRevalidating(false));
  }, [connection.name, refreshAuthoritativeAccess, visibility]);

  const synchronizedAccess: SynchronizedChannelAccess =
    synchronizedResult.type === "complete"
      ? synchronizedMembership === undefined
        ? "revoked"
        : "available"
      : "checking";
  const state =
    visibility === undefined
      ? "checking"
      : privateChannelAccessState({
          visibility,
          connection: connection.name,
          authoritativeAccess:
            revalidating || reconnectRequiresRevalidation ? "checking" : authoritativeAccess,
          synchronizedAccess,
        });

  useEffect(() => {
    if (state === "revoked") onRevoked();
  }, [onRevoked, state]);

  return state;
}
