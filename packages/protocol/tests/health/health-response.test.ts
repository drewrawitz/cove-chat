import { expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { HealthOkResponse, HealthUnavailableResponse } from "../../src/index.ts";

it.effect("decodes the available health response contract", () =>
  Effect.gen(function* () {
    const response = yield* Schema.decodeUnknownEffect(HealthOkResponse)({ status: "ok" });

    expect(response).toEqual({ status: "ok" });
  }),
);

it.effect("decodes the unavailable health response contract", () =>
  Effect.gen(function* () {
    const response = yield* Schema.decodeUnknownEffect(HealthUnavailableResponse)({
      status: "unavailable",
    });

    expect(response).toEqual({ status: "unavailable" });
  }),
);

it.effect("rejects an unknown available health status", () =>
  Effect.gen(function* () {
    const error = yield* Schema.decodeUnknownEffect(HealthOkResponse)({
      status: "starting",
    }).pipe(Effect.flip);

    expect(error).toBeInstanceOf(Schema.SchemaError);
  }),
);
