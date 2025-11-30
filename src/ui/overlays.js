import { savePlayerConfig, saveFirstStartDone } from "../persistence.js";

// Injected styles for winner/draw overlays
function ensureWinnerStyles() {
  if (document.getElementById("winnerOverlayStyles")) return;
  const s = document.createElement("style");
  s.id = "winnerOverlayStyles";
  s.textContent = `
    #winnerOverlay { position: fixed; inset: 0; background: rgba(0,0,0,0.75); display:flex; align-items:center; justify-content:center; z-index:10000; }
    #winnerBox { background:#111; color:#fff; padding:20px; border-radius:8px; border:1px solid #444; min-width:280px; text-align:center; }
    #winnerBox h2 { margin:0 0 12px 0; }
    #winnerBox p { margin:8px 0; }
    #winnerBox button { margin-top:12px; padding:8px 12px; border-radius:6px; border:1px solid #444; background:#222; color:#fff; cursor:pointer; }
  `;
  document.head.appendChild(s);
}

export function showWinnerOverlay(player, onPlayAgain, options = {}) {
  try {
    ensureWinnerStyles();
    const existing = document.getElementById("winnerOverlay");
    if (existing) existing.remove();
    const overlay = document.createElement("div");
    overlay.id = "winnerOverlay";
    const box = document.createElement("div");
    box.id = "winnerBox";
    const title = document.createElement("h2");
    title.textContent = "Winner!";
    const name = document.createElement("p");
    name.textContent = `${player.name || "Player " + player.id} wins!`;
    const sw = document.createElement("div");
    sw.style.width = "28px";
    sw.style.height = "14px";
    sw.style.margin = "8px auto";
    sw.style.borderRadius = "4px";
    const r = Math.round((player.color[0] || 1) * 255);
    const g = Math.round((player.color[1] || 1) * 255);
    const b = Math.round((player.color[2] || 1) * 255);
    sw.style.background = `rgb(${r}, ${g}, ${b})`;

    const btn = document.createElement("button");
    const disablePlayAgain = !!options.disablePlayAgain;
    const disabledMessage = options.disabledMessage || "Waiting for host";
    btn.textContent = disablePlayAgain ? "Waiting..." : "Play Again";
    btn.disabled = disablePlayAgain;
    if (!disablePlayAgain) {
      btn.addEventListener("click", () => {
        try {
          document.body.removeChild(overlay);
        } catch (e) { }
        if (typeof onPlayAgain === "function") onPlayAgain();
      });
    }

    box.appendChild(title);
    box.appendChild(name);
    box.appendChild(sw);
    box.appendChild(btn);
    if (disablePlayAgain) {
      const note = document.createElement("p");
      note.className = "muted";
      note.textContent = disabledMessage;
      box.appendChild(note);
    }
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  } catch (e) {
    console.error("showWinnerOverlay failed", e);
  }
}

export function showDrawOverlay(onPlayAgain, options = {}) {
  try {
    ensureWinnerStyles();
    const existing = document.getElementById("winnerOverlay");
    if (existing) existing.remove();
    const overlay = document.createElement("div");
    overlay.id = "winnerOverlay";
    const box = document.createElement("div");
    box.id = "winnerBox";
    const title = document.createElement("h2");
    title.textContent = "Draw";
    const msg = document.createElement("p");
    msg.textContent = "All players eliminated.";
    const btn = document.createElement("button");
    const disablePlayAgain = !!options.disablePlayAgain;
    const disabledMessage = options.disabledMessage || "Waiting for host";
    btn.textContent = disablePlayAgain ? "Waiting..." : "Play Again";
    btn.disabled = disablePlayAgain;
    if (!disablePlayAgain) {
      btn.addEventListener("click", () => {
        try {
          document.body.removeChild(overlay);
        } catch (e) { }
        if (typeof onPlayAgain === "function") onPlayAgain();
      });
    }
    box.appendChild(title);
    box.appendChild(msg);
    box.appendChild(btn);
    if (disablePlayAgain) {
      const note = document.createElement("p");
      note.className = "muted";
      note.textContent = disabledMessage;
      box.appendChild(note);
    }
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  } catch (e) {
    console.error("showDrawOverlay failed", e);
  }
}

