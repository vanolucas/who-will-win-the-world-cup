# Who Will Win the World Cup?

A static dashboard displaying winning probabilities for each team in the FIFA World Cup 2026, updated daily from prediction market data.

**Live site**: https://vanolucas.github.io/who-will-win-the-world-cup/

## Features

- **Interactive chart** showing the evolution of winning probabilities over time
- **Table view** with current rankings and 7-day trends
- **Team filter** to focus on specific teams (multi-select, persists across views)
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

This fetches the latest odds from Polymarket and writes `data/odds.json`.

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

- **Daily at 02:00 UTC** (scheduled)
- **On manual trigger** (Actions tab > "Update Data and Deploy" > Run workflow)

It performs two jobs:

1. **update-data**: Fetches latest odds from Polymarket and commits `data/odds.json`
2. **build-and-deploy**: Builds the static site with Vite and deploys to GitHub Pages

If the data fetch fails, the site is still deployed with the last successfully fetched data.

## Project Structure

```
who-will-win-the-world-cup/
├── .github/workflows/
│   └── update-and-deploy.yml  # CI/CD: daily fetch + build + deploy
├── scripts/
│   └── fetch_odds.py          # Polymarket data fetcher (Python)
├── src/
│   ├── index.html             # Single-page app
│   ├── css/styles.css         # Material Design v3 dark theme
│   └── js/
│       ├── main.js            # App entry, data loading, routing
│       ├── chart.js           # TradingView Lightweight Charts
│       ├── table.js           # Table view
│       └── filter.js          # Team filter component
├── data/
│   └── odds.json              # Latest odds data (committed)
├── docs/
│   └── ARCHITECTURE.md
├── vite.config.js
├── package.json
└── pyproject.toml
```

## License

MIT
