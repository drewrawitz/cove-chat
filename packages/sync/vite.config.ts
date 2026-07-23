import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: ["src/index.ts", "src/server.ts"],
    format: ["esm"],
    dts: true,
  },
  test: {},
});
