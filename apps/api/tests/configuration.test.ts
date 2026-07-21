import { expect, it } from "@effect/vitest";
import { ConfigProvider, Effect, Exit } from "effect";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ApiConfiguration, ApiConfigurationLive } from "../src/api-configuration.ts";

it("loads workspace package sources during API development", () => {
  const packageJson = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { readonly scripts: { readonly dev: string } };
  const developmentConditions = packageJson.scripts.dev.match(/--conditions=\S+/g) ?? [];
  const result = spawnSync(
    process.execPath,
    [
      ...developmentConditions,
      "--input-type=module",
      "--eval",
      "import { PublicChannelListResponse } from '@cove/protocol'; void PublicChannelListResponse;",
    ],
    {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      encoding: "utf8",
    },
  );

  expect(result.status, result.stderr).toBe(0);
});

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
