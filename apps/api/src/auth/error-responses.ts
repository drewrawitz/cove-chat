import {
  CsrfValidationFailedResponse,
  InternalServerErrorResponse,
  InvalidMagicLinkResponse,
  UnauthorizedResponse,
} from "@cove/protocol";

export const internalServerErrorResponse = () =>
  InternalServerErrorResponse.make({
    code: "INTERNAL_SERVER_ERROR",
    message: "The server could not complete the request.",
  });

export const invalidMagicLinkResponse = () =>
  InvalidMagicLinkResponse.make({
    code: "INVALID_MAGIC_LINK",
    message: "Magic link is invalid or expired.",
  });

export const unauthorizedResponse = () =>
  UnauthorizedResponse.make({
    code: "UNAUTHENTICATED",
    message: "Authentication is required.",
  });

export const csrfValidationFailedResponse = () =>
  CsrfValidationFailedResponse.make({
    code: "CSRF_VALIDATION_FAILED",
    message: "CSRF validation failed.",
  });
