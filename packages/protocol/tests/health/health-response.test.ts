import { expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { HealthResponse } from "../../src/index.ts";

it.effect("decodes the health response contract", () =>
  Effect.gen(function* () {
    const response = yield* Schema.decodeUnknownEffect(HealthResponse)({ status: "ok" });

    expect(response).toEqual({ status: "ok" });
  }),
);

it.effect("rejects an unknown health status", () =>
  Effect.gen(function* () {
    const error = yield* Schema.decodeUnknownEffect(HealthResponse)({ status: "starting" }).pipe(
      Effect.flip,
    );

    expect(error).toBeInstanceOf(Schema.SchemaError);
  }),
);
