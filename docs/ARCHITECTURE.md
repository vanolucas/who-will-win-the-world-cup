# Architecture

## Overview

```
Polymarket APIs ──> Python script ──> data/<event>/odds.json ──> Vite build ──> GitHub Pages
   (Gamma/CLOB)    (GitHub Actions)       (committed)            (static)       (deployed)
```

The system follows a **pre-rendered data** pattern: data is fetched server-side by a Python script running in GitHub Actions, stored as static JSON files (one per event), and served alongside the frontend. This avoids CORS issues and ensures the site works even if the upstream API is down.

The site supports **multiple events** (e.g. the FIFA World Cup and the French presidential election). A single shared **event registry** drives both the data fetcher and the frontend.

## Event registry (`events.config.json`)

`events.config.json` at the repository root is the single source of truth for the set of events and the default event. It is consumed by:

- **Python** (`scripts/fetch_odds.py`) — to know which Polymarket slugs to fetch, which events use cached images, and which event-specific history filters to apply.
- **Vite** (`vite.config.js`) — to emit one static page per event and to inject a per-page `window.__APP_CONFIG__` object (the current event's config + the full event list) so the frontend needs no runtime config fetch or fragile cross-root imports.

`defaultEvent` is the event id that `/` redirects to.

## Data Pipeline

The daily update workflow (`update-and-deploy.yml`) executes two jobs:

### 1. Fetch Data (`scripts/fetch_odds.py`)

For **each event** in `events.config.json`:

1. **Fetch markets** from the Gamma API (`GET /events?slug=<polymarketSlug>`)
   - Extracts entrant names, CLOB token IDs, current prices, and (for image events) the photo URL
   - Filters out inactive markets
2. **Fetch price history** for each entrant from the CLOB API (`GET /prices-history?market={token_id}&interval=max&fidelity=1440`)
   - `fidelity=1440` returns one data point per day; `interval=max` fetches all history
   - An optional, config-driven `historyFilter` is applied (e.g. `worldcup2025` drops noisy pre-launch 2025 points above 0.40)
3. **Cache images** (image-icon events only) into `data/<event>/images/<entrant-id>.<ext>`, skipping re-downloads when a cached file already exists
4. **Write `data/<event>/odds.json`** atomically (temp file + rename)

Robustness:

- **Per-event isolation** — each event is fetched in a `try/except`, so one failing event never aborts the others.
- **Retry with backoff** — transient HTTP errors are retried a few times with exponential backoff.
- **Preserve good data** — if an event's fetch fails, its existing `odds.json` is left untouched (never overwritten with empty data). The script only exits non-zero if *every* event fails.

### 2. Build and Deploy

1. Vite bundles the frontend from the single `src/index.html` template and copies `data/` (via `publicDir`) into `dist/`, so each event's data is served at `/<event>/odds.json` and images at `/<event>/images/...`.
2. A custom Vite plugin (`multiEvent`) then emits, for each event, `dist/<event>/index.html` (template with per-event title/meta/favicon/canonical/GA + injected config; assets stay absolute `/assets/...` so they resolve from subdirectories), plus a redirecting `dist/index.html` and `dist/404.html` that both forward to the default event.
3. The `dist/` directory is uploaded as a GitHub Pages artifact and deployed.

The deploy job runs even if the data fetch job fails (`if: always()`), ensuring the site stays up with the last good data.

## Data Format

`data/<event>/odds.json` uses **forward-fill compression**: when an entrant's probability stays the same across consecutive days, only the first day of each run is stored. The frontend expands gaps back to full daily resolution on load via `forwardFillHistory()` in `main.js`.

```json
{
  "metadata": {
    "lastUpdate": "2026-03-25T02:15:00Z",
    "totalEntrants": 43,
    "iconType": "flag"
  },
  "entrants": [
    { "id": "spain", "name": "Spain", "currentProbability": 0.153 },
    { "id": "le-pen", "name": "Marine Le Pen", "currentProbability": 0.27, "image": "images/le-pen.png" }
  ],
  "history": {
    "spain": [
      { "date": "2025-07-01", "probability": 0.08 },
      { "date": "2025-07-04", "probability": 0.09 }
    ]
  }
}
```

- **metadata.iconType**: `flag` or `image`, mirrors the event config and drives the icon renderer
- **entrants**: sorted alphabetically by `id` for deterministic diffs; `image` (a path relative to the event folder) is present only for image-icon events
- **history**: keyed by entrant ID; consecutive entries with the same probability are omitted (forward-fill compressed). The frontend restores full daily resolution up to `metadata.lastUpdate`

## Frontend Architecture

Single-page vanilla JavaScript app, bundled by Vite. No framework. One template renders every event; the active event is determined from the injected `window.__APP_CONFIG__`.

| Module | Responsibility |
|--------|---------------|
| `main.js` | Reads `window.__APP_CONFIG__`, loads `data/<event>/odds.json`, forward-fill expansion, app state, view switching, component orchestration |
| `chart.js` | TradingView Lightweight Charts v5 integration |
| `table.js` | Table rendering with DOM APIs |
| `race.js` | Animated bar-chart race with playback controls |
| `filter.js` | Multi-select entrant filter with checkbox state management |
| `dropdown.js` | Accessible header event-selector dropdown |
| `icons.js` | Icon abstraction: returns a DOM node per entrant (emoji flag span, or lazy/circular `<img>` with initials-avatar fallback) |
| `flags.js` | Country flag emoji mapping (ISO 3166-1 alpha-2 codes) |

### Icon abstraction

Components do not import `getFlag` directly. Instead `main.js` builds an **icon renderer** from the event's `iconType` (`createIconRenderer` in `icons.js`) and passes it to the chart, table, race and filter. The renderer returns a DOM node (never raw HTML), so name/icon insertion is XSS-safe. Image nodes are reused across chart range changes and crosshair moves to avoid reloading photos.

### Routing

- Production: one real static HTML page per event at `/<event>/`; `/` and unknown paths redirect to the default event (`index.html` meta-refresh + `404.html`).
- Dev: a `configureServer` middleware serves the template (with per-event tokens + config injected, then passed through Vite's `transformIndexHtml`) for known `/<event>/` paths, redirects `/` to the default event, and normalises `/<event>` to a trailing slash.

### State Management

Application state is minimal and module-scoped in `main.js`. The filter state lives in the DOM (checkbox checked states) and is read fresh on each change event, naturally persisting across view switches since the filter panel remains mounted.

### Styling

Custom CSS implementing Material Design v3 principles with a dark theme using five brand colors (Midnight Violet, Deep Twilight, French Blue, Sky Surge, Amber Gold). Responsive via CSS Grid layout with a sidebar filter panel on desktop and an overlay drawer on mobile.

## APIs

| API | Base URL | Endpoint | Auth | Rate Limit |
|-----|----------|----------|------|------------|
| Gamma | `https://gamma-api.polymarket.com` | `GET /events` | None | 500 req/10s |
| CLOB | `https://clob.polymarket.com` | `GET /prices-history` | None | 1000 req/10s |
