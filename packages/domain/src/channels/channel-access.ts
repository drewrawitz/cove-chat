import { Schema } from "effect";
import { ChannelVisibility } from "./channel.ts";

export const ChannelMembershipFacts = Schema.Struct({
  isWorkspaceMember: Schema.Boolean,
  isChannelMember: Schema.Boolean,
});

export interface ChannelMembershipFacts extends Schema.Schema.Type<typeof ChannelMembershipFacts> {}

export const ChannelAccessFacts = Schema.Struct({
  visibility: ChannelVisibility,
  ...ChannelMembershipFacts.fields,
});

export interface ChannelAccessFacts extends Schema.Schema.Type<typeof ChannelAccessFacts> {}

export function canViewChannel(facts: ChannelAccessFacts): boolean {
  return facts.isWorkspaceMember && (facts.visibility === "public" || facts.isChannelMember);
}
