import { defineConfig } from "orval";

export default defineConfig({
  app: {
    input: {
      target: "../../packages/protocol/openapi/app.json",
    },
    output: {
      target: "./src/api/generated/cove-app.ts",
      client: "react-query",
      httpClient: "fetch",
      formatter: "prettier",
      schemas: {
        path: "./src/api/generated/schemas",
        type: "zod",
      },
      clean: true,
      override: {
        fetch: {
          forceSuccessResponse: true,
          includeHttpResponseReturnType: false,
          runtimeValidation: true,
          useRuntimeFetcher: true,
        },
        query: {
          signal: true,
          useInvalidate: true,
          usePrefetch: true,
        },
      },
    },
  },
});
