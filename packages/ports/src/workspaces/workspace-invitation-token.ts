import { Schema } from "effect";

export const WorkspaceInvitationTokenValue = Schema.NonEmptyString.pipe(
  Schema.brand("WorkspaceInvitationToken"),
);
export type WorkspaceInvitationTokenValue = typeof WorkspaceInvitationTokenValue.Type;

export const WorkspaceInvitationToken = Schema.Redacted(WorkspaceInvitationTokenValue, {
  label: "WorkspaceInvitationToken",
  disallowJsonEncode: true,
});
export type WorkspaceInvitationToken = typeof WorkspaceInvitationToken.Type;
