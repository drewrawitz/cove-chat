import { Schema } from "effect";
import { HttpApiSchema } from "effect/unstable/httpapi";

const unavailableDefinition = {
  code: "CHANNEL_UNAVAILABLE",
  message: "Channel is unavailable.",
} as const;

export const ChannelUnavailableResponse = Schema.Struct({
  code: Schema.Literals([unavailableDefinition.code]),
  message: Schema.Literals([unavailableDefinition.message]),
})
  .annotate({ identifier: "ChannelUnavailableResponse" })
  .pipe(HttpApiSchema.status("NotFound"));

export const ChannelErrorResponses = {
  unavailable: ChannelUnavailableResponse.make(unavailableDefinition),
} as const;
