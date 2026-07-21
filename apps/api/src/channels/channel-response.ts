import type { ChannelMaintainerView, PublicChannelView } from "@cove/application";
import {
  ChannelMaintainerListResponse,
  ChannelMaintainerResponse,
  PublicChannelListResponse,
  PublicChannelResponse,
} from "@cove/protocol";

const channelMaintainerResponse = (maintainer: ChannelMaintainerView): ChannelMaintainerResponse =>
  ChannelMaintainerResponse.make({
    id: maintainer.id,
    name: maintainer.name,
    avatarUrl: maintainer.avatarUrl,
  });

export const publicChannelResponse = (view: PublicChannelView): PublicChannelResponse =>
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
  channels: ReadonlyArray<PublicChannelView>,
): PublicChannelListResponse =>
  PublicChannelListResponse.make({ channels: channels.map(publicChannelResponse) });

export const channelMaintainerListResponse = (
  maintainers: ReadonlyArray<ChannelMaintainerView>,
): ChannelMaintainerListResponse =>
  ChannelMaintainerListResponse.make({
    maintainers: maintainers.map(channelMaintainerResponse),
  });
