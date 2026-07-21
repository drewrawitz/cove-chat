import { CsrfCookie, SessionCookie } from "@cove/protocol";
import { Effect, Redacted } from "effect";
import { HttpEffect, HttpServerResponse } from "effect/unstable/http";

export const setAuthenticationCookies = (
  sessionToken: Redacted.Redacted<string>,
  csrfToken: Redacted.Redacted<string>,
  expires: Date,
) =>
  HttpEffect.appendPreResponseHandler((_request, response) =>
    Effect.succeed(
      HttpServerResponse.setCookieUnsafe(
        HttpServerResponse.setCookieUnsafe(
          response,
          SessionCookie.key,
          Redacted.value(sessionToken),
          {
            expires,
            httpOnly: true,
            path: "/",
            sameSite: "strict",
            secure: true,
          },
        ),
        CsrfCookie.key,
        Redacted.value(csrfToken),
        {
          expires,
          httpOnly: false,
          path: "/",
          sameSite: "strict",
          secure: true,
        },
      ),
    ),
  );
