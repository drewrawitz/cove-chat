import { AuthenticationMethod, UserId } from "@cove/domain";
import { AuditEvent, AuditEventWriter, SessionRepository, TransactionManager } from "@cove/ports";
import { Clock, Effect, Schema } from "effect";

const SESSION_LIFETIME_MILLIS = 30 * 24 * 60 * 60 * 1_000;

export const IssueSessionInput = Schema.Struct({
  userId: UserId,
  authenticationMethod: AuthenticationMethod,
});

export interface IssueSessionInput extends Schema.Schema.Type<typeof IssueSessionInput> {}

export const issueSession = Effect.fn("Application.issueSession")(function* (
  input: IssueSessionInput,
) {
  const auditEvents = yield* AuditEventWriter;
  const sessions = yield* SessionRepository;
  const transactions = yield* TransactionManager;

  return yield* transactions.run(
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      const session = yield* sessions.create(input.userId, new Date(now + SESSION_LIFETIME_MILLIS));

      yield* auditEvents.append(
        AuditEvent.cases["authentication.sign_in"].make({
          actorId: input.userId,
          occurredAt: new Date(now),
          version: 1,
          metadata: {
            authenticationMethod: input.authenticationMethod,
          },
        }),
      );

      return session;
    }),
  );
});
