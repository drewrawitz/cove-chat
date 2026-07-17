import { Schema } from "effect";
import { HttpApiSchema } from "effect/unstable/httpapi";

export const HealthOkResponse = Schema.Struct({
  status: Schema.Literals(["ok"]),
})
  .annotate({ identifier: "HealthOkResponse" })
  .pipe(HttpApiSchema.status("Ok"));

export interface HealthOkResponse extends Schema.Schema.Type<typeof HealthOkResponse> {}

export const HealthUnavailableResponse = Schema.Struct({
  status: Schema.Literals(["unavailable"]),
})
  .annotate({ identifier: "HealthUnavailableResponse" })
  .pipe(HttpApiSchema.status("ServiceUnavailable"));

export interface HealthUnavailableResponse extends Schema.Schema.Type<
  typeof HealthUnavailableResponse
> {}

export const HealthResponse = Schema.Union([HealthOkResponse, HealthUnavailableResponse]).annotate({
  identifier: "HealthResponse",
});

export type HealthResponse = typeof HealthResponse.Type;
