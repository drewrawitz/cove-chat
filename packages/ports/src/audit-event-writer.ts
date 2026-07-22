import {
  AuthenticationMethod,
  ChannelId,
  UserId,
  WorkspaceId,
  WorkspaceIdentityId,
} from "@cove/domain";
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

const ChannelMembershipAuditMetadataFields = {
  workspaceId: WorkspaceId,
  channelId: ChannelId,
  workspaceIdentityId: WorkspaceIdentityId,
};

export const ChannelPrivateMembershipAddedAuditMetadata = Schema.Struct(
  ChannelMembershipAuditMetadataFields,
);
export interface ChannelPrivateMembershipAddedAuditMetadata extends Schema.Schema.Type<
  typeof ChannelPrivateMembershipAddedAuditMetadata
> {}

export const ChannelPrivateMembershipAddedAuditEvent = Schema.Struct({
  type: Schema.tag("channel.private_membership_added"),
  version: Schema.Literals([1]),
  actorId: UserId,
  occurredAt: Schema.Date,
  metadata: ChannelPrivateMembershipAddedAuditMetadata,
});
export interface ChannelPrivateMembershipAddedAuditEvent extends Schema.Schema.Type<
  typeof ChannelPrivateMembershipAddedAuditEvent
> {}

export const ChannelPublicMembershipAddedAuditMetadata = Schema.Struct(
  ChannelMembershipAuditMetadataFields,
);
export interface ChannelPublicMembershipAddedAuditMetadata extends Schema.Schema.Type<
  typeof ChannelPublicMembershipAddedAuditMetadata
> {}

export const ChannelPublicMembershipAddedAuditEvent = Schema.Struct({
  type: Schema.tag("channel.public_membership_added"),
  version: Schema.Literals([1]),
  actorId: UserId,
  occurredAt: Schema.Date,
  metadata: ChannelPublicMembershipAddedAuditMetadata,
});
export interface ChannelPublicMembershipAddedAuditEvent extends Schema.Schema.Type<
  typeof ChannelPublicMembershipAddedAuditEvent
> {}

export const ChannelPrivateMembershipRemovedAuditMetadata = Schema.Struct(
  ChannelMembershipAuditMetadataFields,
);
export interface ChannelPrivateMembershipRemovedAuditMetadata extends Schema.Schema.Type<
  typeof ChannelPrivateMembershipRemovedAuditMetadata
> {}

export const ChannelPrivateMembershipRemovedAuditEvent = Schema.Struct({
  type: Schema.tag("channel.private_membership_removed"),
  version: Schema.Literals([1]),
  actorId: UserId,
  occurredAt: Schema.Date,
  metadata: ChannelPrivateMembershipRemovedAuditMetadata,
});
export interface ChannelPrivateMembershipRemovedAuditEvent extends Schema.Schema.Type<
  typeof ChannelPrivateMembershipRemovedAuditEvent
> {}

export const ChannelPublicMembershipRemovedAuditMetadata = Schema.Struct(
  ChannelMembershipAuditMetadataFields,
);
export interface ChannelPublicMembershipRemovedAuditMetadata extends Schema.Schema.Type<
  typeof ChannelPublicMembershipRemovedAuditMetadata
> {}

export const ChannelPublicMembershipRemovedAuditEvent = Schema.Struct({
  type: Schema.tag("channel.public_membership_removed"),
  version: Schema.Literals([1]),
  actorId: UserId,
  occurredAt: Schema.Date,
  metadata: ChannelPublicMembershipRemovedAuditMetadata,
});
export interface ChannelPublicMembershipRemovedAuditEvent extends Schema.Schema.Type<
  typeof ChannelPublicMembershipRemovedAuditEvent
> {}

export const AuditEvent = Schema.Union([
  AuthenticationSignInAuditEvent,
  ChannelPrivateMembershipAddedAuditEvent,
  ChannelPublicMembershipAddedAuditEvent,
  ChannelPrivateMembershipRemovedAuditEvent,
  ChannelPublicMembershipRemovedAuditEvent,
]).pipe(Schema.toTaggedUnion("type"));

export type AuditEvent = typeof AuditEvent.Type;

export interface AuditEventWriterService {
  readonly append: (event: AuditEvent) => Effect.Effect<void, PersistenceError>;
}

export class AuditEventWriter extends Context.Service<AuditEventWriter, AuditEventWriterService>()(
  "@cove/ports/AuditEventWriter",
) {}