// Player configuration overlay (first-start dialog)
export function openPlayerConfigMenu() {
  try {
    const existing = document.getElementById("firstStartMenuOverlay");
    if (existing) {
      existing.style.display = "flex";
      try {
        window.playerConfigMenuOpen = true;
        if (window.gameState) window.gameState.paused = true;
      } catch (e) { }
      return;
    }

    const presets = [
      {
        name: "Player 1",
        color: "#ff0808ff",
        controls: "ArrowLeft / ArrowRight",
      },
      {
        name: "Player 2",
        color: "#8611b4ff",
        controls: "Mouse Left / Mouse Right",
      },
      { name: "Player 3", color: "#66ff66", controls: "A / D" },
      { name: "Player 4", color: "#ffffffff", controls: "Num4 / Num6" },
      { name: "Player 5", color: "#4d96ff", controls: "J / L" },
      { name: "Player 6", color: "rgba(255, 190, 237, 1)", controls: "I / K" },
      { name: "Player 7", color: "#f77f00", controls: "T / G" },
      { name: "Player 8", color: "#5ef1ff", controls: "F / H" },
      { name: "Player 9", color: "#b19dff", controls: "V / B" },
      { name: "Player 10", color: "#ffb347", controls: "N / M" },
    ];

    const saved = (() => {
      try {
        return JSON.parse(localStorage.getItem("playerConfig") || "null");
      } catch (e) {
        return null;
      }
    })();
    const players =
      Array.isArray(saved) && saved.length >= 2
        ? saved.map((s) => Object.assign({}, s))
        : [Object.assign({}, presets[0]), Object.assign({}, presets[1])];

    if (!document.getElementById("firstStartMenuStyles")) {
      const style = document.createElement("style");
      style.id = "firstStartMenuStyles";
      style.textContent = `
      #firstStartMenuOverlay { position: fixed; inset: 0; background: rgba(0,0,0,0.75); display: flex; align-items: center; justify-content: center; z-index: 9999; color: #fff; font-family: Arial, sans-serif; }
      #firstStartMenu { background: #111; border: 2px solid #fff; padding: 20px; border-radius: 8px; width: 420px; max-width: calc(100% - 40px); }
      #firstStartMenu h2 { margin: 0 0 12px 0; }
      .player-row { display:flex; align-items:center; justify-content:space-between; gap:8px; margin:8px 0; padding:8px; background: rgba(255,255,255,0.03); border-radius:6px; }
      .player-left { display:flex; align-items:center; gap:10px; }
      .color-swatch { width:28px; height:18px; border-radius:4px; border:1px solid #000; box-shadow:0 0 0 1px rgba(255,255,255,0.03) inset; }
      .controls-select { padding:6px; background:#222; color:#fff; border:1px solid #333; border-radius:4px; }
      .menu-actions { display:flex; gap:10px; justify-content:flex-end; margin-top:12px; }
      button { padding:8px 12px; border-radius:6px; border:1px solid #444; background:#222; color:#fff; cursor:pointer; }
      button.primary { background: #0b7; border-color: #087; color:#002; font-weight:700; }
      button.ghost { background:transparent; border-color:#555; }
      .add-btn { margin-left:4px; }
      .remove-btn { background:transparent; border: none; color:#f66; cursor:pointer; font-weight:600; }
      .muted { color: #aaa; font-size:13px; margin-top:8px; }
      `;
      document.head.appendChild(style);
    }

    const overlay = document.createElement("div");
    overlay.id = "firstStartMenuOverlay";

    const menu = document.createElement("div");
    menu.id = "firstStartMenu";

    const title = document.createElement("h2");
    title.textContent = "Configure Players";

    const description = document.createElement("div");
    description.className = "muted";
    description.textContent =
      "Add or edit players and controls. Settings save locally and apply immediately when you start.";

    const list = document.createElement("div");
    list.id = "playerList";

    function renderPlayers() {
      list.innerHTML = "";
      players.forEach((p, idx) => {
        const row = document.createElement("div");
        row.className = "player-row";
        const left = document.createElement("div");
        left.className = "player-left";
        const sw = document.createElement("div");
        sw.className = "color-swatch";
        sw.style.background = p.color;
        const label = document.createElement("div");
        label.textContent = `${p.name}`;
        left.appendChild(sw);
        left.appendChild(label);

        const controlsSelect = document.createElement("select");
        controlsSelect.className = "controls-select";
        const options = [
          p.controls,
          "ArrowLeft / ArrowRight",
          "Mouse Left / Mouse Right",
          "A / D",
          "Num4 / Num6",
          "J / L",
        ];
        const uniq = Array.from(new Set(options));
        uniq.forEach((opt) => {
          const o = document.createElement("option");
          o.value = opt;
          o.textContent = opt;
          if (opt === p.controls) o.selected = true;
          controlsSelect.appendChild(o);
        });
        controlsSelect.addEventListener("change", () => {
          p.controls = controlsSelect.value;
        });

        row.appendChild(left);
        row.appendChild(controlsSelect);

        if (idx >= 2) {
          const removeBtn = document.createElement("button");
          removeBtn.className = "remove-btn";
          removeBtn.textContent = "Remove";
          removeBtn.addEventListener("click", () => {
            players.splice(idx, 1);
            renderPlayers();
          });
          row.appendChild(removeBtn);
        }

        list.appendChild(row);
      });
    }

    renderPlayers();

    const actions = document.createElement("div");
    actions.className = "menu-actions";

    const addBtn = document.createElement("button");
    addBtn.className = "add-btn";
    addBtn.textContent = "+ Add Player";
    addBtn.addEventListener("click", () => {
      if (players.length >= presets.length) return;
      players.push(Object.assign({}, presets[players.length]));
      renderPlayers();
    });

    const resetBtn = document.createElement("button");
    resetBtn.className = "ghost";
    resetBtn.textContent = "Reset";
    resetBtn.addEventListener("click", () => {
      players.length = 2;
      players[0] = Object.assign({}, presets[0]);
      players[1] = Object.assign({}, presets[1]);
      renderPlayers();
    });

    const startBtn = document.createElement("button");
    startBtn.className = "primary";
    startBtn.textContent = "Start";
    startBtn.addEventListener("click", () => {
      const rosterPayload = players.map((p) => ({
        name: p.name,
        color: p.color,
        controls: p.controls,
      }));
      try {
        saveFirstStartDone();
        savePlayerConfig(rosterPayload);
      } catch (e) {
        console.warn("Could not save player settings:", e);
      }
      try {
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("local-player-config-start", {
              detail: { players: rosterPayload },
            }),
          );
        }
      } catch (e) {
        console.warn("Could not notify runtime about player config:", e);
      }
      try {
        window.playerConfigMenuOpen = false;
        // if (window.gameState) window.gameState.paused = false; // Handled by countdown
      } catch (e) { }
      try {
        const el = document.getElementById("firstStartMenuOverlay");
        if (el && el.parentNode) el.parentNode.removeChild(el);
      } catch (e) { }
      try {
        // if (typeof window !== "undefined" && window.forceReset) {
        //   window.forceReset();
        // }
      } catch (e) {
        console.warn("Failed to start game after config update:", e);
      }
    });

    const closeBtn = document.createElement("button");
    closeBtn.className = "ghost";
    closeBtn.textContent = "Close";
    closeBtn.addEventListener("click", () => {
      try {
        window.playerConfigMenuOpen = false;
        if (window.gameState) window.gameState.paused = false;
      } catch (e) { }
      try {
        const el = document.getElementById("firstStartMenuOverlay");
        if (el && el.parentNode) el.parentNode.removeChild(el);
      } catch (e) { }
    });

    actions.appendChild(addBtn);
    actions.appendChild(resetBtn);
    actions.appendChild(closeBtn);
    actions.appendChild(startBtn);

    menu.appendChild(title);
    menu.appendChild(description);
    menu.appendChild(list);
    menu.appendChild(actions);
    try {
      window.playerConfigMenuOpen = true;
      if (window.gameState) window.gameState.paused = true;
    } catch (e) { }
    overlay.appendChild(menu);
    document.body.appendChild(overlay);
  } catch (err) {
    console.error("openPlayerConfigMenu failed:", err);
  }
}
