import { Schema } from "effect";

export const VerifyMagicLinkRequest = Schema.Struct({
  token: Schema.NonEmptyString,
}).annotate({ identifier: "VerifyMagicLinkRequest" });

export interface VerifyMagicLinkRequest extends Schema.Schema.Type<typeof VerifyMagicLinkRequest> {}
