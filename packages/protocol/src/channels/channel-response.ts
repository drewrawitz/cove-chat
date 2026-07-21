import { Schema } from "effect";

export const ChannelStewardResponse = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  avatarUrl: Schema.String,
}).annotate({ identifier: "ChannelStewardResponse" });
export interface ChannelStewardResponse extends Schema.Schema.Type<typeof ChannelStewardResponse> {}

export const PublicChannelResponse = Schema.Struct({
  id: Schema.String,
  workspaceId: Schema.String,
  name: Schema.String,
  purpose: Schema.String,
  visibility: Schema.Literal("public"),
  steward: ChannelStewardResponse,
  hasChannelMembership: Schema.Boolean,
}).annotate({ identifier: "PublicChannelResponse" });
export interface PublicChannelResponse extends Schema.Schema.Type<typeof PublicChannelResponse> {}

export const PublicChannelListResponse = Schema.Struct({
  channels: Schema.Array(PublicChannelResponse),
}).annotate({ identifier: "PublicChannelListResponse" });
export interface PublicChannelListResponse extends Schema.Schema.Type<
  typeof PublicChannelListResponse
> {}

export const ChannelStewardListResponse = Schema.Struct({
  stewards: Schema.Array(ChannelStewardResponse),
}).annotate({ identifier: "ChannelStewardListResponse" });
export interface ChannelStewardListResponse extends Schema.Schema.Type<
  typeof ChannelStewardListResponse
> {}
