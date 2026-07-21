import { type SessionCredentials, TransactionManager } from "@cove/ports";
import { Effect } from "effect";
import { IssueSessionInput, issueSession } from "../auth/issue-session.ts";
import {
  type RedeemWorkspaceInvitationCommand,
  type WorkspaceInvitationRedeemed,
  WorkspaceAccess,
} from "./workspace-access.ts";

export interface AuthenticatedWorkspaceInvitation {
  readonly invitation: WorkspaceInvitationRedeemed;
  readonly session: SessionCredentials;
}

export const redeemWorkspaceInvitation = Effect.fn("Application.redeemWorkspaceInvitation")(
  function* (command: RedeemWorkspaceInvitationCommand) {
    const transactions = yield* TransactionManager;
    const workspaces = yield* WorkspaceAccess;

    return yield* transactions.run(
      Effect.gen(function* () {
        const invitation = yield* workspaces.redeemInvitation(command);
        const session = yield* issueSession(
          IssueSessionInput.make({
            userId: invitation.account.id,
            authenticationMethod: "workspace_invitation",
          }),
        );

        return { invitation, session } satisfies AuthenticatedWorkspaceInvitation;
      }),
    );
  },
);
