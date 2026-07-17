import type { EmailAddress } from "@cove/domain";
import { Context, type Effect, Schema } from "effect";
import type { MagicLinkToken } from "./tokens.ts";

export interface MagicLinkMessage {
  readonly recipient: EmailAddress;
  readonly token: MagicLinkToken;
  readonly expiresAt: Date;
}

export class MagicLinkDeliveryError extends Schema.TaggedErrorClass<MagicLinkDeliveryError>()(
  "Ports.MagicLinkDeliveryError",
  {
    cause: Schema.Defect(),
  },
) {}

export interface MagicLinkDeliveryService {
  readonly send: (message: MagicLinkMessage) => Effect.Effect<void, MagicLinkDeliveryError>;
}

export class MagicLinkDelivery extends Context.Service<
  MagicLinkDelivery,
  MagicLinkDeliveryService
>()("@cove/ports/MagicLinkDelivery") {}
