import { createChart, LineSeries, CrosshairMode } from "lightweight-charts";

const COLORS = [
  "#06bee1", "#ffbe0b", "#4ade80", "#f87171", "#a78bfa",
  "#fb923c", "#f472b6", "#38bdf8", "#facc15", "#34d399",
  "#e879f7", "#60a5fa", "#fbbf24", "#c084fc", "#22d3ee",
  "#fb7185", "#a3e635", "#818cf8", "#f97316", "#2dd4bf",
];

let chart = null;
let seriesMap = new Map();
let legendEl = null;

export function initChart(container, legendContainer) {
  legendEl = legendContainer;

  chart = createChart(container, {
    layout: {
      background: { color: "#0d0221" },
      textColor: "#9a9cb8",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    },
    grid: {
      vertLines: { color: "rgba(38, 64, 139, 0.2)" },
      horzLines: { color: "rgba(38, 64, 139, 0.2)" },
    },
    timeScale: {
      borderColor: "rgba(38, 64, 139, 0.4)",
      timeVisible: false,
    },
    rightPriceScale: {
      borderColor: "rgba(38, 64, 139, 0.4)",
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
    let valueStr = "";
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
        (item.value ? `<span class="legend-value">${item.value}</span>` : "") +
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
