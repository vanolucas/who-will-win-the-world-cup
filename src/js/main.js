import { initChart, updateChart, resizeChart } from "./chart.js";
import { updateTable } from "./table.js";
import { initFilter, getSelectedTeamIds } from "./filter.js";

const state = {
  data: null,
  currentView: "chart",
};

async function loadData() {
  const resp = await fetch("./odds.json");
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
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

  // Update empty state visibility
  updateEmptyState();
}

function updateEmptyState() {
  const selected = getSelectedTeamIds();
  const emptyState = document.getElementById("empty-state");
  const chartView = document.getElementById("chart-view");
  const tableView = document.getElementById("table-view");

  if (selected.length === 0 && state.currentView !== "about") {
    emptyState.classList.remove("hidden");
    chartView.classList.add("hidden");
    tableView.classList.add("hidden");
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
  updateTable(document.getElementById("table-view"), state.data, selectedIds);
}

function setupViewSwitcher() {
  document.querySelectorAll(".view-btn").forEach((btn) => {
    btn.addEventListener("click", () => showView(btn.dataset.view));
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
  document.getElementById("total-teams").textContent = metadata.totalTeams;
}

async function init() {
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
  const top10Ids = data.teams.slice(0, 10).map((t) => t.id);

  // Init components
  initFilter(data.teams, top10Ids, onFilterChange);

  const chartContainer = document.getElementById("chart-container");
  const legendContainer = document.getElementById("chart-legend");
  initChart(chartContainer, legendContainer);
  updateChart(data, top10Ids);

  updateTable(document.getElementById("table-view"), data, top10Ids);
  populateAbout(data.metadata);
}

init();
