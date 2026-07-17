import { Schema } from "effect";

export const ChannelName = Schema.Trim.check(Schema.isNonEmpty()).pipe(Schema.brand("ChannelName"));
export type ChannelName = typeof ChannelName.Type;

export const ChannelVisibility = Schema.Literals(["public", "private"]);
export type ChannelVisibility = typeof ChannelVisibility.Type;

export const ChannelAccessFacts = Schema.Struct({
  visibility: ChannelVisibility,
  isWorkspaceMember: Schema.Boolean,
  isChannelMember: Schema.Boolean,
});

export interface ChannelAccessFacts extends Schema.Schema.Type<typeof ChannelAccessFacts> {}

export function canViewChannel(facts: ChannelAccessFacts): boolean {
  return facts.isWorkspaceMember && (facts.visibility === "public" || facts.isChannelMember);
}
