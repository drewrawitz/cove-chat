import { expect, it } from "@effect/vitest";
import { AuthErrorResponses } from "../../src/index.ts";

it("owns the stable authentication error bodies", () => {
  expect(AuthErrorResponses).toEqual({
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
  });
});
