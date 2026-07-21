import type { EmailAddress, WorkspaceName } from "@cove/domain";
import { Context, type Effect, Schema } from "effect";
import type { WorkspaceInvitationToken } from "./workspace-invitation-token.ts";

export interface WorkspaceInvitationNotification {
  readonly recipient: EmailAddress;
  readonly workspaceName: WorkspaceName;
  readonly token: WorkspaceInvitationToken;
  readonly expiresAt: Date;
}

export class WorkspaceInvitationNotificationError extends Schema.TaggedErrorClass<WorkspaceInvitationNotificationError>()(
  "Ports.WorkspaceInvitationNotificationError",
  { cause: Schema.Defect() },
) {}

export interface WorkspaceInvitationNotifierService {
  readonly sendInvitation: (
    notification: WorkspaceInvitationNotification,
  ) => Effect.Effect<void, WorkspaceInvitationNotificationError>;
}

export class WorkspaceInvitationNotifier extends Context.Service<
  WorkspaceInvitationNotifier,
  WorkspaceInvitationNotifierService
>()("@cove/ports/WorkspaceInvitationNotifier") {}
