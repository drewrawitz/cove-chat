import { EmailAddress } from "@cove/domain";
import { expect, it } from "@effect/vitest";
import {
  AuthenticationNotifier,
  EmailSender,
  MagicLinkToken,
  MagicLinkTokenValue,
  type EmailMessage,
} from "@cove/ports";
import { Effect, Layer, Queue, Redacted } from "effect";
import { AuthenticationEmailNotifier } from "../src/index.ts";

it.effect("renders a magic-link notification through the generic email sender", () =>
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
    const notifier = AuthenticationEmailNotifier.layer({
      publicAppUrl: new URL("https://app.cove.test/some-deployment-prefix"),
    }).pipe(Layer.provide(emailSender));

    const email = yield* Effect.gen(function* () {
      const notifications = yield* AuthenticationNotifier;

      yield* notifications.sendMagicLink({
        recipient: EmailAddress.make("alice@example.com"),
        token: MagicLinkToken.make(
          Redacted.make(MagicLinkTokenValue.make("secret-token"), {
            label: "MagicLinkToken",
          }),
        ),
        expiresAt: new Date("2026-07-17T20:15:00.000Z"),
      });

      return yield* Queue.take(sentEmails);
    }).pipe(Effect.provide(notifier));

    expect(email).toEqual({
      to: "alice@example.com",
      subject: "Sign in to Cove",
      text: [
        "Sign in to Cove:",
        "https://app.cove.test/auth/verify?token=secret-token",
        "",
        "This link expires at 2026-07-17T20:15:00.000Z.",
      ].join("\n"),
    });
  }),
);
