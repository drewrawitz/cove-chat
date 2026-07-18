import { AuthenticationMethod, UserId } from "@cove/domain";
import { Context, type Effect, Schema } from "effect";
import type { PersistenceError } from "./persistence-error.ts";

export const AuthenticationSignInAuditMetadata = Schema.Struct({
  authenticationMethod: AuthenticationMethod,
});

export interface AuthenticationSignInAuditMetadata extends Schema.Schema.Type<
  typeof AuthenticationSignInAuditMetadata
> {}

export const AuthenticationSignInAuditEvent = Schema.Struct({
  type: Schema.tag("authentication.sign_in"),
  version: Schema.Literals([1]),
  actorId: UserId,
  occurredAt: Schema.Date,
  metadata: AuthenticationSignInAuditMetadata,
});

export interface AuthenticationSignInAuditEvent extends Schema.Schema.Type<
  typeof AuthenticationSignInAuditEvent
> {}

export const AuditEvent = Schema.Union([AuthenticationSignInAuditEvent]).pipe(
  Schema.toTaggedUnion("type"),
);

export type AuditEvent = typeof AuditEvent.Type;

export interface AuditEventWriterService {
  readonly append: (event: AuditEvent) => Effect.Effect<void, PersistenceError>;
}

export class AuditEventWriter extends Context.Service<AuditEventWriter, AuditEventWriterService>()(
  "@cove/ports/AuditEventWriter",
) {}
