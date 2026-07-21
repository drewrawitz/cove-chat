import { expect, it } from "@effect/vitest";
import { ConfigProvider, Effect, Exit } from "effect";
import { ApiConfiguration, ApiConfigurationLive } from "../src/api-configuration.ts";

it.effect("uses the browser-facing web origin for public links", () =>
  Effect.gen(function* () {
    const configuration = yield* ApiConfiguration;

    expect(configuration.host).toBe("0.0.0.0");
    expect(configuration.port).toBe(3001);
    expect(configuration.publicWebOrigin.href).toBe("http://localhost:3000/");
    expect(configuration.exposeAppApiDocs).toBe(false);
  }).pipe(
    Effect.provide(ApiConfigurationLive),
    Effect.provide(
      ConfigProvider.layer(
        ConfigProvider.fromUnknown({
          PUBLIC_APP_URL: "http://localhost:3001",
          PUBLIC_WEB_ORIGIN: "http://localhost:3000",
        }),
      ),
    ),
  ),
);

it.effect("enables app API documentation explicitly", () =>
  Effect.gen(function* () {
    const configuration = yield* ApiConfiguration;

    expect(configuration.exposeAppApiDocs).toBe(true);
  }).pipe(
    Effect.provide(ApiConfigurationLive),
    Effect.provide(
      ConfigProvider.layer(
        ConfigProvider.fromUnknown({
          EXPOSE_APP_API_DOCS: "true",
          PUBLIC_WEB_ORIGIN: "http://localhost:3000",
        }),
      ),
    ),
  ),
);

it.effect("rejects values that are not credential-free HTTP origins", () =>
  Effect.gen(function* () {
    for (const publicWebOrigin of [
      "mailto:hello@cove.test",
      "https://user:password@app.cove.test",
      "https://app.cove.test/deployment",
    ]) {
      const exit = yield* ApiConfiguration.pipe(
        Effect.provide(ApiConfigurationLive),
        Effect.provide(
          ConfigProvider.layer(
            ConfigProvider.fromUnknown({
              PUBLIC_WEB_ORIGIN: publicWebOrigin,
            }),
          ),
        ),
        Effect.exit,
      );

      expect(Exit.isFailure(exit)).toBe(true);
    }
  }),
);
