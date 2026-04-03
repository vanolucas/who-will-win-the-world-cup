import { getFlag } from "./flags.js";

function compute7dChange(history, currentProbability) {
  if (!history || history.length < 2) return null;
  const latest = currentProbability;
  // Find the entry closest to 7 days ago
  const targetIdx = Math.max(0, history.length - 8);
  const older = history[targetIdx].probability;
  return (latest - older) * 100;
}

export function updateTable(container, data, selectedTeamIds) {
  const selectedSet = new Set(selectedTeamIds);

  const teams = data.teams
    .map((team, index) => ({ ...team, rank: index + 1 }))
    .filter((team) => selectedSet.has(team.id));

  const table = document.createElement("table");
  table.className = "odds-table";

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  ["#", "Team", "Probability", "7d Change"].forEach((text) => {
    const th = document.createElement("th");
    th.textContent = text;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  for (const team of teams) {
    const tr = document.createElement("tr");

    const rankTd = document.createElement("td");
    rankTd.className = "rank-cell";
    rankTd.textContent = team.rank;
    tr.appendChild(rankTd);

    const nameTd = document.createElement("td");
    const flag = getFlag(team.id);
    nameTd.textContent = flag ? `${flag} ${team.name}` : team.name;
    tr.appendChild(nameTd);

    const probTd = document.createElement("td");
    probTd.className = "prob-cell";
    probTd.textContent = (team.currentProbability * 100).toFixed(1) + "%";
    tr.appendChild(probTd);

    const changeTd = document.createElement("td");
    changeTd.className = "change-cell";
    const change = compute7dChange(data.history[team.id], team.currentProbability);
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
