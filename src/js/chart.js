import { createChart, LineSeries, CrosshairMode } from "lightweight-charts";

const COLORS = [
  "#c8a04e", "#5ea690", "#c4795a", "#7a90bf", "#6aad76",
  "#bf7a8a", "#c8905a", "#9a82b5", "#5ba2a8", "#c47a78",
  "#c4b86a", "#74b898", "#c8956e", "#8a88c2", "#8aaa68",
  "#b580a6", "#c49a5e", "#9a7eaa", "#5ca0a0", "#c4826e",
];

let chart = null;
let seriesMap = new Map();
let legendEl = null;
let iconOverlay = null;
let crosshairOverlay = null;
let chartContainer = null;
let renderIcon = () => null;

// Cached per-entrant nodes so we don't recreate (and reload <img>) icons on
// every crosshair move or visible-range change.
let legendValueNodes = new Map();
let overlayIconNodes = new Map();
let crosshairLabelNodes = new Map();
let activeIconEntrantId = null;

export function initChart(container, legendContainer, iconRenderer) {
  legendEl = legendContainer;
  renderIcon = iconRenderer || (() => null);
  chartContainer = container;

  // Create icon overlay for line-end icons
  container.style.position = "relative";
  iconOverlay = document.createElement("div");
  iconOverlay.className = "chart-icon-overlay";
  container.appendChild(iconOverlay);

  // Create overlay for crosshair name labels (shown on hover/touch)
  crosshairOverlay = document.createElement("div");
  crosshairOverlay.className = "chart-crosshair-overlay";
  container.appendChild(crosshairOverlay);

  chart = createChart(container, {
    layout: {
      background: { color: "#101012" },
      textColor: "#9b9893",
      fontFamily: "'Outfit', system-ui, sans-serif",
    },
    grid: {
      vertLines: { color: "rgba(255, 255, 255, 0.04)" },
      horzLines: { color: "rgba(255, 255, 255, 0.04)" },
    },
    timeScale: {
      borderColor: "rgba(255, 255, 255, 0.08)",
      timeVisible: false,
    },
    rightPriceScale: {
      borderColor: "rgba(255, 255, 255, 0.08)",
    },
    crosshair: {
      mode: CrosshairMode.Normal,
    },
    localization: {
      priceFormatter: (p) => (p * 100).toFixed(1) + "%",
    },
  });

  chart.subscribeCrosshairMove(handleCrosshairMove);
  chart.timeScale().subscribeVisibleLogicalRangeChange(updateIconPositions);

  const ro = new ResizeObserver(() => {
    if (chart && container.clientWidth > 0 && container.clientHeight > 0) {
      chart.applyOptions({
        width: container.clientWidth,
        height: container.clientHeight,
      });
    }
  });
  ro.observe(container);
}

function getColor(index) {
  return COLORS[index % COLORS.length];
}

function getNextDay(dateStr) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split("T")[0];
}

export function updateChart(data, selectedEntrantIds) {
  if (!chart) return;

  // Remove old series
  for (const { series } of seriesMap.values()) {
    chart.removeSeries(series);
  }
  seriesMap.clear();

  const selectedSet = new Set(selectedEntrantIds);
  const entrantsToShow = data.entrants.filter((t) => selectedSet.has(t.id));

  // Find the global latest date for extending eliminated entrant lines
  const globalLatestDate = data.metadata.lastUpdate.split("T")[0];

  entrantsToShow.forEach((entrant) => {
    const history = data.history[entrant.id];
    if (!history || history.length === 0) return;

    const globalIndex = data.entrants.indexOf(entrant);
    const color = getColor(globalIndex);
    const lineWidth = globalIndex < 5 ? 2.5 : 1.5;

    const series = chart.addSeries(LineSeries, {
      color,
      lineWidth,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerRadius: 4,
    });

    const seriesData = history.map((h) => ({
      time: h.date,
      value: h.probability,
    }));

    // For eliminated entrants, add 0% data points to show the drop
    if (entrant.currentProbability === 0 && history.length > 0) {
      const lastDate = history[history.length - 1].date;
      const nextDay = getNextDay(lastDate);
      seriesData.push({ time: nextDay, value: 0 });
      if (nextDay < globalLatestDate) {
        seriesData.push({ time: globalLatestDate, value: 0 });
      }
    }

    series.setData(seriesData);
    seriesMap.set(entrant.id, { series, entrant, color, data: seriesData });
  });

  chart.timeScale().fitContent();
  buildLegend();
  buildOverlayIcons();
  buildCrosshairLabels();
  requestAnimationFrame(updateIconPositions);
}

function handleCrosshairMove(param) {
  updateLegendValues(param);
  updateCrosshairLabels(param);
}

