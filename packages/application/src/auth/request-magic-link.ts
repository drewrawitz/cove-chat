import { EmailAddress } from "@cove/domain";
import { AuthenticationNotifier, MagicLinkRepository, UserRepository } from "@cove/ports";
import { Clock, Effect, Option, Schema } from "effect";

const MAGIC_LINK_LIFETIME_MILLIS = 15 * 60 * 1_000;

export const RequestMagicLinkInput = Schema.Struct({
  email: EmailAddress,
});

export interface RequestMagicLinkInput extends Schema.Schema.Type<typeof RequestMagicLinkInput> {}

export const requestMagicLink = Effect.fn("Application.requestMagicLink")(function* (
  input: RequestMagicLinkInput,
) {
  const users = yield* UserRepository;
  const magicLinks = yield* MagicLinkRepository;
  const notifications = yield* AuthenticationNotifier;
  const user = yield* users.findByEmail(input.email);

  if (Option.isNone(user)) {
    return;
  }

  const now = yield* Clock.currentTimeMillis;
  const expiresAt = new Date(now + MAGIC_LINK_LIFETIME_MILLIS);
  const token = yield* magicLinks.issue(user.value.id, expiresAt);

  yield* notifications.sendMagicLink({
    recipient: user.value.email,
    token,
    expiresAt,
  });
});
