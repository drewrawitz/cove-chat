import { expect, it } from "@effect/vitest";
import { SessionRepository } from "@cove/ports";
import { Effect, Layer, Option } from "effect";
import {
  InvalidCsrfToken,
  makeCsrfToken,
  makeSessionToken,
  validateCsrf,
} from "../../src/index.ts";

const sessionToken = makeSessionToken("session-token");
const csrfToken = makeCsrfToken("csrf-token");

const SessionRepositoryTest = (valid: boolean) =>
  Layer.succeed(
    SessionRepository,
    SessionRepository.of({
      create: () => Effect.die("unused"),
      findCurrentUser: () => Effect.succeed(Option.none()),
      revoke: () => Effect.succeed(false),
      validateCsrf: () => Effect.succeed(valid),
    }),
  );

it.effect("accepts the CSRF token bound to the authenticated session", () =>
  validateCsrf(sessionToken, csrfToken).pipe(Effect.provide(SessionRepositoryTest(true))),
);

it.effect("rejects a CSRF token that is not bound to the authenticated session", () =>
  validateCsrf(sessionToken, csrfToken).pipe(
    Effect.provide(SessionRepositoryTest(false)),
    Effect.flip,
    Effect.map((error) => expect(error).toBeInstanceOf(InvalidCsrfToken)),
  ),
);
