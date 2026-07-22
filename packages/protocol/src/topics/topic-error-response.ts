import { Schema } from "effect";
import { HttpApiSchema } from "effect/unstable/httpapi";

const unavailableDefinition = {
  code: "TOPIC_UNAVAILABLE",
  message: "Topic is unavailable.",
} as const;

export const TopicUnavailableResponse = Schema.Struct({
  code: Schema.Literals([unavailableDefinition.code]),
  message: Schema.Literals([unavailableDefinition.message]),
})
  .annotate({ identifier: "TopicUnavailableResponse" })
  .pipe(HttpApiSchema.status("NotFound"));

export const TopicErrorResponses = {
  unavailable: TopicUnavailableResponse.make(unavailableDefinition),
} as const;
