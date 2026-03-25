import { defineConfig } from "vite";

export default defineConfig({
  root: "src",
  base: "/who-will-win-the-world-cup/",
  publicDir: "../data",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
});
