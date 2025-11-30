// Update the on-screen controls-info panel to reflect configured players
export function updateControlsInfoUI(playersList) {
  try {
    const container = document.querySelector(".controls-info");
    if (!container) return;
    const existing = container.querySelector(".player-controls");
    if (existing) existing.remove();

    const playerControls = document.createElement("div");
    playerControls.className = "player-controls compact-roster";
    
    playersList.forEach((p) => {
      const div = document.createElement("div");
      div.className = `player-chip player${p.id}`;
      div.title = `Controls: ${p.controls}`; // Tooltip for controls

      const r = Math.round(p.color[0] * 255);
      const g = Math.round(p.color[1] * 255);
      const b = Math.round(p.color[2] * 255);
      const colorCss = `rgb(${r}, ${g}, ${b})`;

      const sw = document.createElement("span");
      sw.className = "swatch";
      sw.style.background = colorCss;
      
      const nameSpan = document.createElement("span");
      nameSpan.className = "name";
      nameSpan.textContent = p.name;

      const scoreSpan = document.createElement("span");
      scoreSpan.className = "score";
      scoreSpan.textContent = `${p.score != null ? p.score : 0}`;

      div.appendChild(sw);
      div.appendChild(nameSpan);
      div.appendChild(scoreSpan);
      playerControls.appendChild(div);
    });

    const gameInfo = container.querySelector(".game-info");
    if (gameInfo) container.insertBefore(playerControls, gameInfo);
    else container.appendChild(playerControls);
  } catch (e) {
    // silent
  }
}
