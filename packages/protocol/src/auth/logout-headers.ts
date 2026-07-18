import { Schema } from "effect";

export const CsrfHeaders = Schema.Struct({
  "x-csrf-token": Schema.optionalKey(Schema.NonEmptyString),
}).annotate({ identifier: "CsrfHeaders" });

export interface CsrfHeaders extends Schema.Schema.Type<typeof CsrfHeaders> {}

export const LogoutHeaders = CsrfHeaders;
export interface LogoutHeaders extends Schema.Schema.Type<typeof LogoutHeaders> {}
