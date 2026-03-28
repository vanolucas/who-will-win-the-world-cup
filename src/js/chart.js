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

export function initChart(container, legendContainer) {
  legendEl = legendContainer;

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

export function updateChart(data, selectedTeamIds) {
  if (!chart) return;

  // Remove old series
  for (const { series } of seriesMap.values()) {
    chart.removeSeries(series);
  }
  seriesMap.clear();

  const selectedSet = new Set(selectedTeamIds);
  const teamsToShow = data.teams.filter((t) => selectedSet.has(t.id));

  teamsToShow.forEach((team, i) => {
    const history = data.history[team.id];
    if (!history || history.length === 0) return;

    const globalIndex = data.teams.indexOf(team);
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

    series.setData(seriesData);
    seriesMap.set(team.id, { series, team, color });
  });

  chart.timeScale().fitContent();
  updateLegend(null);
}

function handleCrosshairMove(param) {
  updateLegend(param);
}

function updateLegend(param) {
  if (!legendEl) return;

  const items = [];
  for (const [teamId, { series, team, color }] of seriesMap) {
    let valueStr = (team.currentProbability * 100).toFixed(1) + "%";
    if (param && param.time) {
      const data = param.seriesData.get(series);
      if (data) {
        valueStr = (data.value * 100).toFixed(1) + "%";
      }
    }
    items.push({ name: team.name, color, value: valueStr });
  }

  if (items.length === 0) {
    legendEl.innerHTML = "";
    return;
  }

  legendEl.innerHTML = items
    .map(
      (item) =>
        `<span class="legend-item">` +
        `<span class="legend-dot" style="background:${item.color}"></span>` +
        `<span>${item.name}</span>` +
        `<span class="legend-value">${item.value}</span>` +
        `</span>`
    )
    .join("");
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
