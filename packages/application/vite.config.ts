import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    dts: false,
    entry: ["src/index.ts", "src/workspaces/internal.ts"],
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {},
});
