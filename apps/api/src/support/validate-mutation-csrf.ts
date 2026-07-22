import { makeCsrfToken, makeSessionToken, validateCsrf } from "@cove/application";
import { AuthErrorResponses, AuthenticatedSession } from "@cove/protocol";
import { Effect, Redacted } from "effect";

export const validateMutationCsrf = Effect.fn("Api.validateMutationCsrf")(function* (
  csrfHeader: string | undefined,
  csrfOperation: typeof validateCsrf = validateCsrf,
) {
  if (csrfHeader === undefined) {
    return yield* Effect.fail(AuthErrorResponses.csrfValidationFailed);
  }

  const session = yield* AuthenticatedSession;
  const sessionToken = makeSessionToken(Redacted.value(session.token));
  const csrfToken = makeCsrfToken(csrfHeader);
  yield* csrfOperation(sessionToken, csrfToken).pipe(
    Effect.mapError((error) =>
      error._tag === "Application.InvalidCsrfToken"
        ? AuthErrorResponses.csrfValidationFailed
        : AuthErrorResponses.internalServerError,
    ),
  );
});
