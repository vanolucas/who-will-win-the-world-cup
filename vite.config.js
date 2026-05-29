import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { defineConfig } from "vite";

const siteConfig = JSON.parse(readFileSync("site.config.json", "utf-8"));
const eventsConfig = JSON.parse(readFileSync("events.config.json", "utf-8"));

const SITE_URL = (siteConfig.siteUrl || "").replace(/\/$/, "");
const GA_ID = siteConfig.googleAnalyticsId || "";
const EVENTS = eventsConfig.events || [];
const DEFAULT_EVENT = eventsConfig.defaultEvent || (EVENTS[0] && EVENTS[0].id);
const DEFAULT_ACCENT_COLOR = "#c8a04e";

function gaSnippet(trackingId) {
  if (!trackingId) return "";
  return `
    <!-- Google tag (gtag.js) -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=${trackingId}"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '${trackingId}');
    </script>`;
}

/** Public list of events exposed to the frontend (no fetch-only fields). */
function publicEvents() {
  return EVENTS.map((e) => ({
    id: e.id,
    dropdownLabel: e.dropdownLabel,
    titlePrefix: e.titlePrefix,
    pageTitle: e.pageTitle,
    entrantNoun: e.entrantNoun,
    entrantNounPlural: e.entrantNounPlural,
    iconType: e.iconType,
    accentColor: e.accentColor || DEFAULT_ACCENT_COLOR,
    zeroProbabilityLabel: e.zeroProbabilityLabel,
    showZeroProbabilitySection: e.showZeroProbabilitySection !== false,
  }));
}

function appConfigScript(event) {
  const config = {
    event: publicEvents().find((e) => e.id === event.id),
    events: publicEvents(),
    defaultEvent: DEFAULT_EVENT,
  };
  // Escape "</" so the JSON can't break out of the <script> element.
  const json = JSON.stringify(config).replace(/<\//g, "<\\/");
  return `<script>window.__APP_CONFIG__=${json};</script>`;
}

/** Replace the template tokens + inject per-page config and GA. */
function renderTemplate(html, event) {
  const canonical = SITE_URL ? `${SITE_URL}/${event.id}/` : `/${event.id}/`;
  const tokens = {
    PAGE_TITLE: event.pageTitle,
    META_DESCRIPTION: event.metaDescription || "",
    CANONICAL_URL: canonical,
    FAVICON_EMOJI: event.faviconEmoji || "",
    TITLE_PREFIX: event.titlePrefix || "",
    DROPDOWN_LABEL: event.dropdownLabel || "",
    ENTRANTS_PLURAL: event.entrantNounPlural || "Entrants",
    ENTRANT_NOUN_LOWER: (event.entrantNoun || "entrant").toLowerCase(),
    FOOTER_DISCLAIMER: event.footerDisclaimer || "",
    ABOUT_TEXT: event.aboutText || "",
  };

  let out = html;
  for (const [key, value] of Object.entries(tokens)) {
    out = out.split(`{{${key}}}`).join(value);
  }

  const head = appConfigScript(event) + gaSnippet(GA_ID);
  out = out.replace("<head>", `<head>${head}`);
  // Place the accent override after the stylesheet link so it wins in the cascade.
  return out.replace("</head>", `${accentStyle(event)}</head>`);
}

/** Inline style overriding the accent CSS variables for this event. */
function accentStyle(event) {
  const accent = event.accentColor || DEFAULT_ACCENT_COLOR;
  return `<style>:root{--color-accent:${accent};--color-highlight:${accent};}</style>`;
}

/** Vite plugin: emit one static page per event + redirects for `/` and 404. */
function multiEvent() {
  let templateHtml = null;
  return {
    name: "multi-event",

    // --- Dev server: serve the template for known /<event> paths ---
    configureServer(server) {
      const eventIds = new Set(EVENTS.map((e) => e.id));
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url || "/").split("?")[0];

        if (url === "/" || url === "/index.html") {
          res.statusCode = 302;
          res.setHeader("Location", `/${DEFAULT_EVENT}/`);
          res.end();
          return;
        }

        const match = url.match(/^\/([^/]+)\/?$/);
        if (match && eventIds.has(match[1])) {
          // Normalise to a trailing slash so relative URLs resolve correctly.
          if (!url.endsWith("/")) {
            res.statusCode = 301;
            res.setHeader("Location", `${url}/`);
            res.end();
            return;
          }
          const event = EVENTS.find((e) => e.id === match[1]);
          let html = readFileSync(resolve("src/index.html"), "utf-8");
          html = renderTemplate(html, event);
          html = await server.transformIndexHtml(url, html);
          res.statusCode = 200;
          res.setHeader("Content-Type", "text/html");
          res.end(html);
          return;
        }

        next();
      });
    },

    // --- Build: capture the processed template before it is written ---
    transformIndexHtml: {
      order: "post",
      handler(html) {
        templateHtml = html;
      },
    },

    // --- Build: emit per-event pages, redirect index and 404 ---
    closeBundle() {
      if (!templateHtml) return;
      const outDir = resolve("dist");

      for (const event of EVENTS) {
        const html = renderTemplate(templateHtml, event);
        const dir = resolve(outDir, event.id);
        mkdirSync(dir, { recursive: true });
        writeFileSync(resolve(dir, "index.html"), html);
      }

      const redirect = redirectHtml(DEFAULT_EVENT);
      writeFileSync(resolve(outDir, "index.html"), redirect);
      writeFileSync(resolve(outDir, "404.html"), redirect);
    },
  };
}

function redirectHtml(eventId) {
  const target = `/${eventId}/`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="refresh" content="0; url=${target}" />
  <link rel="canonical" href="${target}" />
  <title>Redirecting…</title>
  <script>window.location.replace("${target}");</script>
</head>
<body>
  <p>Redirecting to <a href="${target}">${target}</a>…</p>
</body>
</html>
`;
}

export default defineConfig({
  root: "src",
  base: "/",
  publicDir: "../data",
  plugins: [multiEvent()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
});
