import { Schema } from "effect";
import { HttpApiSchema } from "effect/unstable/httpapi";

const unavailableDefinition = {
  code: "CHANNEL_UNAVAILABLE",
  message: "Channel is unavailable.",
} as const;

const stewardUnavailableDefinition = {
  code: "CHANNEL_STEWARD_UNAVAILABLE",
  message: "The initial Channel Steward is unavailable.",
} as const;

export const ChannelUnavailableResponse = Schema.Struct({
  code: Schema.Literals([unavailableDefinition.code]),
  message: Schema.Literals([unavailableDefinition.message]),
})
  .annotate({ identifier: "ChannelUnavailableResponse" })
  .pipe(HttpApiSchema.status("NotFound"));

export const ChannelStewardUnavailableResponse = Schema.Struct({
  code: Schema.Literals([stewardUnavailableDefinition.code]),
  message: Schema.Literals([stewardUnavailableDefinition.message]),
})
  .annotate({ identifier: "ChannelStewardUnavailableResponse" })
  .pipe(HttpApiSchema.status("NotFound"));

export const ChannelErrorResponses = {
  unavailable: ChannelUnavailableResponse.make(unavailableDefinition),
  stewardUnavailable: ChannelStewardUnavailableResponse.make(stewardUnavailableDefinition),
} as const;
