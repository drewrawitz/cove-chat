import { Schema } from "effect";
import { protocolUtf8ByteLimit } from "../content-bounds.ts";

const ChannelRequestValue = Schema.Trimmed.check(Schema.isNonEmpty());
const ChannelPurposeRequestValue = ChannelRequestValue.check(protocolUtf8ByteLimit(2 * 1024));

export const CreatePublicChannelRequest = Schema.Struct({
  name: ChannelRequestValue,
  purpose: ChannelPurposeRequestValue,
}).annotate({ identifier: "CreatePublicChannelRequest" });
export interface CreatePublicChannelRequest extends Schema.Schema.Type<
  typeof CreatePublicChannelRequest
> {}

export const CreatePrivateChannelRequest = Schema.Struct({
  name: ChannelRequestValue,
  purpose: ChannelPurposeRequestValue,
}).annotate({ identifier: "CreatePrivateChannelRequest" });
export interface CreatePrivateChannelRequest extends Schema.Schema.Type<
  typeof CreatePrivateChannelRequest
> {}
