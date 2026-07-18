import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    dts: false,
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {},
});
