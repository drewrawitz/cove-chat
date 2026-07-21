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

export const ChannelStewardView = Schema.Struct({
  id: WorkspaceIdentityId,
  name: WorkspaceIdentityName,
  avatarUrl: WorkspaceAvatarUrl,
});
export interface ChannelStewardView extends Schema.Schema.Type<typeof ChannelStewardView> {}

export const PublicChannelView = Schema.Struct({
  channel: Channel,
  steward: ChannelStewardView,
  hasChannelMembership: Schema.Boolean,
});
export interface PublicChannelView extends Schema.Schema.Type<typeof PublicChannelView> {}

export const CreatePublicChannelCommand = Schema.Struct({
  actorAccountId: UserId,
  workspaceId: WorkspaceId,
  channelId: ChannelId,
  name: ChannelName,
  purpose: ChannelPurpose,
  stewardIdentityId: WorkspaceIdentityId,
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

export class ChannelStewardUnavailable extends Schema.TaggedErrorClass<ChannelStewardUnavailable>()(
  "Application.ChannelStewardUnavailable",
  { workspaceId: WorkspaceId, stewardIdentityId: WorkspaceIdentityId },
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
  readonly listStewardsForActor: (
    actorAccountId: UserId,
    workspaceId: WorkspaceId,
  ) => Effect.Effect<
    ReadonlyArray<ChannelStewardView>,
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
    WorkspaceUnavailable | ChannelStewardUnavailable | ChannelAccessFailure
  >;
  readonly joinPublic: (
    command: JoinPublicChannelCommand,
  ) => Effect.Effect<PublicChannelView, ChannelUnavailable | ChannelAccessFailure>;
}

export class ChannelAccess extends Context.Service<ChannelAccess, ChannelAccessService>()(
  "@cove/application/ChannelAccess",
) {}
