import { defineConfig } from "vite-plus";

export default defineConfig({
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {},
  test: {
    hookTimeout: 120_000,
    maxWorkers: 2,
    testTimeout: 120_000,
  },
});
