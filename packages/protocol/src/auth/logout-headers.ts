import { Schema } from "effect";

export const LogoutHeaders = Schema.Struct({
  "x-csrf-token": Schema.optionalKey(Schema.NonEmptyString),
}).annotate({ identifier: "LogoutHeaders" });

export interface LogoutHeaders extends Schema.Schema.Type<typeof LogoutHeaders> {}
