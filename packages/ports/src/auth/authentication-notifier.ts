import type { EmailAddress } from "@cove/domain";
import { Context, type Effect, Schema } from "effect";
import type { MagicLinkToken } from "./tokens.ts";

export interface MagicLinkNotification {
  readonly recipient: EmailAddress;
  readonly token: MagicLinkToken;
  readonly expiresAt: Date;
}

export class AuthenticationNotificationError extends Schema.TaggedErrorClass<AuthenticationNotificationError>()(
  "Ports.AuthenticationNotificationError",
  {
    cause: Schema.Defect(),
  },
) {}

export interface AuthenticationNotifierService {
  readonly sendMagicLink: (
    notification: MagicLinkNotification,
  ) => Effect.Effect<void, AuthenticationNotificationError>;
}

export class AuthenticationNotifier extends Context.Service<
  AuthenticationNotifier,
  AuthenticationNotifierService
>()("@cove/ports/AuthenticationNotifier") {}
