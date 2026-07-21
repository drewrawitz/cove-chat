import { Config, Context, Effect, Layer, Schema } from "effect";

const PublicWebOrigin = Schema.URL.check(
  Schema.makeFilter((url) => {
    const issues: Array<string> = [];

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      issues.push("PUBLIC_WEB_ORIGIN must use http or https");
    }
    if (url.username.length > 0 || url.password.length > 0) {
      issues.push("PUBLIC_WEB_ORIGIN must not contain credentials");
    }
    if (url.pathname !== "/" || url.search.length > 0 || url.hash.length > 0) {
      issues.push("PUBLIC_WEB_ORIGIN must be an origin without a path, query, or fragment");
    }

    return issues;
  }),
);

export interface ApiConfigurationService {
  readonly exposeAppApiDocs: boolean;
  readonly host: string;
  readonly port: number;
  readonly publicWebOrigin: URL;
}

export class ApiConfiguration extends Context.Service<ApiConfiguration, ApiConfigurationService>()(
  "@cove/api/ApiConfiguration",
) {}

const make = Effect.gen(function* () {
  const configuration = yield* Config.all({
    exposeAppApiDocs: Config.boolean("EXPOSE_APP_API_DOCS").pipe(Config.withDefault(false)),
    host: Config.string("HOST").pipe(Config.withDefault("0.0.0.0")),
    port: Config.port("PORT").pipe(Config.withDefault(3001)),
    publicWebOrigin: Config.schema(PublicWebOrigin, "PUBLIC_WEB_ORIGIN"),
  });

  return ApiConfiguration.of(configuration);
});

export const ApiConfigurationLive = Layer.effect(ApiConfiguration, make);
