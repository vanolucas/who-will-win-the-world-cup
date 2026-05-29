#!/usr/bin/env python3
"""Fetch odds from Polymarket for every configured event.

The list of events lives in ``events.config.json`` at the repository root and is
shared with the frontend. For each event this script fetches the candidate/team
markets and their daily price history from Polymarket and writes
``data/<event-id>/odds.json``. Events whose ``iconType`` is ``"image"`` also get
their candidate photos cached under ``data/<event-id>/images/``.

The script is defensive: each event is fetched in isolation so that one failing
event never aborts the others, transient HTTP errors are retried with backoff,
and an event's previous ``odds.json`` is preserved if its fetch fails (we never
overwrite good data with empty data).
"""

from __future__ import annotations

import json
import logging
import mimetypes
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

REPO_ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = REPO_ROOT / "events.config.json"
DATA_DIR = REPO_ROOT / "data"

REQUEST_DELAY = 0.15
MAX_RETRIES = 3
RETRY_BACKOFF = 1.5

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%SZ",
)
logger = logging.getLogger(__name__)


def entrant_id(name: str) -> str:
    """Generate a URL-friendly id from an entrant (team/candidate) name."""
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


def request_with_retries(url: str, params: dict[str, Any], **kwargs: Any) -> requests.Response:
    """GET a URL, retrying transient errors with exponential backoff."""
    last_exc: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.get(url, params=params, timeout=30, **kwargs)
            resp.raise_for_status()
            return resp
        except requests.RequestException as exc:
            last_exc = exc
            if attempt < MAX_RETRIES:
                delay = RETRY_BACKOFF ** attempt
                logger.warning(
                    "Request to %s failed (attempt %d/%d): %s; retrying in %.1fs",
                    url, attempt, MAX_RETRIES, exc, delay,
                )
                time.sleep(delay)
    assert last_exc is not None
    raise last_exc


def fetch_markets(slug: str) -> list[dict[str, Any]]:
    """Fetch all markets (entrants) for an event from the Gamma API."""
    logger.info("Fetching markets for slug '%s'...", slug)
    resp = request_with_retries(f"{GAMMA_API}/events", {"slug": slug})
    events = resp.json()

    if not events:
        raise ValueError(f"No event found for slug: {slug}")

    event = events[0]
    markets = event.get("markets", [])
    logger.info("Found %d markets for event: %s", len(markets), event.get("title", "Unknown"))

    entrants: list[dict[str, Any]] = []
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
        entrants.append({
            "id": entrant_id(name),
            "name": name,
            "token_id": clob_token_ids[0],
            "current_price": price,
            "image_url": m.get("image") or m.get("icon") or "",
        })

    entrants.sort(key=lambda t: t["id"])
    logger.info("Parsed %d active entrants", len(entrants))
    return entrants


def fetch_price_history(token_id: str, history_filter: dict[str, Any] | None) -> list[dict[str, Any]]:
    """Fetch daily price history for a given token from the CLOB API."""
    resp = request_with_retries(
        f"{CLOB_API}/prices-history",
        {"market": token_id, "interval": "max", "fidelity": 1440},
    )
    history = resp.json().get("history", [])

    # Deduplicate by date, keeping the last entry per day
    by_date: dict[str, float] = {}
    for point in history:
        dt = datetime.fromtimestamp(point["t"], tz=timezone.utc)
        by_date[dt.strftime("%Y-%m-%d")] = round(point["p"], 6)

    points = [{"date": d, "probability": p} for d, p in by_date.items()]
    points = apply_history_filter(points, history_filter)
    return sorted(points, key=lambda x: x["date"])


def apply_history_filter(
    points: list[dict[str, Any]], history_filter: dict[str, Any] | None
) -> list[dict[str, Any]]:
    """Apply an optional, config-driven history filter.

    The only filter currently supported is ``worldcup2025``: it drops noisy
    early data points from 2025 whose probability is implausibly high (> 0.40),
    which was specific to the World Cup market's pre-launch period.
    """
    if not history_filter:
        return points
    if history_filter.get("type") == "worldcup2025":
        return [
            p for p in points
            if not (p["date"].startswith("2025-") and p["probability"] > 0.40)
        ]
    return points


