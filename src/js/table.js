function compute7dChange(history, currentProbability) {
  if (!history || history.length < 2) return null;
  const latest = currentProbability;
  // Find the entry closest to 7 days ago
  const targetIdx = Math.max(0, history.length - 8);
  const older = history[targetIdx].probability;
  return (latest - older) * 100;
}

export function updateTable(container, data, selectedEntrantIds, options = {}) {
  const { renderIcon = () => null, entrantNoun = "Team" } = options;
  const selectedSet = new Set(selectedEntrantIds);

  const entrants = data.entrants
    .map((entrant, index) => ({ ...entrant, rank: index + 1 }))
    .filter((entrant) => selectedSet.has(entrant.id));

  const table = document.createElement("table");
  table.className = "odds-table";

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  ["#", entrantNoun, "Probability", "7d Change"].forEach((text) => {
    const th = document.createElement("th");
    th.textContent = text;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  for (const entrant of entrants) {
    const tr = document.createElement("tr");

    const rankTd = document.createElement("td");
    rankTd.className = "rank-cell";
    rankTd.textContent = entrant.rank;
    tr.appendChild(rankTd);

    const nameTd = document.createElement("td");
    const nameCell = document.createElement("span");
    nameCell.className = "entrant-name-cell";
    const icon = renderIcon(entrant);
    if (icon) nameCell.appendChild(icon);
    const nameText = document.createElement("span");
    nameText.textContent = entrant.name;
    nameCell.appendChild(nameText);
    nameTd.appendChild(nameCell);
    tr.appendChild(nameTd);

    const probTd = document.createElement("td");
    probTd.className = "prob-cell";
    probTd.textContent = (entrant.currentProbability * 100).toFixed(1) + "%";
    tr.appendChild(probTd);

    const changeTd = document.createElement("td");
    changeTd.className = "change-cell";
    const change = compute7dChange(data.history[entrant.id], entrant.currentProbability);
    if (change === null) {
      changeTd.textContent = "--";
      changeTd.classList.add("neutral");
    } else {
      const sign = change > 0 ? "+" : "";
      changeTd.textContent = sign + change.toFixed(1) + "%";
      changeTd.classList.add(
        change > 0.05 ? "positive" : change < -0.05 ? "negative" : "neutral"
      );
    }
    tr.appendChild(changeTd);

    tbody.appendChild(tr);
  }

  table.appendChild(tbody);

  container.replaceChildren(table);
}
