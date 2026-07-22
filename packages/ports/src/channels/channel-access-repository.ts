import {
  Channel,
  ChannelId,
  UserId,
  WorkspaceAvatarUrl,
  WorkspaceId,
  WorkspaceIdentityId,
  WorkspaceIdentityName,
  WorkspaceRole,
} from "@cove/domain";
import { Context, type Effect, Schema } from "effect";
import type { PersistenceError } from "../persistence-error.ts";

export const ChannelIdentityRecord = Schema.Struct({
  id: WorkspaceIdentityId,
  name: WorkspaceIdentityName,
  avatarUrl: WorkspaceAvatarUrl,
  role: WorkspaceRole,
});
export interface ChannelIdentityRecord extends Schema.Schema.Type<typeof ChannelIdentityRecord> {}

export const ChannelAccessRecord = Schema.Struct({
  channel: Channel,
  maintainer: ChannelIdentityRecord,
  hasChannelMembership: Schema.Boolean,
});
export interface ChannelAccessRecord extends Schema.Schema.Type<typeof ChannelAccessRecord> {}

export interface ChannelAccessRepositoryService {
  readonly readActiveActor: (
    actorAccountId: UserId,
    workspaceId: WorkspaceId,
  ) => Effect.Effect<ChannelIdentityRecord | undefined, PersistenceError>;
  readonly lockActiveActor: (
    actorAccountId: UserId,
    workspaceId: WorkspaceId,
  ) => Effect.Effect<ChannelIdentityRecord | undefined, PersistenceError>;
  readonly lockActiveIdentity: (
    workspaceId: WorkspaceId,
    workspaceIdentityId: WorkspaceIdentityId,
  ) => Effect.Effect<ChannelIdentityRecord | undefined, PersistenceError>;
  readonly listPublic: (
    workspaceId: WorkspaceId,
    actorIdentityId: WorkspaceIdentityId,
  ) => Effect.Effect<ReadonlyArray<ChannelAccessRecord>, PersistenceError>;
  readonly findById: (
    workspaceId: WorkspaceId,
    actorIdentityId: WorkspaceIdentityId,
    channelId: ChannelId,
  ) => Effect.Effect<ChannelAccessRecord | undefined, PersistenceError>;
  readonly listPrivate: (
    workspaceId: WorkspaceId,
    actorIdentityId: WorkspaceIdentityId,
  ) => Effect.Effect<ReadonlyArray<ChannelAccessRecord>, PersistenceError>;
  readonly listMembers: (
    workspaceId: WorkspaceId,
    channelId: ChannelId,
  ) => Effect.Effect<ReadonlyArray<ChannelIdentityRecord>, PersistenceError>;
  readonly listMemberCandidates: (
    workspaceId: WorkspaceId,
    channelId: ChannelId,
  ) => Effect.Effect<ReadonlyArray<ChannelIdentityRecord>, PersistenceError>;
  readonly insert: (channel: Channel) => Effect.Effect<void, PersistenceError>;
  readonly addMembership: (
    workspaceId: WorkspaceId,
    channelId: ChannelId,
    workspaceIdentityId: WorkspaceIdentityId,
  ) => Effect.Effect<boolean, PersistenceError>;
  readonly removeMembership: (
    workspaceId: WorkspaceId,
    channelId: ChannelId,
    workspaceIdentityId: WorkspaceIdentityId,
  ) => Effect.Effect<boolean, PersistenceError>;
}

export class ChannelAccessRepository extends Context.Service<
  ChannelAccessRepository,
  ChannelAccessRepositoryService
>()("@cove/ports/ChannelAccessRepository") {}
