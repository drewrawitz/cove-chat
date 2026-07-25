import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      "migrate:reset": {
        command: "node prisma/reset-database.ts",
        cache: false,
      },
    },
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {},
});
