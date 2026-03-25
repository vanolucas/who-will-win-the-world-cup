let onChangeCallback = null;

export function initFilter(teams, defaultSelectedIds, onChange) {
  onChangeCallback = onChange;
  const list = document.getElementById("filter-list");
  const selectedSet = new Set(defaultSelectedIds);

  for (const team of teams) {
    const row = document.createElement("label");
    row.className = "filter-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = team.id;
    checkbox.checked = selectedSet.has(team.id);
    checkbox.addEventListener("change", emitChange);

    const nameSpan = document.createElement("span");
    nameSpan.className = "filter-team-name";
    nameSpan.textContent = team.name;

    const probBadge = document.createElement("span");
    probBadge.className = "filter-prob-badge";
    probBadge.textContent = (team.currentProbability * 100).toFixed(1) + "%";

    row.append(checkbox, nameSpan, probBadge);
    list.appendChild(row);
  }

  document.getElementById("select-all-btn").addEventListener("click", () => {
    list.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.checked = true;
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
    onChangeCallback(getSelectedTeamIds());
  }
}

export function getSelectedTeamIds() {
  const checkboxes = document.querySelectorAll(
    '#filter-list input[type="checkbox"]:checked'
  );
  return Array.from(checkboxes).map((cb) => cb.value);
}
