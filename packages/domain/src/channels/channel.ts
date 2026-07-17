import { Schema } from "effect";
import { ChannelId, WorkspaceId } from "../identifiers.ts";
import { ChannelName } from "./channel-name.ts";

export const ChannelVisibility = Schema.Literals(["public", "private"]);
export type ChannelVisibility = typeof ChannelVisibility.Type;

export const Channel = Schema.Struct({
  id: ChannelId,
  workspaceId: WorkspaceId,
  name: ChannelName,
  visibility: ChannelVisibility,
});

export interface Channel extends Schema.Schema.Type<typeof Channel> {}
