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

export const ChannelMembershipRosterView = Schema.Struct({
  channel: Channel,
  maintainer: ChannelMaintainerView,
  members: Schema.Array(ChannelMemberView),
  actorHasChannelMembership: Schema.Boolean,
});
export interface ChannelMembershipRosterView extends Schema.Schema.Type<
  typeof ChannelMembershipRosterView
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

export const AddChannelMemberCommand = Schema.Struct({
  actorAccountId: UserId,
  workspaceId: WorkspaceId,
  channelId: ChannelId,
  workspaceIdentityId: WorkspaceIdentityId,
});
export interface AddChannelMemberCommand extends Schema.Schema.Type<
  typeof AddChannelMemberCommand
> {}

export const JoinPublicChannelCommand = Schema.Struct({
  actorAccountId: UserId,
  workspaceId: WorkspaceId,
  channelId: ChannelId,
});
export interface JoinPublicChannelCommand extends Schema.Schema.Type<
  typeof JoinPublicChannelCommand
> {}

export const LeaveChannelCommand = Schema.Struct({
  actorAccountId: UserId,
  workspaceId: WorkspaceId,
  channelId: ChannelId,
});
export interface LeaveChannelCommand extends Schema.Schema.Type<typeof LeaveChannelCommand> {}

export class ChannelAccessFailure extends Schema.TaggedErrorClass<ChannelAccessFailure>()(
  "Application.ChannelAccessFailure",
  { operation: Schema.String },
) {}

export class ChannelAdministrationForbidden extends Schema.TaggedErrorClass<ChannelAdministrationForbidden>()(
  "Application.ChannelAdministrationForbidden",
  { workspaceId: WorkspaceId },
) {}

export class ChannelMemberUnavailable extends Schema.TaggedErrorClass<ChannelMemberUnavailable>()(
  "Application.ChannelMemberUnavailable",
  {
    workspaceId: WorkspaceId,
    channelId: ChannelId,
    workspaceIdentityId: WorkspaceIdentityId,
  },
) {}

export class PrivateChannelMaintainerCannotLeave extends Schema.TaggedErrorClass<PrivateChannelMaintainerCannotLeave>()(
  "Application.PrivateChannelMaintainerCannotLeave",
  {
    workspaceId: WorkspaceId,
    channelId: ChannelId,
  },
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
  readonly addMember: (
    command: AddChannelMemberCommand,
  ) => Effect.Effect<
    ChannelMembershipRosterView,
    | ChannelAccessFailure
    | ChannelMemberUnavailable
    | ChannelUnavailable
    | FullMemberUnavailable
    | WorkspaceUnavailable
  >;
  readonly listPrivateForActor: (
    actorAccountId: UserId,
    workspaceId: WorkspaceId,
  ) => Effect.Effect<ReadonlyArray<ChannelView>, ChannelAccessFailure | WorkspaceUnavailable>;
  readonly listMemberCandidatesForActor: (
    actorAccountId: UserId,
    workspaceId: WorkspaceId,
    channelId: ChannelId,
  ) => Effect.Effect<ReadonlyArray<ChannelMemberView>, ChannelAccessFailure | ChannelUnavailable>;
  readonly listPrivateForAdministrator: (
    actorAccountId: UserId,
    workspaceId: WorkspaceId,
  ) => Effect.Effect<
    ReadonlyArray<ChannelMembershipRosterView>,
    ChannelAccessFailure | ChannelAdministrationForbidden | WorkspaceUnavailable
  >;
  readonly getMembershipRosterForActor: (
    actorAccountId: UserId,
    workspaceId: WorkspaceId,
    channelId: ChannelId,
  ) => Effect.Effect<ChannelMembershipRosterView, ChannelAccessFailure | ChannelUnavailable>;
  readonly joinPublic: (
    command: JoinPublicChannelCommand,
  ) => Effect.Effect<ChannelView, ChannelUnavailable | ChannelAccessFailure>;
  readonly leave: (
    command: LeaveChannelCommand,
  ) => Effect.Effect<
    void,
    PrivateChannelMaintainerCannotLeave | ChannelUnavailable | ChannelAccessFailure
  >;
}

export class ChannelAccess extends Context.Service<ChannelAccess, ChannelAccessService>()(
  "@cove/application/ChannelAccess",
) {}
