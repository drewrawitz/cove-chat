import { Schema } from "effect";
import { HttpApiSchema } from "effect/unstable/httpapi";

export const MagicLinkAcceptedResponse = Schema.Struct({
  status: Schema.Literals(["accepted"]),
})
  .annotate({ identifier: "MagicLinkAcceptedResponse" })
  .pipe(HttpApiSchema.status("Accepted"));

export interface MagicLinkAcceptedResponse extends Schema.Schema.Type<
  typeof MagicLinkAcceptedResponse
> {}
