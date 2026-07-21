import {
  EmailSender,
  WorkspaceInvitationNotificationError,
  WorkspaceInvitationNotifier,
} from "@cove/ports";
import { Effect, Layer, Redacted } from "effect";

export interface WorkspaceInvitationEmailNotifierOptions {
  readonly publicWebOrigin: URL;
}

export const layer = ({ publicWebOrigin }: WorkspaceInvitationEmailNotifierOptions) =>
  Layer.effect(
    WorkspaceInvitationNotifier,
    Effect.gen(function* () {
      const emails = yield* EmailSender;

      return WorkspaceInvitationNotifier.of({
        sendInvitation: Effect.fn("WorkspaceInvitationEmailNotifier.sendInvitation")(
          ({ expiresAt, recipient, token, workspaceName }) => {
            const redeemUrl = new URL("/workspace-invitations/redeem", publicWebOrigin);
            redeemUrl.searchParams.set("token", Redacted.value(token));

            return emails
              .send({
                to: recipient,
                subject: `Join ${workspaceName} on Cove`,
                text: [
                  `You were invited to join ${workspaceName} on Cove:`,
                  redeemUrl.href,
                  "",
                  `This link expires at ${expiresAt.toISOString()}.`,
                ].join("\n"),
              })
              .pipe(
                Effect.mapError((cause) => new WorkspaceInvitationNotificationError({ cause })),
              );
          },
        ),
      });
    }),
  );

export * as WorkspaceInvitationEmailNotifier from "./workspace-invitation-email-notifier.ts";
