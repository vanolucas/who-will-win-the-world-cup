const COLORS = [
  "#c8a04e", "#5ea690", "#c4795a", "#7a90bf", "#6aad76",
  "#bf7a8a", "#c8905a", "#9a82b5", "#5ba2a8", "#c47a78",
  "#c4b86a", "#74b898", "#c8956e", "#8a88c2", "#8aaa68",
  "#b580a6", "#c49a5e", "#9a7eaa", "#5ca0a0", "#c4826e",
];

const BAR_HEIGHT = 36;
const BAR_GAP = 4;
const BASE_SPEED = 3;
const LERP_BASE = 0.12;
const MIN_PROB = 0.01;

let container = null;
let barsInner = null;
let dateEl = null;
let progressEl = null;
let scrubberEl = null;
let playBtnEl = null;

let animId = null;
let playing = false;
let speed = 1;
let currentTime = 0;
let prevTs = null;
let keyHandler = null;

let allDates = [];
let teams = [];
let bars = new Map();

export function initRace(containerEl) {
  container = containerEl;
  container.innerHTML = `
    <div class="race-header">
      <div class="race-date"></div>
      <div class="race-progress"><div class="race-progress__fill"></div></div>
    </div>
    <div class="race-bars"><div class="race-bars__inner"></div></div>
    <div class="race-controls">
      <button class="race-ctrl-btn race-ctrl-restart" aria-label="Restart" title="Restart">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
        </svg>
      </button>
      <button class="race-ctrl-btn race-ctrl-play" aria-label="Play" title="Play / Pause (Space)">
        <svg class="icon-play" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21"/></svg>
        <svg class="icon-pause" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="display:none"><rect x="5" y="3" width="4" height="18"/><rect x="15" y="3" width="4" height="18"/></svg>
      </button>
      <div class="race-speed-group">
        <button class="race-speed-btn active" data-speed="1">1×</button>
        <button class="race-speed-btn" data-speed="2">2×</button>
        <button class="race-speed-btn" data-speed="4">4×</button>
      </div>
      <input type="range" class="race-scrubber" min="0" max="1000" step="1" value="0" aria-label="Timeline" />
    </div>
  `;

  barsInner = container.querySelector(".race-bars__inner");
  dateEl = container.querySelector(".race-date");
  progressEl = container.querySelector(".race-progress__fill");
  scrubberEl = container.querySelector(".race-scrubber");
  playBtnEl = container.querySelector(".race-ctrl-play");

  playBtnEl.addEventListener("click", togglePlay);
  container.querySelector(".race-ctrl-restart").addEventListener("click", doRestart);
  container.querySelectorAll(".race-speed-btn").forEach((btn) => {
    btn.addEventListener("click", () => setSpeed(Number(btn.dataset.speed)));
  });
  scrubberEl.addEventListener("input", onScrub);

  keyHandler = (e) => {
    if (e.target.matches("input, textarea, select")) return;
    if (!container || container.closest(".view-container.hidden")) return;
    switch (e.key) {
      case " ":
        e.preventDefault();
        togglePlay();
        break;
      case "ArrowLeft":
        e.preventDefault();
        nudge(-1);
        break;
      case "ArrowRight":
        e.preventDefault();
        nudge(1);
        break;
      case "1":
        setSpeed(1);
        break;
      case "2":
        setSpeed(2);
        break;
      case "3":
        setSpeed(4);
        break;
    }
  };
  document.addEventListener("keydown", keyHandler);
}

/* ---------- Playback ---------- */

function togglePlay() {
  playing ? doPause() : doPlay();
}

function doPlay() {
  if (allDates.length < 2) return;
  if (currentTime >= allDates.length - 1) {
    currentTime = 0;
    snapBars();
  }
  playing = true;
  prevTs = null;
  syncPlayIcon();
  animId = requestAnimationFrame(tick);
}

function doPause() {
  playing = false;
  if (animId) {
    cancelAnimationFrame(animId);
    animId = null;
  }
  syncPlayIcon();
}

function doRestart() {
  currentTime = 0;
  snapBars();
  render(true);
  syncScrubber();
}

function setSpeed(s) {
  speed = s;
  if (!container) return;
  container.querySelectorAll(".race-speed-btn").forEach((b) =>
    b.classList.toggle("active", Number(b.dataset.speed) === s),
  );
}

function nudge(days) {
  const max = Math.max(0, allDates.length - 1);
  currentTime = Math.max(0, Math.min(max, currentTime + days));
  render(true);
  syncScrubber();
}

function onScrub() {
  const max = Math.max(1, allDates.length - 1);
  currentTime = (scrubberEl.value / 1000) * max;
  render(true);
}

function syncScrubber() {
  if (!scrubberEl || allDates.length < 2) return;
  const pct = (currentTime / (allDates.length - 1)) * 1000;
  scrubberEl.value = pct;
  if (progressEl) progressEl.style.width = pct / 10 + "%";
}

function syncPlayIcon() {
  if (!playBtnEl) return;
  playBtnEl.querySelector(".icon-play").style.display = playing ? "none" : "";
  playBtnEl.querySelector(".icon-pause").style.display = playing ? "" : "none";
  playBtnEl.setAttribute("aria-label", playing ? "Pause" : "Play");
}

/* ---------- Animation ---------- */

