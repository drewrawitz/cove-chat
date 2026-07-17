import type { UserId } from "@cove/domain";
import { AuditEventWriter, SessionRepository, TransactionManager } from "@cove/ports";
import { Clock, Effect } from "effect";

const SESSION_LIFETIME_MILLIS = 30 * 24 * 60 * 60 * 1_000;

export const issueSession = Effect.fn("Application.issueSession")(function* (userId: UserId) {
  const auditEvents = yield* AuditEventWriter;
  const sessions = yield* SessionRepository;
  const transactions = yield* TransactionManager;

  return yield* transactions.run(
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      const session = yield* sessions.create(userId, new Date(now + SESSION_LIFETIME_MILLIS));

      yield* auditEvents.writeSignIn({
        actorId: userId,
        occurredAt: new Date(now),
      });

      return session;
    }),
  );
});
