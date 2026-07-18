import { defineConfig } from "vite-plus";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { lazyPlugins } from "vite-plus";

const apiOrigin = process.env.COVE_API_ORIGIN ?? "http://localhost:3001";

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: lazyPlugins(() => [
    devtools(),
    nitro({
      devProxy: { "/api/**": { target: apiOrigin } },
      rollupConfig: { external: [/^@sentry\//] },
      routeRules: { "/api/**": { proxy: `${apiOrigin}/api/**` } },
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ]),
});

export default config;
