import { initChart, updateChart, resizeChart } from "./chart.js";
import { updateTable } from "./table.js";
import { initFilter, getSelectedEntrantIds } from "./filter.js";
import { initRace, updateRace, pauseRace, playRace } from "./race.js";
import { createIconRenderer } from "./icons.js";
import { initEventDropdown } from "./dropdown.js";

const BASE_URL = import.meta.env.BASE_URL || "/";

// Per-page configuration injected at build/dev time (see vite.config.js).
const APP_CONFIG = window.__APP_CONFIG__ || {};
const eventConfig = APP_CONFIG.event || {};
const allEvents = APP_CONFIG.events || [];

const state = {
  data: null,
  currentView: "chart",
  renderIcon: () => null,
};

async function loadData() {
  // Page lives at <base>/<event-id>/, so its own data is one folder down.
  const url = `${BASE_URL}${eventConfig.id}/odds.json`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

/**
 * True when `url` is already absolute (protocol-relative, http(s), or
 * root-relative) and therefore must not be prefixed with the event path.
 */
function isAbsoluteUrl(url) {
  return /^(https?:)?\/\//.test(url) || url.startsWith("/");
}

/**
 * Resolve each entrant's relative image path to an absolute URL so it loads
 * regardless of whether the page URL has a trailing slash.
 */
function normalizeImages(data) {
  for (const entrant of data.entrants) {
    if (entrant.image && !isAbsoluteUrl(entrant.image)) {
      entrant.image = `${BASE_URL}${eventConfig.id}/${entrant.image}`;
    }
  }
}

/**
 * Forward-fill sparse history so every entrant has one entry per day.
 *
 * The JSON file stores only the first day of each constant-value run
 * to reduce file size. This function restores full daily resolution
 * up to the metadata lastUpdate date.
 */
function forwardFillHistory(data) {
  const lastDate = data.metadata.lastUpdate.split("T")[0];

  for (const entrantId of Object.keys(data.history)) {
    const sparse = data.history[entrantId];
    if (!sparse || sparse.length === 0) continue;

    const filled = [];
    let idx = 0;
    let curDate = sparse[0].date;
    let prob = sparse[0].probability;

    while (curDate <= lastDate) {
      if (idx < sparse.length && sparse[idx].date === curDate) {
        prob = sparse[idx].probability;
        idx++;
      }
      filled.push({ date: curDate, probability: prob });
      // Advance to the next day
      const d = new Date(curDate + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + 1);
      curDate = d.toISOString().split("T")[0];
    }

    data.history[entrantId] = filled;
  }
}

function showView(viewName) {
  state.currentView = viewName;

  document.querySelectorAll(".view-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === viewName);
  });

  document.querySelectorAll(".view-container").forEach((el) => {
    el.classList.add("hidden");
  });
  document.getElementById(`${viewName}-view`).classList.remove("hidden");

  // Hide filter on about view
  const filterPanel = document.getElementById("filter-panel");
  const filterToggle = document.getElementById("filter-toggle");
  if (viewName === "about") {
    filterPanel.style.display = "none";
    filterToggle.style.display = "none";
  } else {
    filterPanel.style.display = "";
    filterToggle.style.display = "";
  }

  // Resize chart when switching to chart view
  if (viewName === "chart") {
    requestAnimationFrame(resizeChart);
  }

  // Auto-play race when switching to race view, pause when leaving
  if (viewName === "race") {
    playRace();
  } else {
    pauseRace();
  }

  // Update empty state visibility
  updateEmptyState();
}

function updateEmptyState() {
  const selected = getSelectedEntrantIds();
  const emptyState = document.getElementById("empty-state");
  const chartView = document.getElementById("chart-view");
  const tableView = document.getElementById("table-view");
  const raceView = document.getElementById("race-view");

  if (selected.length === 0 && state.currentView !== "about") {
    emptyState.classList.remove("hidden");
    chartView.classList.add("hidden");
    tableView.classList.add("hidden");
    raceView.classList.add("hidden");
  } else {
    emptyState.classList.add("hidden");
  }
}

function onFilterChange(selectedIds) {
  if (!state.data) return;

  if (selectedIds.length === 0) {
    updateEmptyState();
    return;
  }

  // Show the active view
  const activeView = document.getElementById(`${state.currentView}-view`);
  if (activeView) activeView.classList.remove("hidden");
  document.getElementById("empty-state").classList.add("hidden");

  updateChart(state.data, selectedIds);
  updateTable(document.getElementById("table-view"), state.data, selectedIds, {
    renderIcon: state.renderIcon,
    entrantNoun: eventConfig.entrantNoun,
  });
  updateRace(state.data, selectedIds);
}

function setupViewSwitcher() {
  document.querySelectorAll("[data-view]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      showView(el.dataset.view);
    });
  });
}

function setupFilterToggle() {
  const toggle = document.getElementById("filter-toggle");
  const panel = document.getElementById("filter-panel");
  const overlay = document.getElementById("filter-overlay");

  toggle.addEventListener("click", () => {
    const isOpen = panel.classList.toggle("open");
    overlay.classList.toggle("open", isOpen);
    toggle.classList.toggle("active", isOpen);
  });

  overlay.addEventListener("click", () => {
    panel.classList.remove("open");
    overlay.classList.remove("open");
    toggle.classList.remove("active");
  });
}

function populateAbout(metadata) {
  const lastUpdate = new Date(metadata.lastUpdate);
  document.getElementById("last-update").textContent = lastUpdate.toLocaleDateString(
    undefined,
    { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" }
  );
  document.getElementById("total-entrants").textContent = metadata.totalEntrants;
}

async function init() {
  initEventDropdown(allEvents, eventConfig.id);
  setupViewSwitcher();
  setupFilterToggle();

  try {
    state.data = await loadData();
  } catch (err) {
    console.error("Failed to load data:", err);
    document.getElementById("error-state").classList.remove("hidden");
    return;
  }

  const data = state.data;

  // Choose the icon renderer for this event (emoji flags vs candidate photos).
  const iconType = data.metadata.iconType || eventConfig.iconType || "flag";
  state.renderIcon = createIconRenderer(iconType);

  normalizeImages(data);

  // Expand sparse history back to full daily resolution
  forwardFillHistory(data);

  // Sort entrants by probability (descending) for display purposes.
  // The JSON file stores entrants in alphabetical order for deterministic diffs.
  data.entrants.sort((a, b) => b.currentProbability - a.currentProbability);

  const top10Ids = data.entrants.slice(0, 10).map((t) => t.id);

  // Init components
  initFilter(data.entrants, top10Ids, onFilterChange, {
    renderIcon: state.renderIcon,
    zeroProbabilityLabel: eventConfig.zeroProbabilityLabel,
    showZeroProbabilitySection: eventConfig.showZeroProbabilitySection,
  });

  const chartContainer = document.getElementById("chart-container");
  const legendContainer = document.getElementById("chart-legend");
  initChart(chartContainer, legendContainer, state.renderIcon);
  updateChart(data, top10Ids);

  updateTable(document.getElementById("table-view"), data, top10Ids, {
    renderIcon: state.renderIcon,
    entrantNoun: eventConfig.entrantNoun,
  });

  initRace(document.getElementById("race-view"), state.renderIcon);
  updateRace(data, top10Ids);

  populateAbout(data.metadata);
}

init();
