import type { User } from "@cove/domain";
import {
  MagicLinkRepository,
  MagicLinkToken,
  TransactionManager,
  type SessionCredentials,
} from "@cove/ports";
import { Effect, Option, Schema } from "effect";
import { IssueSessionInput, issueSession } from "./issue-session.ts";

export const VerifyMagicLinkInput = Schema.Struct({
  token: MagicLinkToken,
});

export interface VerifyMagicLinkInput extends Schema.Schema.Type<typeof VerifyMagicLinkInput> {}

export interface AuthenticatedSession {
  readonly user: User;
  readonly session: SessionCredentials;
}

export class InvalidMagicLink extends Schema.TaggedErrorClass<InvalidMagicLink>()(
  "Application.InvalidMagicLink",
  {},
) {}

export const verifyMagicLink = Effect.fn("Application.verifyMagicLink")(function* (
  input: VerifyMagicLinkInput,
) {
  const magicLinks = yield* MagicLinkRepository;
  const transactions = yield* TransactionManager;

  return yield* transactions.run(
    Effect.gen(function* () {
      const user = yield* magicLinks.consume(input.token);

      if (Option.isNone(user)) {
        return yield* Effect.fail(new InvalidMagicLink());
      }

      const session = yield* issueSession(
        IssueSessionInput.make({
          userId: user.value.id,
          authenticationMethod: "magic_link",
        }),
      );

      return { user: user.value, session } satisfies AuthenticatedSession;
    }),
  );
});
