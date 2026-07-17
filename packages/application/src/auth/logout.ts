import { SessionRepository, type CsrfToken, type SessionToken } from "@cove/ports";
import { Effect, Schema } from "effect";

export class InvalidCsrfToken extends Schema.TaggedErrorClass<InvalidCsrfToken>()(
  "Application.InvalidCsrfToken",
  {},
) {}

export const logout = Effect.fn("Application.logout")(function* (
  token: SessionToken,
  csrfToken: CsrfToken,
) {
  const sessions = yield* SessionRepository;
  const revoked = yield* sessions.revoke(token, csrfToken);

  if (!revoked) {
    return yield* Effect.fail(new InvalidCsrfToken());
  }
});
