import type {
  ChannelMaintainerView,
  ChannelMemberView,
  ChannelView,
  PrivateChannelAdministrationView,
} from "@cove/application";
import {
  ChannelMemberResponse,
  ChannelMaintainerResponse,
  ChannelResponse,
  PrivateChannelAdministrationListResponse,
  PrivateChannelAdministrationResponse,
  PrivateChannelListResponse,
  PrivateChannelMemberCandidateListResponse,
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

export const publicChannelResponse = (view: ChannelView): PublicChannelResponse =>
  PublicChannelResponse.make({
    id: view.channel.id,
    workspaceId: view.channel.workspaceId,
    name: view.channel.name,
    purpose: view.channel.purpose,
    visibility: "public",
    maintainer: channelMaintainerResponse(view.maintainer),
    hasChannelMembership: view.hasChannelMembership,
  });

export const publicChannelListResponse = (
  channels: ReadonlyArray<ChannelView>,
): PublicChannelListResponse =>
  PublicChannelListResponse.make({ channels: channels.map(publicChannelResponse) });

export const channelResponse = (view: ChannelView): ChannelResponse =>
  ChannelResponse.make({
    id: view.channel.id,
    workspaceId: view.channel.workspaceId,
    name: view.channel.name,
    purpose: view.channel.purpose,
    visibility: view.channel.visibility,
    maintainer: channelMaintainerResponse(view.maintainer),
    hasChannelMembership: view.hasChannelMembership,
  });

export const privateChannelListResponse = (
  channels: ReadonlyArray<ChannelView>,
): PrivateChannelListResponse =>
  PrivateChannelListResponse.make({
    channels: channels.map((view) =>
      PrivateChannelResponse.make({
        id: view.channel.id,
        workspaceId: view.channel.workspaceId,
        name: view.channel.name,
        purpose: view.channel.purpose,
        visibility: "private",
        maintainer: channelMaintainerResponse(view.maintainer),
        hasChannelMembership: view.hasChannelMembership,
      }),
    ),
  });

export const privateChannelMemberCandidateListResponse = (
  members: ReadonlyArray<ChannelMemberView>,
): PrivateChannelMemberCandidateListResponse =>
  PrivateChannelMemberCandidateListResponse.make({
    members: members.map(channelMemberResponse),
  });

export const privateChannelAdministrationResponse = (
  view: PrivateChannelAdministrationView,
): PrivateChannelAdministrationResponse =>
  PrivateChannelAdministrationResponse.make({
    id: view.channel.id,
    workspaceId: view.channel.workspaceId,
    name: view.channel.name,
    purpose: view.channel.purpose,
    visibility: "private",
    maintainer: channelMaintainerResponse(view.maintainer),
    members: view.members.map(channelMemberResponse),
    actorHasChannelMembership: view.actorHasChannelMembership,
  });

export const privateChannelAdministrationListResponse = (
  channels: ReadonlyArray<PrivateChannelAdministrationView>,
): PrivateChannelAdministrationListResponse =>
  PrivateChannelAdministrationListResponse.make({
    channels: channels.map(privateChannelAdministrationResponse),
  });
