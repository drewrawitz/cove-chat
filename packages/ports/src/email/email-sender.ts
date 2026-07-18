import type { EmailAddress } from "@cove/domain";
import { Context, type Effect, Schema } from "effect";

export interface EmailMessage {
  readonly to: EmailAddress;
  readonly subject: string;
  readonly text: string;
}

export class EmailDeliveryError extends Schema.TaggedErrorClass<EmailDeliveryError>()(
  "Ports.EmailDeliveryError",
  {
    cause: Schema.Defect(),
  },
) {}

export interface EmailSenderService {
  readonly send: (message: EmailMessage) => Effect.Effect<void, EmailDeliveryError>;
}

export class EmailSender extends Context.Service<EmailSender, EmailSenderService>()(
  "@cove/ports/EmailSender",
) {}
