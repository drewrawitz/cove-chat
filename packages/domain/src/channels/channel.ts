import { Schema } from "effect";
import { ChannelId, WorkspaceId, WorkspaceIdentityId } from "../identifiers.ts";
import { ChannelName } from "./channel-name.ts";
import { ChannelPurpose } from "./channel-purpose.ts";

export const ChannelVisibility = Schema.Literals(["public", "private"]);
export type ChannelVisibility = typeof ChannelVisibility.Type;

export const Channel = Schema.Struct({
  id: ChannelId,
  workspaceId: WorkspaceId,
  name: ChannelName,
  purpose: ChannelPurpose,
  visibility: ChannelVisibility,
  maintainerIdentityId: WorkspaceIdentityId,
});

export interface Channel extends Schema.Schema.Type<typeof Channel> {}
