import { AuthenticationMethod, UserId, WorkspaceId, WorkspaceIdentityId } from "@cove/domain";
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

export const WorkspaceMembershipEndedAuditMetadata = Schema.Struct({
  workspaceId: WorkspaceId,
  workspaceIdentityId: WorkspaceIdentityId,
});

export interface WorkspaceMembershipEndedAuditMetadata extends Schema.Schema.Type<
  typeof WorkspaceMembershipEndedAuditMetadata
> {}

export const WorkspaceMembershipEndedAuditEvent = Schema.Struct({
  type: Schema.tag("workspace.membership_ended"),
  version: Schema.Literals([1]),
  actorId: UserId,
  occurredAt: Schema.Date,
  metadata: WorkspaceMembershipEndedAuditMetadata,
});

export interface WorkspaceMembershipEndedAuditEvent extends Schema.Schema.Type<
  typeof WorkspaceMembershipEndedAuditEvent
> {}

export const AuditEvent = Schema.Union([
  AuthenticationSignInAuditEvent,
  WorkspaceMembershipEndedAuditEvent,
]).pipe(Schema.toTaggedUnion("type"));

export type AuditEvent = typeof AuditEvent.Type;

export interface AuditEventWriterService {
  readonly append: (event: AuditEvent) => Effect.Effect<void, PersistenceError>;
}

export class AuditEventWriter extends Context.Service<AuditEventWriter, AuditEventWriterService>()(
  "@cove/ports/AuditEventWriter",
) {}
