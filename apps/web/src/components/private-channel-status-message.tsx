import { Button } from "@cove/ui/components/button";
import type { ReactElement } from "react";
import type { PrivateChannelAccessState } from "../private-channel-access.ts";

interface PrivateChannelStatusMessageProps {
  readonly retryAccessCheck: () => void;
  readonly state: PrivateChannelAccessState;
}

export function PrivateChannelStatusMessage({
  retryAccessCheck,
  state,
}: PrivateChannelStatusMessageProps): ReactElement | null {
  if (state === "available") return null;

  const message =
    state === "offline"
      ? "Private Channel content is unavailable while Cove is offline."
      : state === "revoked"
        ? "This Private Channel is no longer available to your Account."
        : "Confirming access before opening this Private Channel…";

  return (
    <>
      <p className="text-muted-foreground" role="status">
        {message}
      </p>
      {state === "checking" ? (
        <Button className="mt-4" type="button" size="sm" onClick={retryAccessCheck}>
          Retry access check
        </Button>
      ) : null}
    </>
  );
}
