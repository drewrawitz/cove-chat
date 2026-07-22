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
import type {
  FullMemberUnavailable,
  WorkspaceUnavailable,
} from "../workspaces/workspace-access.ts";

export const ChannelMaintainerView = Schema.Struct({
  id: WorkspaceIdentityId,
  name: WorkspaceIdentityName,
  avatarUrl: WorkspaceAvatarUrl,
});
export interface ChannelMaintainerView extends Schema.Schema.Type<typeof ChannelMaintainerView> {}

export const ChannelMemberView = ChannelMaintainerView;
export interface ChannelMemberView extends Schema.Schema.Type<typeof ChannelMemberView> {}

export const ChannelView = Schema.Struct({
  channel: Channel,
  maintainer: ChannelMaintainerView,
  hasChannelMembership: Schema.Boolean,
});
export interface ChannelView extends Schema.Schema.Type<typeof ChannelView> {}

export const PrivateChannelAdministrationView = Schema.Struct({
  channel: Channel,
  maintainer: ChannelMaintainerView,
  members: Schema.Array(ChannelMemberView),
  actorHasChannelMembership: Schema.Boolean,
});
export interface PrivateChannelAdministrationView extends Schema.Schema.Type<
  typeof PrivateChannelAdministrationView
> {}

const CreateChannelCommandFields = {
  actorAccountId: UserId,
  workspaceId: WorkspaceId,
  channelId: ChannelId,
  name: ChannelName,
  purpose: ChannelPurpose,
};

export const CreatePublicChannelCommand = Schema.Struct(CreateChannelCommandFields);
export interface CreatePublicChannelCommand extends Schema.Schema.Type<
  typeof CreatePublicChannelCommand
> {}

export const CreatePrivateChannelCommand = Schema.Struct(CreateChannelCommandFields);
export interface CreatePrivateChannelCommand extends Schema.Schema.Type<
  typeof CreatePrivateChannelCommand
> {}

export const AddPrivateChannelMemberCommand = Schema.Struct({
  actorAccountId: UserId,
  workspaceId: WorkspaceId,
  channelId: ChannelId,
  workspaceIdentityId: WorkspaceIdentityId,
});
export interface AddPrivateChannelMemberCommand extends Schema.Schema.Type<
  typeof AddPrivateChannelMemberCommand
> {}

export const JoinPublicChannelCommand = Schema.Struct({
  actorAccountId: UserId,
  workspaceId: WorkspaceId,
  channelId: ChannelId,
});
export interface JoinPublicChannelCommand extends Schema.Schema.Type<
  typeof JoinPublicChannelCommand
> {}

export class ChannelAccessFailure extends Schema.TaggedErrorClass<ChannelAccessFailure>()(
  "Application.ChannelAccessFailure",
  { operation: Schema.String },
) {}

export class ChannelAdministrationForbidden extends Schema.TaggedErrorClass<ChannelAdministrationForbidden>()(
  "Application.ChannelAdministrationForbidden",
  { workspaceId: WorkspaceId },
) {}

export interface ChannelAccessService {
  readonly listPublicForActor: (
    actorAccountId: UserId,
    workspaceId: WorkspaceId,
  ) => Effect.Effect<ReadonlyArray<ChannelView>, WorkspaceUnavailable | ChannelAccessFailure>;
  readonly getPublicForActor: (
    actorAccountId: UserId,
    workspaceId: WorkspaceId,
    channelId: ChannelId,
  ) => Effect.Effect<ChannelView, ChannelUnavailable | ChannelAccessFailure>;
  readonly getForActor: (
    actorAccountId: UserId,
    workspaceId: WorkspaceId,
    channelId: ChannelId,
  ) => Effect.Effect<ChannelView, ChannelUnavailable | ChannelAccessFailure>;
  readonly createPublic: (
    command: CreatePublicChannelCommand,
  ) => Effect.Effect<ChannelView, WorkspaceUnavailable | ChannelAccessFailure>;
  readonly createPrivate: (
    command: CreatePrivateChannelCommand,
  ) => Effect.Effect<ChannelView, WorkspaceUnavailable | ChannelAccessFailure>;
  readonly addPrivateMember: (
    command: AddPrivateChannelMemberCommand,
  ) => Effect.Effect<
    PrivateChannelAdministrationView,
    ChannelAccessFailure | ChannelUnavailable | FullMemberUnavailable | WorkspaceUnavailable
  >;
  readonly listPrivateForActor: (
    actorAccountId: UserId,
    workspaceId: WorkspaceId,
  ) => Effect.Effect<ReadonlyArray<ChannelView>, ChannelAccessFailure | WorkspaceUnavailable>;
  readonly listPrivateMemberCandidatesForActor: (
    actorAccountId: UserId,
    workspaceId: WorkspaceId,
    channelId: ChannelId,
  ) => Effect.Effect<ReadonlyArray<ChannelMemberView>, ChannelAccessFailure | ChannelUnavailable>;
  readonly listPrivateForAdministrator: (
    actorAccountId: UserId,
    workspaceId: WorkspaceId,
  ) => Effect.Effect<
    ReadonlyArray<PrivateChannelAdministrationView>,
    ChannelAccessFailure | ChannelAdministrationForbidden | WorkspaceUnavailable
  >;
  readonly getPrivateAdministrationForActor: (
    actorAccountId: UserId,
    workspaceId: WorkspaceId,
    channelId: ChannelId,
  ) => Effect.Effect<PrivateChannelAdministrationView, ChannelAccessFailure | ChannelUnavailable>;
  readonly joinPublic: (
    command: JoinPublicChannelCommand,
  ) => Effect.Effect<ChannelView, ChannelUnavailable | ChannelAccessFailure>;
}

export class ChannelAccess extends Context.Service<ChannelAccess, ChannelAccessService>()(
  "@cove/application/ChannelAccess",
) {}