/** Build the (static) legend rows once per data update, using safe DOM nodes. */
function buildLegend() {
  if (!legendEl) return;
  legendEl.replaceChildren();
  legendValueNodes = new Map();

  for (const [entrantId, { entrant, color }] of seriesMap) {
    const item = document.createElement("span");
    item.className = "legend-item";

    const dot = document.createElement("span");
    dot.className = "legend-dot";
    dot.style.background = color;
    item.appendChild(dot);

    const icon = renderIcon(entrant);
    if (icon) {
      icon.classList.add("legend-icon");
      item.appendChild(icon);
    }

    const name = document.createElement("span");
    name.textContent = entrant.name;
    item.appendChild(name);

    const value = document.createElement("span");
    value.className = "legend-value";
    value.textContent = (entrant.currentProbability * 100).toFixed(1) + "%";
    item.appendChild(value);

    legendValueNodes.set(entrantId, value);
    legendEl.appendChild(item);
  }
}

/** Update only the legend value text on crosshair move (cheap, no node churn). */
function updateLegendValues(param) {
  for (const [entrantId, { series, entrant }] of seriesMap) {
    const valueEl = legendValueNodes.get(entrantId);
    if (!valueEl) continue;
    let valueStr = (entrant.currentProbability * 100).toFixed(1) + "%";
    if (param && param.time) {
      const point = param.seriesData.get(series);
      if (point) {
        valueStr = (point.value * 100).toFixed(1) + "%";
      }
    }
    valueEl.textContent = valueStr;
  }
}

/** Build (and cache) the line-end icon nodes once per data update. */
function buildOverlayIcons() {
  if (!iconOverlay) return;
  iconOverlay.replaceChildren();
  overlayIconNodes = new Map();
  activeIconEntrantId = null;

  for (const [entrantId, { entrant }] of seriesMap) {
    const icon = renderIcon(entrant);
    if (!icon) continue;
    const label = document.createElement("span");
    label.className = "chart-icon-label";
    label.appendChild(icon);
    label.style.display = "none";
    iconOverlay.appendChild(label);
    overlayIconNodes.set(entrantId, label);
  }
}

/** Build (and cache) the crosshair name-label nodes once per data update. */
function buildCrosshairLabels() {
  if (!crosshairOverlay) return;
  crosshairOverlay.replaceChildren();
  crosshairLabelNodes = new Map();

  for (const [entrantId, { entrant }] of seriesMap) {
    const label = document.createElement("span");
    label.className = "chart-crosshair-label";
    label.textContent = entrant.name;
    label.style.display = "none";
    crosshairOverlay.appendChild(label);
    crosshairLabelNodes.set(entrantId, label);
  }
}

/**
 * On crosshair move, show each line's entrant name to the left of the point
 * where the crosshair date intersects the line, and enlarge the right-axis
 * icon of the nearest (currently selected) line.
 */
function updateCrosshairLabels(param) {
  const active = param && param.time && param.point;

  if (!active) {
    for (const label of crosshairLabelNodes.values()) {
      label.style.display = "none";
    }
    setActiveIcon(null);
    return;
  }

  const x = chart.timeScale().timeToCoordinate(param.time);
  let nearestId = null;
  let nearestDist = Infinity;

  for (const [entrantId, { series }] of seriesMap) {
    const label = crosshairLabelNodes.get(entrantId);
    if (!label) continue;

    const point = param.seriesData.get(series);
    const y = point ? series.priceToCoordinate(point.value) : null;
    if (x === null || y === null || y === undefined) {
      label.style.display = "none";
      continue;
    }

    label.style.left = x + "px";
    label.style.top = y + "px";
    label.style.display = "";

    const dist = Math.abs(y - param.point.y);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestId = entrantId;
    }
  }

  setActiveIcon(nearestId);
}

/** Enlarge the right-axis icon of the given entrant, resetting any previous. */
function setActiveIcon(entrantId) {
  if (activeIconEntrantId === entrantId) return;

  if (activeIconEntrantId !== null) {
    const prev = overlayIconNodes.get(activeIconEntrantId);
    if (prev) prev.classList.remove("chart-icon-label--active");
  }

  if (entrantId !== null) {
    const next = overlayIconNodes.get(entrantId);
    if (next) next.classList.add("chart-icon-label--active");
  }

  activeIconEntrantId = entrantId;
}

function updateIconPositions() {
  if (!iconOverlay || !chart) return;

  const visibleRange = chart.timeScale().getVisibleRange();

  for (const [entrantId, { series, data }] of seriesMap) {
    const label = overlayIconNodes.get(entrantId);
    if (!label) continue;

    let lastVisibleValue = null;
    if (visibleRange) {
      for (let i = data.length - 1; i >= 0; i--) {
        if (data[i].time <= visibleRange.to) {
          lastVisibleValue = data[i].value;
          break;
        }
      }
    }
    if (lastVisibleValue === null && data.length > 0) {
      lastVisibleValue = data[data.length - 1].value;
    }
    if (lastVisibleValue === null) {
      label.style.display = "none";
      continue;
    }

    const y = series.priceToCoordinate(lastVisibleValue);
    if (y === null || y === undefined) {
      label.style.display = "none";
      continue;
    }

    label.style.top = y + "px";
    label.style.display = "";
  }
}

export function resizeChart() {
  if (!chart) return;
  const container = chart.chartElement().parentElement;
  if (container && container.clientWidth > 0 && container.clientHeight > 0) {
    chart.applyOptions({
      width: container.clientWidth,
      height: container.clientHeight,
    });
  }
}
