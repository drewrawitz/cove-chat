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

export const GENERAL_CHANNEL_ID = ChannelId.make("general");
export const GENERAL_CHANNEL_NAME = ChannelName.make("general");
export const GENERAL_CHANNEL_PURPOSE = ChannelPurpose.make(
  "A shared place for workspace-wide topics.",
);

export function makeGeneralChannel(
  workspaceId: WorkspaceId,
  maintainerIdentityId: WorkspaceIdentityId,
): Channel {
  return Channel.make({
    id: GENERAL_CHANNEL_ID,
    workspaceId,
    name: GENERAL_CHANNEL_NAME,
    purpose: GENERAL_CHANNEL_PURPOSE,
    visibility: "public",
    maintainerIdentityId,
  });
}
