import { Schema } from "effect";

const ChannelRequestValue = Schema.Trimmed.check(Schema.isNonEmpty());

export const CreatePublicChannelRequest = Schema.Struct({
  name: ChannelRequestValue,
  purpose: ChannelRequestValue,
}).annotate({ identifier: "CreatePublicChannelRequest" });
export interface CreatePublicChannelRequest extends Schema.Schema.Type<
  typeof CreatePublicChannelRequest
> {}
