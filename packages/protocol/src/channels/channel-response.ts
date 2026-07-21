import { Schema } from "effect";

export const ChannelMaintainerResponse = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  avatarUrl: Schema.String,
}).annotate({ identifier: "ChannelMaintainerResponse" });
export interface ChannelMaintainerResponse extends Schema.Schema.Type<
  typeof ChannelMaintainerResponse
> {}

export const PublicChannelResponse = Schema.Struct({
  id: Schema.String,
  workspaceId: Schema.String,
  name: Schema.String,
  purpose: Schema.String,
  visibility: Schema.Literal("public"),
  maintainer: ChannelMaintainerResponse,
  hasChannelMembership: Schema.Boolean,
}).annotate({ identifier: "PublicChannelResponse" });
export interface PublicChannelResponse extends Schema.Schema.Type<typeof PublicChannelResponse> {}

export const PublicChannelListResponse = Schema.Struct({
  channels: Schema.Array(PublicChannelResponse),
}).annotate({ identifier: "PublicChannelListResponse" });
export interface PublicChannelListResponse extends Schema.Schema.Type<
  typeof PublicChannelListResponse
> {}

export const ChannelMaintainerListResponse = Schema.Struct({
  maintainers: Schema.Array(ChannelMaintainerResponse),
}).annotate({ identifier: "ChannelMaintainerListResponse" });
export interface ChannelMaintainerListResponse extends Schema.Schema.Type<
  typeof ChannelMaintainerListResponse
> {}
