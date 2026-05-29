# Who Will Win?

A static dashboard displaying winning probabilities for the entrants of an event, updated daily from prediction market data. The site supports **multiple events**, each served at its own page:

- **FIFA World Cup 2026** — `/fifa-world-cup`
- **French Presidential Election 2027** — `/french-presidential-election`
- **French Open 2026 — Men's Singles (ATP)** — `/atp-roland-garros`
- **French Open 2026 — Women's Singles (WTA)** — `/wta-roland-garros`

Visiting the site root (`/`) redirects to the configured **default event**.

**Live site**: https://whowillwin.vanolucas.com/

## Features

- **Interactive chart** showing the evolution of winning probabilities over time
- **Table view** with current rankings and 7-day trends
- **Animated bar-chart race** visualizing how rankings shift day-by-day, with playback controls and keyboard shortcuts
- **Entrant filter** to focus on specific teams/candidates (multi-select, persists across views)
- **Event selector dropdown** in the header title to switch between events
- **Per-event icons**: emoji flags for the World Cup, candidate photos (cached locally) for the election
- **Daily automated updates** via GitHub Actions
- **Mobile-friendly** responsive design

## Local Development

### Prerequisites

- [Node.js](https://nodejs.org/) >= 20
- [Python](https://www.python.org/) >= 3.13
- [uv](https://docs.astral.sh/uv/) (Python package manager)

### Setup

```bash
git clone https://github.com/vanolucas/who-will-win-the-world-cup.git
cd who-will-win-the-world-cup

# Install JS dependencies
npm install

# Install Python dependencies
uv sync
```

### Fetch data

```bash
uv run python scripts/fetch_odds.py
```

This fetches the latest odds from Polymarket for **every event** listed in `events.config.json` and writes `data/<event-id>/odds.json` (plus cached candidate images under `data/<event-id>/images/` for image-icon events). Each event is fetched independently: if one event fails, the others still update and the failing event keeps its previously committed data.

### Run dev server

```bash
npm run dev
```

Opens a local development server with hot reload.

### Build for production

```bash
npm run build
npm run preview   # Preview the production build locally
```

The production build outputs to `dist/`.

## Deployment

The site is automatically deployed to GitHub Pages via GitHub Actions.

### GitHub Pages Setup

1. Go to repository **Settings > Pages**
2. Set **Source** to **GitHub Actions**

### GitHub Actions Workflow

The workflow (`.github/workflows/update-and-deploy.yml`) runs:

- **Daily at 01:12 UTC** (scheduled)
- **On manual trigger** (Actions tab > "Update Data and Deploy" > Run workflow)

It performs two jobs:

1. **update-data**: Fetches latest odds from Polymarket for all events and commits the `data/` directory
2. **build-and-deploy**: Builds the static site with Vite (one page per event) and deploys to GitHub Pages

If the data fetch fails, the site is still deployed with the last successfully fetched data.

## Events configuration

All events are declared in a single shared registry, `events.config.json`, at the repository root. It is read by both the Python fetcher and the Vite build (so the two never drift apart):

```jsonc
{
  "defaultEvent": "fifa-world-cup",       // where "/" redirects to
  "events": [
    {
      "id": "fifa-world-cup",             // URL slug and data folder name
      "polymarketSlug": "world-cup-winner",
      "accentColor": "#c8a04e",            // UI accent color (hex) for this event
      "titlePrefix": "Who Will Win the",
      "dropdownLabel": "World Cup",        // shown in the header dropdown
      "pageTitle": "Who Will Win the World Cup?",
      "metaDescription": "...",
      "entrantNoun": "Team",
      "entrantNounPlural": "Teams",
      "iconType": "flag",                  // "flag" (emoji) | "image" (photo)
      "faviconEmoji": "⚽",
      "footerDisclaimer": "Not affiliated with FIFA.",
      "aboutText": "...",
      "zeroProbabilityLabel": "Eliminated",
      "showZeroProbabilitySection": true,
      "historyFilter": { "type": "worldcup2025" }  // optional, event-specific
    }
    // ...more events
  ]
}
```

### Default event

Set `defaultEvent` to the event id that `/` should redirect to. It defaults to `fifa-world-cup`.

### Adding a new event

1. Add an entry to `events.config.json` with a unique `id` and the Polymarket `polymarketSlug`.
2. Choose an `iconType`: `flag` (emoji flags via `src/js/flags.js`) or `image` (candidate photos cached during fetch).
3. Optionally set an `accentColor` (hex) to theme the UI for the event; it defaults to the World Cup gold (`#c8a04e`) when omitted. All accent UI elements (buttons, active states, the leading entrant's chart/race color) adapt to it.
4. Run `uv run python scripts/fetch_odds.py` to generate `data/<id>/odds.json`.
5. Run `npm run build` — a static page is automatically emitted at `/<id>/` and the event appears in the header dropdown. No component code changes are needed.

## Google Analytics

The site supports Google Analytics via a simple configuration file. Set your tracking ID in `site.config.json`:

```json
{
  "googleAnalyticsId": "G-XXXXXXXXXX",
  "siteUrl": "https://whowillwin.vanolucas.com"
}
```

During the Vite build, the gtag snippet is automatically injected into the `<head>` of every event page. To disable tracking, remove or empty the `googleAnalyticsId` value. `siteUrl` is used to build canonical / Open Graph URLs.

## Project Structure

```
who-will-win-the-world-cup/
├── .github/workflows/
│   └── update-and-deploy.yml  # CI/CD: daily fetch + build + deploy
├── scripts/
│   └── fetch_odds.py          # Multi-event Polymarket data fetcher (Python)
├── src/
│   ├── index.html             # Page template (tokens filled per event at build/dev time)
│   ├── css/styles.css         # Material Design v3 dark theme
│   └── js/
│       ├── main.js            # App entry, event detection, data loading
│       ├── chart.js           # TradingView Lightweight Charts
│       ├── table.js           # Table view
│       ├── race.js            # Animated bar-chart race
│       ├── filter.js          # Entrant filter component
│       ├── dropdown.js        # Header event-selector dropdown
│       ├── icons.js           # Icon renderer (flag emoji / candidate photo)
│       └── flags.js           # Country flag emoji mapping
├── data/
│   └── <event-id>/
│       ├── odds.json          # Latest odds (committed, forward-fill compressed)
│       └── images/            # Cached entrant photos (image-icon events only)
├── docs/
│   └── ARCHITECTURE.md
├── events.config.json         # Shared event registry + default event
├── site.config.json           # Site settings (Google Analytics, site URL)
├── vite.config.js
├── package.json
└── pyproject.toml
```

## License

MIT
