import type {
  ChannelMembershipRosterView,
  ChannelMaintainerView,
  ChannelMemberView,
  ChannelView,
} from "@cove/application";
import {
  ChannelMembershipRosterResponse,
  ChannelMemberCandidateListResponse,
  ChannelMemberResponse,
  ChannelMaintainerResponse,
  ChannelResponse,
  PrivateChannelAdministrationListResponse,
  PrivateChannelAdministrationResponse,
  PrivateChannelListResponse,
  PrivateChannelResponse,
  PublicChannelListResponse,
  PublicChannelResponse,
} from "@cove/protocol";

const channelMaintainerResponse = (maintainer: ChannelMaintainerView): ChannelMaintainerResponse =>
  ChannelMaintainerResponse.make({
    id: maintainer.id,
    name: maintainer.name,
    avatarUrl: maintainer.avatarUrl,
  });

const channelMemberResponse = (member: ChannelMemberView): ChannelMemberResponse =>
  ChannelMemberResponse.make({
    id: member.id,
    name: member.name,
    avatarUrl: member.avatarUrl,
  });

const channelViewFields = (view: Pick<ChannelView, "channel" | "maintainer">) => ({
  id: view.channel.id,
  workspaceId: view.channel.workspaceId,
  name: view.channel.name,
  purpose: view.channel.purpose,
  maintainer: channelMaintainerResponse(view.maintainer),
});

export const publicChannelResponse = (view: ChannelView): PublicChannelResponse =>
  PublicChannelResponse.make({
    ...channelViewFields(view),
    visibility: "public",
    hasChannelMembership: view.hasChannelMembership,
  });

export const publicChannelListResponse = (
  channels: ReadonlyArray<ChannelView>,
): PublicChannelListResponse =>
  PublicChannelListResponse.make({ channels: channels.map(publicChannelResponse) });

export const channelResponse = (view: ChannelView): ChannelResponse =>
  ChannelResponse.make({
    ...channelViewFields(view),
    visibility: view.channel.visibility,
    hasChannelMembership: view.hasChannelMembership,
  });

export const privateChannelListResponse = (
  channels: ReadonlyArray<ChannelView>,
): PrivateChannelListResponse =>
  PrivateChannelListResponse.make({
    channels: channels.map((view) =>
      PrivateChannelResponse.make({
        ...channelViewFields(view),
        visibility: "private",
        hasChannelMembership: view.hasChannelMembership,
      }),
    ),
  });

export const channelMemberCandidateListResponse = (
  members: ReadonlyArray<ChannelMemberView>,
): ChannelMemberCandidateListResponse =>
  ChannelMemberCandidateListResponse.make({
    members: members.map(channelMemberResponse),
  });

const channelMembershipRosterResponseFields = (view: ChannelMembershipRosterView) => ({
  ...channelViewFields(view),
  members: view.members.map(channelMemberResponse),
  actorHasChannelMembership: view.actorHasChannelMembership,
});

export const channelMembershipRosterResponse = (
  view: ChannelMembershipRosterView,
): ChannelMembershipRosterResponse =>
  ChannelMembershipRosterResponse.make({
    ...channelMembershipRosterResponseFields(view),
    visibility: view.channel.visibility,
  });

const privateChannelAdministrationResponse = (
  view: ChannelMembershipRosterView,
): PrivateChannelAdministrationResponse =>
  PrivateChannelAdministrationResponse.make({
    ...channelMembershipRosterResponseFields(view),
    visibility: "private",
  });

export const privateChannelAdministrationListResponse = (
  channels: ReadonlyArray<ChannelMembershipRosterView>,
): PrivateChannelAdministrationListResponse =>
  PrivateChannelAdministrationListResponse.make({
    channels: channels.map(privateChannelAdministrationResponse),
  });
