import { Schema } from "effect";

export const LoginRequest = Schema.Struct({
  email: Schema.Trimmed.check(Schema.isNonEmpty(), Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)),
}).annotate({ identifier: "LoginRequest" });

export interface LoginRequest extends Schema.Schema.Type<typeof LoginRequest> {}
