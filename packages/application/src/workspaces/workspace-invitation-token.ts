import {
  WorkspaceInvitationToken,
  WorkspaceInvitationTokenValue,
  type WorkspaceInvitationToken as WorkspaceInvitationTokenType,
} from "@cove/ports";
import { Redacted } from "effect";

export function makeWorkspaceInvitationToken(value: string): WorkspaceInvitationTokenType {
  return WorkspaceInvitationToken.make(
    Redacted.make(WorkspaceInvitationTokenValue.make(value), {
      label: "WorkspaceInvitationToken",
    }),
  );
}
