import { AuditEvent, AuditEventWriter } from "@cove/ports";
import { Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { randomUUID } from "node:crypto";
import { persistenceError } from "../persistence-error.ts";

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const appendEvent = Effect.fn("PostgresAuditEventWriter.appendEvent")(
    ({ actorId, metadata, occurredAt, type, version }: AuditEvent) =>
      sql`
      INSERT INTO audit_events (
        id,
        event_type,
        event_version,
        actor_user_id,
        occurred_at,
        metadata
      )
      VALUES (
        ${randomUUID()},
        ${type},
        ${version},
        ${actorId},
        ${occurredAt},
        ${JSON.stringify(metadata)}::jsonb
      )
      `.pipe(
        Effect.asVoid,
        Effect.mapError((cause) => persistenceError("AuditEventWriter.append", cause)),
      ),
  );

  return AuditEventWriter.of({
    append: Effect.fn("PostgresAuditEventWriter.append")((event) =>
      AuditEvent.match(event, {
        "authentication.sign_in": appendEvent,
      }),
    ),
  });
});

export const PostgresAuditEventWriter = Layer.effect(AuditEventWriter, make);
