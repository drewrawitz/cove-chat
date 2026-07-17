import { Schema } from "effect";
import { HttpApiSchema } from "effect/unstable/httpapi";

export const InvalidMagicLinkResponse = Schema.Struct({
  code: Schema.Literals(["INVALID_MAGIC_LINK"]),
  message: Schema.Literals(["Magic link is invalid or expired."]),
})
  .annotate({ identifier: "InvalidMagicLinkResponse" })
  .pipe(HttpApiSchema.status("Unauthorized"));

export interface InvalidMagicLinkResponse extends Schema.Schema.Type<
  typeof InvalidMagicLinkResponse
> {}

export const UnauthorizedResponse = Schema.Struct({
  code: Schema.Literals(["UNAUTHENTICATED"]),
  message: Schema.Literals(["Authentication is required."]),
})
  .annotate({ identifier: "UnauthorizedResponse" })
  .pipe(HttpApiSchema.status("Unauthorized"));

export interface UnauthorizedResponse extends Schema.Schema.Type<typeof UnauthorizedResponse> {}

export const CsrfValidationFailedResponse = Schema.Struct({
  code: Schema.Literals(["CSRF_VALIDATION_FAILED"]),
  message: Schema.Literals(["CSRF validation failed."]),
})
  .annotate({ identifier: "CsrfValidationFailedResponse" })
  .pipe(HttpApiSchema.status("Forbidden"));

export interface CsrfValidationFailedResponse extends Schema.Schema.Type<
  typeof CsrfValidationFailedResponse
> {}

export const InternalServerErrorResponse = Schema.Struct({
  code: Schema.Literals(["INTERNAL_SERVER_ERROR"]),
  message: Schema.Literals(["The server could not complete the request."]),
})
  .annotate({ identifier: "InternalServerErrorResponse" })
  .pipe(HttpApiSchema.status("InternalServerError"));

export interface InternalServerErrorResponse extends Schema.Schema.Type<
  typeof InternalServerErrorResponse
> {}
