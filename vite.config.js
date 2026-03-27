import { readFileSync } from "fs";
import { defineConfig } from "vite";

const siteConfig = JSON.parse(readFileSync("site.config.json", "utf-8"));

function googleAnalytics(trackingId) {
  if (!trackingId) return {};
  const snippet = `
    <!-- Google tag (gtag.js) -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=${trackingId}"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '${trackingId}');
    </script>`;
  return {
    name: "google-analytics",
    transformIndexHtml: (html) => html.replace("<head>", `<head>${snippet}`),
  };
}

export default defineConfig({
  root: "src",
  base: "/",
  publicDir: "../data",
  plugins: [googleAnalytics(siteConfig.googleAnalyticsId)],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
});
