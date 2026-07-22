import { Schema } from "effect";

export const ChannelMaintainerResponse = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  avatarUrl: Schema.String,
}).annotate({ identifier: "ChannelMaintainerResponse" });
export interface ChannelMaintainerResponse extends Schema.Schema.Type<
  typeof ChannelMaintainerResponse
> {}

export const ChannelMemberResponse = ChannelMaintainerResponse;
export interface ChannelMemberResponse extends Schema.Schema.Type<typeof ChannelMemberResponse> {}

const ChannelResponseFields = {
  id: Schema.String,
  workspaceId: Schema.String,
  name: Schema.String,
  purpose: Schema.String,
  maintainer: ChannelMaintainerResponse,
  hasChannelMembership: Schema.Boolean,
};

export const PublicChannelResponse = Schema.Struct({
  ...ChannelResponseFields,
  visibility: Schema.Literal("public"),
}).annotate({ identifier: "PublicChannelResponse" });
export interface PublicChannelResponse extends Schema.Schema.Type<typeof PublicChannelResponse> {}

export const ChannelResponse = Schema.Struct({
  ...ChannelResponseFields,
  visibility: Schema.Literals(["public", "private"]),
}).annotate({ identifier: "ChannelResponse" });
export interface ChannelResponse extends Schema.Schema.Type<typeof ChannelResponse> {}

export const PrivateChannelResponse = Schema.Struct({
  ...ChannelResponseFields,
  visibility: Schema.Literal("private"),
}).annotate({ identifier: "PrivateChannelResponse" });
export interface PrivateChannelResponse extends Schema.Schema.Type<typeof PrivateChannelResponse> {}

export const PrivateChannelListResponse = Schema.Struct({
  channels: Schema.Array(PrivateChannelResponse),
}).annotate({ identifier: "PrivateChannelListResponse" });
export interface PrivateChannelListResponse extends Schema.Schema.Type<
  typeof PrivateChannelListResponse
> {}

export const PrivateChannelMemberCandidateListResponse = Schema.Struct({
  members: Schema.Array(ChannelMemberResponse),
}).annotate({ identifier: "PrivateChannelMemberCandidateListResponse" });
export interface PrivateChannelMemberCandidateListResponse extends Schema.Schema.Type<
  typeof PrivateChannelMemberCandidateListResponse
> {}

export const PublicChannelListResponse = Schema.Struct({
  channels: Schema.Array(PublicChannelResponse),
}).annotate({ identifier: "PublicChannelListResponse" });
export interface PublicChannelListResponse extends Schema.Schema.Type<
  typeof PublicChannelListResponse
> {}

export const PrivateChannelAdministrationResponse = Schema.Struct({
  id: Schema.String,
  workspaceId: Schema.String,
  name: Schema.String,
  purpose: Schema.String,
  visibility: Schema.Literal("private"),
  maintainer: ChannelMaintainerResponse,
  members: Schema.Array(ChannelMemberResponse),
  actorHasChannelMembership: Schema.Boolean,
}).annotate({ identifier: "PrivateChannelAdministrationResponse" });
export interface PrivateChannelAdministrationResponse extends Schema.Schema.Type<
  typeof PrivateChannelAdministrationResponse
> {}

export const PrivateChannelAdministrationListResponse = Schema.Struct({
  channels: Schema.Array(PrivateChannelAdministrationResponse),
}).annotate({ identifier: "PrivateChannelAdministrationListResponse" });
export interface PrivateChannelAdministrationListResponse extends Schema.Schema.Type<
  typeof PrivateChannelAdministrationListResponse
> {}
