#!/usr/bin/env python3
"""Fetch World Cup odds from Polymarket and write data/odds.json."""

from __future__ import annotations

import json
import logging
import re
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

GAMMA_API = "https://gamma-api.polymarket.com"
CLOB_API = "https://clob.polymarket.com"
EVENT_SLUG = "2026-fifa-world-cup-winner-595"
OUTPUT_PATH = Path(__file__).resolve().parent.parent / "data" / "odds.json"
REQUEST_DELAY = 0.15

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%SZ",
)
logger = logging.getLogger(__name__)


def team_id(name: str) -> str:
    """Generate a URL-friendly id from a team name."""
    slug = name.lower().strip()
    slug = re.sub(r"[^a-z0-9\s-]", "", slug)
    slug = re.sub(r"[\s]+", "-", slug)
    return slug


def parse_stringified_list(value: Any) -> list[str]:
    """Parse a field that may be a native list or a JSON-encoded string."""
    if isinstance(value, list):
        return [str(v) for v in value]
    if isinstance(value, str):
        value = value.strip()
        try:
            parsed = json.loads(value)
            if isinstance(parsed, list):
                return [str(v) for v in parsed]
        except json.JSONDecodeError:
            pass
        # Fallback: strip brackets and split
        value = value.strip('"[]')
        return [v.strip().strip('"') for v in value.split(",") if v.strip()]
    return []


def fetch_markets() -> list[dict[str, Any]]:
    """Fetch all markets (teams) for the World Cup event from Gamma API."""
    logger.info("Fetching markets from Gamma API...")
    resp = requests.get(f"{GAMMA_API}/events", params={"slug": EVENT_SLUG}, timeout=30)
    resp.raise_for_status()
    events = resp.json()

    if not events:
        raise ValueError(f"No event found for slug: {EVENT_SLUG}")

    event = events[0]
    markets = event.get("markets", [])
    logger.info("Found %d markets for event: %s", len(markets), event.get("title", "Unknown"))

    teams: list[dict[str, Any]] = []
    for m in markets:
        if not m.get("active", True):
            continue

        outcomes = parse_stringified_list(m.get("outcomes", ""))
        clob_token_ids = parse_stringified_list(m.get("clobTokenIds", ""))
        outcome_prices = parse_stringified_list(m.get("outcomePrices", ""))

        if not (outcomes and clob_token_ids and outcome_prices):
            continue

        try:
            price = float(outcome_prices[0])
        except (ValueError, IndexError):
            continue

        name = m.get("groupItemTitle", outcomes[0])
        teams.append({
            "id": team_id(name),
            "name": name,
            "token_id": clob_token_ids[0],
            "current_price": price,
        })

    teams.sort(key=lambda t: t["current_price"], reverse=True)
    logger.info("Parsed %d active teams", len(teams))
    return teams


def fetch_price_history(token_id: str) -> list[dict[str, Any]]:
    """Fetch daily price history for a given token from CLOB API."""
    resp = requests.get(
        f"{CLOB_API}/prices-history",
        params={"market": token_id, "interval": "max", "fidelity": 1440},
        timeout=30,
    )
    resp.raise_for_status()
    history = resp.json().get("history", [])

    # Deduplicate by date, keeping the last entry per day
    by_date: dict[str, float] = {}
    for point in history:
        dt = datetime.fromtimestamp(point["t"], tz=timezone.utc)
        by_date[dt.strftime("%Y-%m-%d")] = round(point["p"], 6)

    return [{"date": d, "probability": p} for d, p in by_date.items()]


def build_output(
    teams: list[dict[str, Any]],
    histories: dict[str, list[dict[str, Any]]],
) -> dict[str, Any]:
    """Assemble the final JSON structure."""
    return {
        "metadata": {
            "lastUpdate": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "totalTeams": len(teams),
        },
        "teams": [
            {
                "id": t["id"],
                "name": t["name"],
                "currentProbability": round(t["current_price"], 6),
            }
            for t in teams
        ],
        "history": histories,
    }


def write_atomic(path: Path, data: dict[str, Any]) -> None:
    """Write JSON atomically via temp file + rename."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_fd, tmp_path = tempfile.mkstemp(
        dir=path.parent, suffix=".tmp", prefix=".odds_"
    )
    try:
        with open(tmp_fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=4)
        Path(tmp_path).replace(path)
    except Exception:
        Path(tmp_path).unlink(missing_ok=True)
        raise


def main() -> None:
    try:
        teams = fetch_markets()
    except Exception:
        logger.exception("Failed to fetch markets")
        sys.exit(1)

    histories: dict[str, list[dict[str, Any]]] = {}
    for i, team in enumerate(teams):
        logger.info("  [%d/%d] Fetching history for %s...", i + 1, len(teams), team["name"])
        try:
            histories[team["id"]] = fetch_price_history(team["token_id"])
        except Exception:
            logger.warning("Failed to fetch history for %s, skipping", team["name"], exc_info=True)
            histories[team["id"]] = []
        if i < len(teams) - 1:
            time.sleep(REQUEST_DELAY)

    output = build_output(teams, histories)
    write_atomic(OUTPUT_PATH, output)
    logger.info("Wrote %s (%d teams, %d with history)", OUTPUT_PATH, len(teams),
                sum(1 for h in histories.values() if h))


if __name__ == "__main__":
    main()
