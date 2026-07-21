import {
  Channel,
  ChannelId,
  ChannelName,
  ChannelPurpose,
  UserId,
  WorkspaceAvatarUrl,
  WorkspaceId,
  WorkspaceIdentityId,
  WorkspaceIdentityName,
} from "@cove/domain";
import { Context, type Effect, Schema } from "effect";
import { ChannelUnavailable } from "./get-channel-for-actor.ts";
import type { WorkspaceUnavailable } from "../workspaces/workspace-access.ts";

export const ChannelMaintainerView = Schema.Struct({
  id: WorkspaceIdentityId,
  name: WorkspaceIdentityName,
  avatarUrl: WorkspaceAvatarUrl,
});
export interface ChannelMaintainerView extends Schema.Schema.Type<typeof ChannelMaintainerView> {}

export const PublicChannelView = Schema.Struct({
  channel: Channel,
  maintainer: ChannelMaintainerView,
  hasChannelMembership: Schema.Boolean,
});
export interface PublicChannelView extends Schema.Schema.Type<typeof PublicChannelView> {}

export const CreatePublicChannelCommand = Schema.Struct({
  actorAccountId: UserId,
  workspaceId: WorkspaceId,
  channelId: ChannelId,
  name: ChannelName,
  purpose: ChannelPurpose,
  maintainerIdentityId: WorkspaceIdentityId,
});
export interface CreatePublicChannelCommand extends Schema.Schema.Type<
  typeof CreatePublicChannelCommand
> {}

export const JoinPublicChannelCommand = Schema.Struct({
  actorAccountId: UserId,
  workspaceId: WorkspaceId,
  channelId: ChannelId,
});
export interface JoinPublicChannelCommand extends Schema.Schema.Type<
  typeof JoinPublicChannelCommand
> {}

export class ChannelMaintainerUnavailable extends Schema.TaggedErrorClass<ChannelMaintainerUnavailable>()(
  "Application.ChannelMaintainerUnavailable",
  { workspaceId: WorkspaceId, maintainerIdentityId: WorkspaceIdentityId },
) {}

export class ChannelAccessFailure extends Schema.TaggedErrorClass<ChannelAccessFailure>()(
  "Application.ChannelAccessFailure",
  { operation: Schema.String },
) {}

export interface ChannelAccessService {
  readonly listPublicForActor: (
    actorAccountId: UserId,
    workspaceId: WorkspaceId,
  ) => Effect.Effect<ReadonlyArray<PublicChannelView>, WorkspaceUnavailable | ChannelAccessFailure>;
  readonly listMaintainersForActor: (
    actorAccountId: UserId,
    workspaceId: WorkspaceId,
  ) => Effect.Effect<
    ReadonlyArray<ChannelMaintainerView>,
    WorkspaceUnavailable | ChannelAccessFailure
  >;
  readonly getPublicForActor: (
    actorAccountId: UserId,
    workspaceId: WorkspaceId,
    channelId: ChannelId,
  ) => Effect.Effect<PublicChannelView, ChannelUnavailable | ChannelAccessFailure>;
  readonly createPublic: (
    command: CreatePublicChannelCommand,
  ) => Effect.Effect<
    PublicChannelView,
    WorkspaceUnavailable | ChannelMaintainerUnavailable | ChannelAccessFailure
  >;
  readonly joinPublic: (
    command: JoinPublicChannelCommand,
  ) => Effect.Effect<PublicChannelView, ChannelUnavailable | ChannelAccessFailure>;
}

export class ChannelAccess extends Context.Service<ChannelAccess, ChannelAccessService>()(
  "@cove/application/ChannelAccess",
) {}
