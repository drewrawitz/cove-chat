import { AuditEventWriter } from "@cove/ports";
import { Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { randomUUID } from "node:crypto";
import { persistenceError } from "../persistence-error.ts";

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  return AuditEventWriter.of({
    writeSignIn: Effect.fn("PostgresAuditEventWriter.writeSignIn")(({ actorId, occurredAt }) =>
      sql`
        INSERT INTO audit_events (id, event_type, actor_user_id, occurred_at)
        VALUES (${randomUUID()}, 'authentication.sign_in', ${actorId}, ${occurredAt})
      `.pipe(
        Effect.asVoid,
        Effect.mapError((cause) => persistenceError("AuditEventWriter.writeSignIn", cause)),
      ),
    ),
  });
});

export const PostgresAuditEventWriter = Layer.effect(AuditEventWriter, make);
