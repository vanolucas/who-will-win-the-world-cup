import { defineConfig } from "vite";

export default defineConfig({
  root: "src",
  base: "/",
  publicDir: "../data",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
});
