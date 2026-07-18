import { AuditEvent, AuditEventWriter } from "@cove/ports";
import { Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { randomUUID } from "node:crypto";
import { persistenceError } from "../persistence-error.ts";

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  return AuditEventWriter.of({
    append: Effect.fn("PostgresAuditEventWriter.append")((event) =>
      AuditEvent.match(event, {
        "authentication.sign_in": ({ actorId, metadata, occurredAt, type, version }) =>
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
      }),
    ),
  });
});

export const PostgresAuditEventWriter = Layer.effect(AuditEventWriter, make);
