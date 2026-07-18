import { Schema } from "effect";
import { HttpApiSchema } from "effect/unstable/httpapi";

const AuthErrorDefinitions = {
  csrfValidationFailed: {
    code: "CSRF_VALIDATION_FAILED",
    message: "CSRF validation failed.",
  },
  internalServerError: {
    code: "INTERNAL_SERVER_ERROR",
    message: "The server could not complete the request.",
  },
  invalidMagicLink: {
    code: "INVALID_MAGIC_LINK",
    message: "Magic link is invalid or expired.",
  },
  unauthorized: {
    code: "UNAUTHENTICATED",
    message: "Authentication is required.",
  },
} as const;

export const InvalidMagicLinkResponse = Schema.Struct({
  code: Schema.Literals([AuthErrorDefinitions.invalidMagicLink.code]),
  message: Schema.Literals([AuthErrorDefinitions.invalidMagicLink.message]),
})
  .annotate({ identifier: "InvalidMagicLinkResponse" })
  .pipe(HttpApiSchema.status("Unauthorized"));

export interface InvalidMagicLinkResponse extends Schema.Schema.Type<
  typeof InvalidMagicLinkResponse
> {}

export const UnauthorizedResponse = Schema.Struct({
  code: Schema.Literals([AuthErrorDefinitions.unauthorized.code]),
  message: Schema.Literals([AuthErrorDefinitions.unauthorized.message]),
})
  .annotate({ identifier: "UnauthorizedResponse" })
  .pipe(HttpApiSchema.status("Unauthorized"));

export interface UnauthorizedResponse extends Schema.Schema.Type<typeof UnauthorizedResponse> {}

export const CsrfValidationFailedResponse = Schema.Struct({
  code: Schema.Literals([AuthErrorDefinitions.csrfValidationFailed.code]),
  message: Schema.Literals([AuthErrorDefinitions.csrfValidationFailed.message]),
})
  .annotate({ identifier: "CsrfValidationFailedResponse" })
  .pipe(HttpApiSchema.status("Forbidden"));

export interface CsrfValidationFailedResponse extends Schema.Schema.Type<
  typeof CsrfValidationFailedResponse
> {}

export const InternalServerErrorResponse = Schema.Struct({
  code: Schema.Literals([AuthErrorDefinitions.internalServerError.code]),
  message: Schema.Literals([AuthErrorDefinitions.internalServerError.message]),
})
  .annotate({ identifier: "InternalServerErrorResponse" })
  .pipe(HttpApiSchema.status("InternalServerError"));

export interface InternalServerErrorResponse extends Schema.Schema.Type<
  typeof InternalServerErrorResponse
> {}

export const AuthErrorResponses = {
  csrfValidationFailed: CsrfValidationFailedResponse.make(
    AuthErrorDefinitions.csrfValidationFailed,
  ),
  internalServerError: InternalServerErrorResponse.make(AuthErrorDefinitions.internalServerError),
  invalidMagicLink: InvalidMagicLinkResponse.make(AuthErrorDefinitions.invalidMagicLink),
  unauthorized: UnauthorizedResponse.make(AuthErrorDefinitions.unauthorized),
} as const;
