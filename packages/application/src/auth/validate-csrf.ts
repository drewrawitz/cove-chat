import { SessionRepository, type CsrfToken, type SessionToken } from "@cove/ports";
import { Effect } from "effect";
import { InvalidCsrfToken } from "./logout.ts";

export const validateCsrf = Effect.fn("Application.validateCsrf")(function* (
  token: SessionToken,
  csrfToken: CsrfToken,
) {
  const sessions = yield* SessionRepository;
  const valid = yield* sessions.validateCsrf(token, csrfToken);

  if (!valid) {
    return yield* Effect.fail(new InvalidCsrfToken());
  }
});