function tick(timestamp) {
  if (!playing) return;
  if (prevTs !== null) {
    const dt = (timestamp - prevTs) / 1000;
    currentTime += dt * BASE_SPEED * speed;
  }
  prevTs = timestamp;

  const max = allDates.length - 1;
  if (currentTime >= max) {
    currentTime = max;
    render(false);
    syncScrubber();
    doPause();
    return;
  }

  render(false);
  syncScrubber();
  animId = requestAnimationFrame(tick);
}

/* ---------- Rendering ---------- */

function render(instant) {
  if (allDates.length === 0 || teams.length === 0) return;

  const max = allDates.length - 1;
  const t = Math.max(0, Math.min(max, currentTime));
  const lo = Math.floor(t);
  const hi = Math.min(lo + 1, max);
  const frac = t - lo;

  const loDate = allDates[lo];
  const hiDate = allDates[hi];

  if (dateEl) dateEl.textContent = fmtDate(loDate);

  const ranked = teams.map((tm) => {
    const p0 = tm.lookup.get(loDate) ?? 0;
    const p1 = tm.lookup.get(hiDate) ?? p0;
    return { id: tm.id, prob: p0 + (p1 - p0) * frac };
  });
  ranked.sort((a, b) => b.prob - a.prob);

  const maxProb = Math.max(ranked[0]?.prob ?? MIN_PROB, MIN_PROB);
  const factor = instant ? 1 : LERP_BASE;

  for (let i = 0; i < ranked.length; i++) {
    const { id, prob } = ranked[i];
    const bar = bars.get(id);
    if (!bar) continue;

    const targetY = i * (BAR_HEIGHT + BAR_GAP);
    const targetW = (prob / maxProb) * 100;

    bar.y += (targetY - bar.y) * factor;
    bar.w += (targetW - bar.w) * factor;
    bar.p += (prob - bar.p) * factor;

    bar.el.style.transform = `translateY(${bar.y}px)`;
    bar.fill.style.width = bar.w + "%";
    bar.val.textContent = (bar.p * 100).toFixed(1) + "%";
    bar.rank.textContent = i + 1;

    bar.el.classList.toggle("race-bar--leader", i === 0);
  }
}

function fmtDate(d) {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00Z");
  return dt.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/* ---------- Data ---------- */

export function updateRace(data, selectedTeamIds) {
  if (!container) return;

  const sel = new Set(selectedTeamIds);
  const picked = data.teams.filter((t) => sel.has(t.id));

  const dset = new Set();
  for (const t of picked) {
    for (const h of data.history[t.id] || []) dset.add(h.date);
  }
  allDates = [...dset].sort();
  if (allDates.length === 0) return;

  teams = picked.map((t) => {
    const gi = data.teams.indexOf(t);
    const color = COLORS[gi % COLORS.length];
    const hist = data.history[t.id] || [];
    const lookup = new Map();
    let hi = 0;
    let last = 0;
    for (const date of allDates) {
      while (hi < hist.length && hist[hi].date <= date) {
        last = hist[hi].probability;
        hi++;
      }
      lookup.set(date, last);
    }
    return { id: t.id, name: t.name, color, lookup };
  });

  buildBars();

  if (currentTime > allDates.length - 1) {
    currentTime = Math.max(0, allDates.length - 1);
  }
  snapBars();
  render(true);
  syncScrubber();
}

function buildBars() {
  if (!barsInner) return;
  barsInner.innerHTML = "";
  bars.clear();

  const totalH = teams.length * (BAR_HEIGHT + BAR_GAP);
  barsInner.style.height = totalH + "px";

  for (const tm of teams) {
    const el = document.createElement("div");
    el.className = "race-bar";
    el.style.height = BAR_HEIGHT + "px";

    const rank = document.createElement("span");
    rank.className = "race-bar__rank";

    const name = document.createElement("span");
    name.className = "race-bar__name";
    name.textContent = tm.name;

    const track = document.createElement("div");
    track.className = "race-bar__track";

    const fill = document.createElement("div");
    fill.className = "race-bar__fill";
    fill.style.background = `linear-gradient(90deg, ${tm.color}, ${lighten(tm.color, 30)})`;
    track.appendChild(fill);

    const val = document.createElement("span");
    val.className = "race-bar__value";

    el.append(rank, name, track, val);
    barsInner.appendChild(el);

    bars.set(tm.id, { el, fill, val, rank, y: 0, w: 0, p: 0 });
  }
}

function snapBars() {
  for (const b of bars.values()) {
    b.y = 0;
    b.w = 0;
    b.p = 0;
  }
}

function lighten(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 0xff) + amt);
  const g = Math.min(255, ((n >> 8) & 0xff) + amt);
  const b = Math.min(255, (n & 0xff) + amt);
  return `rgb(${r},${g},${b})`;
}

/* ---------- Lifecycle ---------- */

export function pauseRace() {
  doPause();
}

export function destroyRace() {
  doPause();
  if (keyHandler) {
    document.removeEventListener("keydown", keyHandler);
    keyHandler = null;
  }
  bars.clear();
  teams = [];
  allDates = [];
  currentTime = 0;
  if (container) container.innerHTML = "";
  container = null;
  barsInner = null;
  dateEl = null;
  progressEl = null;
  scrubberEl = null;
  playBtnEl = null;
}
