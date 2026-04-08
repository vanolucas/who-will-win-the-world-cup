# Architecture

## Overview

```
Polymarket APIs ──> Python script ──> odds.json ──> Vite build ──> GitHub Pages
   (Gamma/CLOB)    (GitHub Actions)    (committed)    (static)     (deployed)
```

The system follows a **pre-rendered data** pattern: data is fetched server-side by a Python script running in GitHub Actions, stored as a static JSON file, and served alongside the frontend. This avoids CORS issues and ensures the site works even if the upstream API is down.

## Data Pipeline

The daily update workflow (`update-and-deploy.yml`) executes two jobs:

### 1. Fetch Data (`scripts/fetch_odds.py`)

1. **Fetch markets** from the Gamma API (`GET /events?slug=2026-fifa-world-cup-winner-595`)
   - Extracts team names, CLOB token IDs, and current prices from each market
   - Filters out inactive markets
2. **Fetch price history** for each team from the CLOB API (`GET /prices-history?market={token_id}&interval=max&fidelity=1440`)
   - `fidelity=1440` returns one data point per day (1440 minutes = 24 hours)
   - `interval=max` fetches the entire available history
   - 150ms delay between requests to respect rate limits
3. **Write `data/odds.json`** atomically (temp file + rename) to prevent corrupt partial writes
4. **Commit and push** the updated data file

If the fetch fails, the script exits with a non-zero code and no commit is made. The previously committed data remains intact.

### 2. Build and Deploy

1. Vite bundles the frontend (`src/`) and copies `data/odds.json` (via `publicDir`) into `dist/`
2. The `dist/` directory is uploaded as a GitHub Pages artifact and deployed

The deploy job runs even if the data fetch job fails (`if: always()`), ensuring the site stays up with the last good data.

## Data Format

`data/odds.json` uses **forward-fill compression**: when a team's probability stays the same across consecutive days, only the first day of each run is stored. The frontend expands gaps back to full daily resolution on load via `forwardFillHistory()` in `main.js`.

```json
{
  "metadata": {
    "lastUpdate": "2026-03-25T02:15:00Z",
    "totalTeams": 43
  },
  "teams": [
    { "id": "spain", "name": "Spain", "currentProbability": 0.153 },
    ...
  ],
  "history": {
    "spain": [
      { "date": "2025-07-01", "probability": 0.08 },
      { "date": "2025-07-04", "probability": 0.09 },
      ...
    ],
    ...
  }
}
```

- **teams**: sorted alphabetically by `id` for deterministic diffs
- **history**: keyed by team ID; consecutive entries with the same probability are omitted (forward-fill compressed). The frontend restores full daily resolution up to `metadata.lastUpdate`

## Frontend Architecture

Single-page vanilla JavaScript app, bundled by Vite. No framework.

| Module | Responsibility |
|--------|---------------|
| `main.js` | Data loading (with forward-fill expansion), app state, view switching, component orchestration |
| `chart.js` | TradingView Lightweight Charts v5 integration |
| `table.js` | Table rendering with DOM APIs |
| `race.js` | Animated bar-chart race with playback controls |
| `filter.js` | Multi-select team filter with checkbox state management |
| `flags.js` | Country flag emoji mapping (ISO 3166-1 alpha-2 codes) |

### State Management

Application state is minimal and module-scoped in `main.js`. The filter state lives in the DOM (checkbox checked states) and is read fresh on each change event, naturally persisting across view switches since the filter panel remains mounted.

### Styling

Custom CSS implementing Material Design v3 principles with a dark theme using five brand colors (Midnight Violet, Deep Twilight, French Blue, Sky Surge, Amber Gold). Responsive via CSS Grid layout with a sidebar filter panel on desktop and an overlay drawer on mobile.

## APIs

| API | Base URL | Endpoint | Auth | Rate Limit |
|-----|----------|----------|------|------------|
| Gamma | `https://gamma-api.polymarket.com` | `GET /events` | None | 500 req/10s |
| CLOB | `https://clob.polymarket.com` | `GET /prices-history` | None | 1000 req/10s |
