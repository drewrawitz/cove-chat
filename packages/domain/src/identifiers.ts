import { Schema } from "effect";

const Identifier = Schema.Trimmed.check(Schema.isNonEmpty());

export const WorkspaceId = Identifier.pipe(Schema.brand("WorkspaceId"));
export type WorkspaceId = typeof WorkspaceId.Type;

export const UserId = Identifier.pipe(Schema.brand("UserId"));
export type UserId = typeof UserId.Type;

export const ChannelId = Identifier.pipe(Schema.brand("ChannelId"));
export type ChannelId = typeof ChannelId.Type;
