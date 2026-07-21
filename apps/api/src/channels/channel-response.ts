import type { ChannelStewardView, PublicChannelView } from "@cove/application";
import {
  ChannelStewardListResponse,
  ChannelStewardResponse,
  PublicChannelListResponse,
  PublicChannelResponse,
} from "@cove/protocol";

const channelStewardResponse = (steward: ChannelStewardView): ChannelStewardResponse =>
  ChannelStewardResponse.make({
    id: steward.id,
    name: steward.name,
    avatarUrl: steward.avatarUrl,
  });

export const publicChannelResponse = (view: PublicChannelView): PublicChannelResponse =>
  PublicChannelResponse.make({
    id: view.channel.id,
    workspaceId: view.channel.workspaceId,
    name: view.channel.name,
    purpose: view.channel.purpose,
    visibility: "public",
    steward: channelStewardResponse(view.steward),
    hasChannelMembership: view.hasChannelMembership,
  });

export const publicChannelListResponse = (
  channels: ReadonlyArray<PublicChannelView>,
): PublicChannelListResponse =>
  PublicChannelListResponse.make({ channels: channels.map(publicChannelResponse) });

export const channelStewardListResponse = (
  stewards: ReadonlyArray<ChannelStewardView>,
): ChannelStewardListResponse =>
  ChannelStewardListResponse.make({ stewards: stewards.map(channelStewardResponse) });
