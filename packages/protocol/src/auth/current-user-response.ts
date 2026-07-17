import { Schema } from "effect";

export const CurrentUserResponse = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  displayName: Schema.String,
}).annotate({ identifier: "CurrentUserResponse" });

export interface CurrentUserResponse extends Schema.Schema.Type<typeof CurrentUserResponse> {}
