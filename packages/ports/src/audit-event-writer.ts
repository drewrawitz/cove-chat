import type { UserId } from "@cove/domain";
import { Context, type Effect } from "effect";
import type { PersistenceError } from "./persistence-error.ts";

export interface SignInAuditEvent {
  readonly actorId: UserId;
  readonly occurredAt: Date;
}

export interface AuditEventWriterService {
  readonly writeSignIn: (event: SignInAuditEvent) => Effect.Effect<void, PersistenceError>;
}

export class AuditEventWriter extends Context.Service<AuditEventWriter, AuditEventWriterService>()(
  "@cove/ports/AuditEventWriter",
) {}
