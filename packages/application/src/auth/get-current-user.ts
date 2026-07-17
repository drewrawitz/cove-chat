import { SessionRepository, type SessionToken } from "@cove/ports";
import { Effect, Option, Schema } from "effect";

export class Unauthenticated extends Schema.TaggedErrorClass<Unauthenticated>()(
  "Application.Unauthenticated",
  {},
) {}

export const getCurrentUser = Effect.fn("Application.getCurrentUser")(function* (
  token: SessionToken,
) {
  const sessions = yield* SessionRepository;
  const user = yield* sessions.findCurrentUser(token);

  if (Option.isNone(user)) {
    return yield* Effect.fail(new Unauthenticated());
  }

  return user.value;
});
