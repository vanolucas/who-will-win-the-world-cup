let onChangeCallback = null;
let top8Ids = [];
let renderIcon = () => null;

function createEntrantRow(entrant, selectedSet) {
  const row = document.createElement("label");
  row.className = "filter-row";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.value = entrant.id;
  checkbox.checked = selectedSet.has(entrant.id);
  checkbox.addEventListener("change", emitChange);

  const nameSpan = document.createElement("span");
  nameSpan.className = "filter-entrant-name";
  const icon = renderIcon(entrant);
  if (icon) nameSpan.appendChild(icon);
  const nameText = document.createElement("span");
  nameText.textContent = entrant.name;
  nameSpan.appendChild(nameText);

  const probBadge = document.createElement("span");
  probBadge.className = "filter-prob-badge";
  probBadge.textContent = (entrant.currentProbability * 100).toFixed(1) + "%";

  row.append(checkbox, nameSpan, probBadge);
  return row;
}

export function initFilter(entrants, defaultSelectedIds, onChange, options = {}) {
  onChangeCallback = onChange;
  renderIcon = options.renderIcon || (() => null);
  const zeroLabel = options.zeroProbabilityLabel || "Eliminated";
  const showZeroSection = options.showZeroProbabilitySection !== false;

  const list = document.getElementById("filter-list");
  list.replaceChildren();
  const selectedSet = new Set(defaultSelectedIds);
  top8Ids = entrants.slice(0, 8).map((t) => t.id);

  const activeEntrants = entrants.filter((t) => t.currentProbability > 0);
  const zeroEntrants = entrants.filter((t) => t.currentProbability === 0);

  for (const entrant of activeEntrants) {
    list.appendChild(createEntrantRow(entrant, selectedSet));
  }

  // Only render the zero-probability section when the event opts into it
  // (e.g. eliminated World Cup teams). Otherwise those entrants are omitted.
  if (showZeroSection && zeroEntrants.length > 0) {
    const divider = document.createElement("div");
    divider.className = "filter-section-title";
    divider.textContent = zeroLabel;
    list.appendChild(divider);

    for (const entrant of zeroEntrants) {
      list.appendChild(createEntrantRow(entrant, selectedSet));
    }
  }

  document.getElementById("select-all-btn").addEventListener("click", () => {
    list.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.checked = true;
    });
    emitChange();
  });

  document.getElementById("top-8-btn").addEventListener("click", () => {
    const top8Set = new Set(top8Ids);
    list.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.checked = top8Set.has(cb.value);
    });
    emitChange();
  });

  document.getElementById("clear-all-btn").addEventListener("click", () => {
    list.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.checked = false;
    });
    emitChange();
  });
}

function emitChange() {
  if (onChangeCallback) {
    onChangeCallback(getSelectedEntrantIds());
  }
}

export function getSelectedEntrantIds() {
  const checkboxes = document.querySelectorAll(
    '#filter-list input[type="checkbox"]:checked'
  );
  return Array.from(checkboxes).map((cb) => cb.value);
}
