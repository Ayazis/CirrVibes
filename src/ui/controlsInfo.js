// Update the on-screen controls-info panel to reflect configured players
export function updateControlsInfoUI(playersList) {
  try {
    const container = document.querySelector(".controls-info");
    if (!container) return;
    const title = container.querySelector("h2");
    if (title) title.textContent = "Line Evader";
    const existing = container.querySelector(".player-controls");
    if (existing) existing.remove();

    const playerControls = document.createElement("div");
    playerControls.className = "player-controls";
    playersList.forEach((p) => {
      const div = document.createElement("div");
      div.className = `player${p.id} player-card`;
      div.style.background = "rgba(255,255,255,0.03)";
      div.style.padding = "8px";
      div.style.borderRadius = "6px";
      div.style.minWidth = "160px";

      const h3 = document.createElement("h3");
      const sw = document.createElement("span");
      sw.style.display = "inline-block";
      sw.style.width = "12px";
      sw.style.height = "12px";
      sw.style.marginRight = "8px";
      sw.style.verticalAlign = "middle";
      const r = Math.round(p.color[0] * 255);
      const g = Math.round(p.color[1] * 255);
      const b = Math.round(p.color[2] * 255);
      sw.style.background = `rgb(${r}, ${g}, ${b})`;
      h3.appendChild(sw);
      const nameNode = document.createTextNode(`${p.name}`);
      h3.appendChild(nameNode);

      const scoreSpan = document.createElement("span");
      scoreSpan.className = "player-score";
      scoreSpan.style.marginLeft = "8px";
      scoreSpan.style.fontWeight = "700";
      scoreSpan.style.color = "#fff";
      scoreSpan.textContent = `${p.score != null ? p.score : 0}`;
      h3.appendChild(scoreSpan);

      const p1 = document.createElement("p");
      p1.textContent = `Controls: ${p.controls}`;
      p1.style.margin = "6px 0 0 0";
      p1.style.fontSize = "14px";

      div.appendChild(h3);
      div.appendChild(p1);
      playerControls.appendChild(div);
    });

    const gameInfo = container.querySelector(".game-info");
    if (gameInfo) container.insertBefore(playerControls, gameInfo);
    else container.appendChild(playerControls);
  } catch (e) {
    // silent
  }
}
