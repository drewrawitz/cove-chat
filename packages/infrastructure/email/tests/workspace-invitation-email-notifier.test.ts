import { EmailAddress, WorkspaceName } from "@cove/domain";
import { expect, it } from "@effect/vitest";
import {
  EmailSender,
  WorkspaceInvitationNotifier,
  WorkspaceInvitationToken,
  WorkspaceInvitationTokenValue,
  type EmailMessage,
} from "@cove/ports";
import { Effect, Layer, Queue, Redacted } from "effect";
import { WorkspaceInvitationEmailNotifier } from "../src/index.ts";

it.effect("renders an expiring Workspace invitation through the generic email sender", () =>
  Effect.gen(function* () {
    const sentEmails = yield* Queue.unbounded<EmailMessage>();
    const emailSender = Layer.succeed(
      EmailSender,
      EmailSender.of({
        send: Effect.fn("EmailSender.Test.send")((message) =>
          Queue.offer(sentEmails, message).pipe(Effect.asVoid),
        ),
      }),
    );
    const notifier = WorkspaceInvitationEmailNotifier.layer({
      publicAppUrl: new URL("https://app.cove.test/some-deployment-prefix"),
    }).pipe(Layer.provide(emailSender));

    const email = yield* Effect.gen(function* () {
      const notifications = yield* WorkspaceInvitationNotifier;

      yield* notifications.sendInvitation({
        recipient: EmailAddress.make("new-member@example.com"),
        workspaceName: WorkspaceName.make("Product Studio"),
        token: WorkspaceInvitationToken.make(
          Redacted.make(WorkspaceInvitationTokenValue.make("invitation-secret"), {
            label: "WorkspaceInvitationToken",
          }),
        ),
        expiresAt: new Date("2026-07-27T20:15:00.000Z"),
      });

      return yield* Queue.take(sentEmails);
    }).pipe(Effect.provide(notifier));

    expect(email).toEqual({
      to: "new-member@example.com",
      subject: "Join Product Studio on Cove",
      text: [
        "You were invited to join Product Studio on Cove:",
        "https://app.cove.test/workspace-invitations/redeem?token=invitation-secret",
        "",
        "This link expires at 2026-07-27T20:15:00.000Z.",
      ].join("\n"),
    });
  }),
);
