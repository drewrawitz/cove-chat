import { AuthenticationNotificationError, AuthenticationNotifier, EmailSender } from "@cove/ports";
import { Effect, Layer, Redacted } from "effect";

export interface AuthenticationEmailNotifierOptions {
  readonly publicWebOrigin: URL;
}

export const layer = ({ publicWebOrigin }: AuthenticationEmailNotifierOptions) =>
  Layer.effect(
    AuthenticationNotifier,
    Effect.gen(function* () {
      const emails = yield* EmailSender;

      return AuthenticationNotifier.of({
        sendMagicLink: Effect.fn("AuthenticationEmailNotifier.sendMagicLink")(
          ({ expiresAt, recipient, token }) => {
            const verifyUrl = new URL("/auth/verify", publicWebOrigin);
            verifyUrl.searchParams.set("token", Redacted.value(token));

            return emails
              .send({
                to: recipient,
                subject: "Sign in to Cove",
                text: [
                  "Sign in to Cove:",
                  verifyUrl.href,
                  "",
                  `This link expires at ${expiresAt.toISOString()}.`,
                ].join("\n"),
              })
              .pipe(Effect.mapError((cause) => new AuthenticationNotificationError({ cause })));
          },
        ),
      });
    }),
  );

export * as AuthenticationEmailNotifier from "./authentication-email-notifier.ts";