def download_image(url: str, dest_dir: Path, entrant: str) -> str | None:
    """Download an entrant image into ``dest_dir`` and return its event-relative path.

    Skips the download if a cached file for the entrant already exists. Returns
    the path relative to the event data directory (e.g. ``images/spain.png``) or
    ``None`` if no image could be obtained.
    """
    if not url:
        return None

    dest_dir.mkdir(parents=True, exist_ok=True)
    existing = list(dest_dir.glob(f"{entrant}.*"))
    if existing:
        return f"images/{existing[0].name}"

    try:
        resp = request_with_retries(url, {})
    except requests.RequestException:
        logger.warning("Failed to download image for %s from %s", entrant, url, exc_info=True)
        return None

    ext = Path(url.split("?")[0]).suffix.lower()
    if ext not in {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"}:
        content_type = resp.headers.get("Content-Type", "").split(";")[0].strip()
        ext = mimetypes.guess_extension(content_type) or ".png"
        if ext == ".jpe":
            ext = ".jpg"

    filename = f"{entrant}{ext}"
    (dest_dir / filename).write_bytes(resp.content)
    return f"images/{filename}"


def compress_history(history: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Remove consecutive entries with the same probability.

    Only the first entry of each constant-value run is kept. The frontend
    forward-fills gaps on load, so full daily resolution is preserved at display
    time.
    """
    if len(history) <= 1:
        return history
    compressed: list[dict[str, Any]] = [history[0]]
    for entry in history[1:]:
        if entry["probability"] != compressed[-1]["probability"]:
            compressed.append(entry)
    return compressed


def build_output(
    event: dict[str, Any],
    entrants: list[dict[str, Any]],
    histories: dict[str, list[dict[str, Any]]],
) -> dict[str, Any]:
    """Assemble the final JSON structure for one event."""
    def entrant_record(t: dict[str, Any]) -> dict[str, Any]:
        record: dict[str, Any] = {
            "id": t["id"],
            "name": t["name"],
            "currentProbability": round(t["current_price"], 6),
        }
        if t.get("image"):
            record["image"] = t["image"]
        return record

    return {
        "metadata": {
            "lastUpdate": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "totalEntrants": len(entrants),
            "iconType": event.get("iconType", "flag"),
        },
        "entrants": [entrant_record(t) for t in entrants],
        "history": dict(sorted(
            (tid, compress_history(h)) for tid, h in histories.items()
        )),
    }


def write_atomic(path: Path, data: dict[str, Any]) -> None:
    """Write JSON atomically via temp file + rename."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_fd, tmp_path = tempfile.mkstemp(
        dir=path.parent, suffix=".tmp", prefix=".odds_"
    )
    try:
        with open(tmp_fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=4, sort_keys=True)
        Path(tmp_path).replace(path)
    except Exception:
        Path(tmp_path).unlink(missing_ok=True)
        raise


def fetch_event(event: dict[str, Any]) -> None:
    """Fetch and write data for a single event.

    On failure the event's existing ``odds.json`` (if any) is left untouched so
    that good data is never replaced with empty data.
    """
    event_id = event["id"]
    event_dir = DATA_DIR / event_id
    output_path = event_dir / "odds.json"
    icon_type = event.get("iconType", "flag")
    history_filter = event.get("historyFilter")

    logger.info("=== Fetching event '%s' ===", event_id)
    entrants = fetch_markets(event["polymarketSlug"])

    histories: dict[str, list[dict[str, Any]]] = {}
    for i, entrant in enumerate(entrants):
        logger.info("  [%d/%d] %s...", i + 1, len(entrants), entrant["name"])
        try:
            histories[entrant["id"]] = fetch_price_history(entrant["token_id"], history_filter)
        except Exception:
            logger.warning("Failed to fetch history for %s, skipping", entrant["name"], exc_info=True)
            histories[entrant["id"]] = []

        if icon_type == "image":
            entrant["image"] = download_image(
                entrant["image_url"], event_dir / "images", entrant["id"]
            )

        if i < len(entrants) - 1:
            time.sleep(REQUEST_DELAY)

    output = build_output(event, entrants, histories)
    write_atomic(output_path, output)
    logger.info(
        "Wrote %s (%d entrants, %d with history)",
        output_path, len(entrants), sum(1 for h in histories.values() if h),
    )


def load_config() -> dict[str, Any]:
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return json.load(f)


def main() -> None:
    config = load_config()
    events = config.get("events", [])
    if not events:
        logger.error("No events configured in %s", CONFIG_PATH)
        sys.exit(1)

    failures: list[str] = []
    for event in events:
        try:
            fetch_event(event)
        except Exception:
            logger.exception("Failed to fetch event '%s'; keeping previous data", event.get("id"))
            failures.append(event.get("id", "unknown"))

    if failures:
        logger.error("Some events failed: %s", ", ".join(failures))
        # Fail only if *every* event failed; otherwise we still have fresh data
        # for the successful events and want the deploy to proceed.
        if len(failures) == len(events):
            sys.exit(1)


if __name__ == "__main__":
    main()
