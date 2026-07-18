import { EmailSender } from "@cove/ports";
import { Effect, Layer } from "effect";

export const ConsoleEmailSender = Layer.succeed(
  EmailSender,
  EmailSender.of({
    send: Effect.fn("ConsoleEmailSender.send")(({ subject, text, to }) =>
      Effect.logWarning("Development transactional email", {
        subject,
        text,
        to,
      }),
    ),
  }),
);
