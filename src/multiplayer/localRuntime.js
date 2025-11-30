import { updateControlsInfoUI as renderControlsInfo } from "../ui/controlsInfo.js";
import { attachInputHandlers } from "../input.js";
import { generateRandomStartingPosition } from "../viewUtils.js";
import { Trail } from "../trail.js";
import { cssFromColor, rgbaFromHex } from "./colorUtils.js";

export function createLocalRuntime({ gameState }) {
  let detachInput = null;
  let context = {
    mpMode: "local",
    hasRoom: false,
    roomPlayerId: null,
  };

  function setContext(partial) {
    context = { ...context, ...partial };
  }

  function visiblePlayers() {
    const players = gameState?.players || [];
    const list = [];
    const local = players[0];
    if (local) list.push(local);
    if (!players.length) return list;
    if (!context.hasRoom && context.mpMode === "local") {
      players.slice(1).forEach((p) => {
        if (p) list.push(p);
      });
    } else if (
      context.hasRoom ||
      context.mpMode === "host" ||
      context.mpMode === "guest"
    ) {
      players.slice(1).forEach((p) => {
        if (p && p.clientId) list.push(p);
      });
    }
    return list;
  }

  function updateControls() {
    renderControlsInfo(visiblePlayers());
  }

  function renderRoster() {
    const el = document.getElementById("roster");
    if (!el) return;
    const cards = visiblePlayers()
      .map((p) => {
        const color = cssFromColor(p.color);
        const name = p.name || `Player ${p.id}`;
        const controls = p.controls || "";
        return `<div class="card"><h4><span class="swatch" style="background:${color};"></span>${name}</h4><div>${controls}</div></div>`;
      })
      .join("");
    el.innerHTML = cards;
  }

  function createPlayerFromConfig(cfg, idx) {
    const start = generateRandomStartingPosition();
    return {
      id: idx + 1,
      clientId: cfg?.clientId || null,
      active: true,
      name: cfg?.name || `Player ${idx + 1}`,
      snakePosition: { x: start.x, y: start.y },
      snakeDirection: start.direction,
      snakeSpeed: 1.2,
      turnSpeed: 180,
      isAlive: true,
      trail: new Trail(1024, start.x, start.y),
      isTurningLeft: false,
      isTurningRight: false,
      color: rgbaFromHex(cfg?.color || "#66ccff"),
      controls: cfg?.controls || "ArrowLeft / ArrowRight",
      score: cfg?.score || 0,
      _deathProcessed: false,
      _lastRemoteInputSeq: null,
      _lastTrailSyncSeq: null,
      _lastTrailBroadcast: null,
    };
  }

  function ensurePlayerSlot(idx, cfg) {
    if (!gameState) return null;
    if (!gameState.players) gameState.players = [];
    while (gameState.players.length <= idx) {
      gameState.players.push(null);
    }
    if (!gameState.players[idx]) {
      gameState.players[idx] = createPlayerFromConfig(cfg, idx);
    } else if (cfg) {
      const p = gameState.players[idx];
      p.name = cfg.name || p.name;
      p.controls = cfg.controls || p.controls;
      if (cfg.color) {
        p.color = Array.isArray(cfg.color) ? cfg.color : rgbaFromHex(cfg.color);
      }
      p.clientId = cfg.clientId || p.clientId;
      p.active = true;
    }
    return gameState.players[idx];
  }

  function rebuildOccupancy() {
    if (gameState?.occupancyGrid) {
      gameState.occupancyGrid.rebuildFromTrails(
        gameState.players.filter(Boolean),
        gameState.frameCounter || 0,
      );
    }
  }

  function pruneToLocalOnly() {
    if (!gameState) return;
    if (!gameState.players || !gameState.players[0]) return;
    gameState.players = [gameState.players[0]];
    gameState.player1 = gameState.players[0];
    gameState.player2 = gameState.players[1];
    gameState.players[0].active = true;
    rebuildOccupancy();
    refreshPlayerUi();
  }

  function deactivateInactiveSlots() {
    const players = gameState?.players || [];
    const isNet = context.mpMode === "host" || context.mpMode === "guest";
    players.forEach((p, idx) => {
      if (!p) return;
      if (idx === 0) {
        p.active = true;
        if (!p.isAlive) {
          p.isAlive = true;
          p._deathProcessed = false;
        }
        return;
      }
      if (isNet && !p.clientId) {
        p.active = false;
        p.isAlive = false;
        p._deathProcessed = true;
        p.isTurningLeft = false;
        p.isTurningRight = false;
      } else if (isNet && p.clientId) {
        p.active = true;
        p.isAlive = true;
        p._deathProcessed = false;
      } else if (!isNet) {
        p.active = true;
      }
    });
  }

  function refreshPlayerUi() {
    deactivateInactiveSlots();
    updateControls();
    renderRoster();
  }

  function applyLocalPrefs(prefs) {
    if (!prefs || !gameState?.players?.[0]) return;
    const p = gameState.players[0];
    p.name = prefs.name || p.name;
    p.controls = prefs.controls || p.controls;
    if (prefs.color) {
      p.color = Array.isArray(prefs.color)
        ? prefs.color
        : rgbaFromHex(prefs.color);
    }
    updateControls();
    renderRoster();
  }

  function assignRemotePlayers(remotePlayers) {
    if (!gameState) return 0;
    if (context.mpMode === "host" || context.mpMode === "guest") {
      gameState.players = gameState.players.slice(0, 1);
    }
    const list = Object.values(remotePlayers || {}).sort(
      (a, b) => (a.joinedAt || 0) - (b.joinedAt || 0),
    );
    let slot = 1;
    list.forEach((rp) => {
      if (rp.id === context.roomPlayerId) return;
      if (slot >= 10) return;
      const cfg = {
        name: rp.name,
        color: rp.color,
        controls: rp.controls,
        clientId: rp.id || rp.playerId,
      };
      const player = ensurePlayerSlot(slot, cfg);
      if (player) {
        player._lastRemoteInputSeq = null;
        player._lastTrailSyncSeq = null;
        player._lastTrailBroadcast = null;
      }
      slot += 1;
    });
    rebuildOccupancy();
    updateControls();
    renderRoster();
    return slot;
  }

  function applyLocalRoster(rosterConfigs = []) {
    if (!gameState) return;
    if (!Array.isArray(rosterConfigs) || rosterConfigs.length === 0) return;
    const configs = rosterConfigs.slice(0, 10);
    const updatedPlayers = configs.map((cfg, idx) =>
      createPlayerFromConfig(cfg, idx),
    );
    gameState.players = updatedPlayers;
    gameState.player1 = updatedPlayers[0] || null;
    gameState.player2 = updatedPlayers[1] || null;
    gameState.frameCounter = 0;
    gameState.gameOverLogged = false;
    gameState.winnerShown = false;
    rebuildOccupancy();
    refreshPlayerUi();
    attachDefaultInputHandlers();
  }

  function playerByClientId(clientId) {
    if (!clientId) return null;
    return (gameState?.players || []).find((p) => p && p.clientId === clientId);
  }

  function applySpawnSnapshot(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.players)) return;
    if (!gameState) return;
    const ownId = context.roomPlayerId;
    snapshot.players.forEach((info, idx) => {
      let player = info.clientId ? playerByClientId(info.clientId) : null;
      if (!player && info.clientId === ownId && gameState.players?.[0]) {
        player = gameState.players[0];
        player.clientId = info.clientId;
      }
      if (!player) {
        const targetIdx = typeof info.index === "number" ? info.index : idx;
        player = ensurePlayerSlot(targetIdx, { name: info.name });
        if (!player) return;
        player.clientId = info.clientId || player.clientId;
      }
      if (info.name) player.name = info.name;
      if (info.controls) player.controls = info.controls;
      if (info.color)
        player.color = Array.isArray(info.color)
          ? info.color
          : rgbaFromHex(info.color);
      if (typeof info.x === "number") player.snakePosition.x = info.x;
      if (typeof info.y === "number") player.snakePosition.y = info.y;
      if (typeof info.direction === "number")
        player.snakeDirection = info.direction;
      player.trail = new Trail(
        1024,
        player.snakePosition.x,
        player.snakePosition.y,
      );
      player.isAlive = true;
      player.isTurningLeft = false;
      player.isTurningRight = false;
      player._deathProcessed = false;
      player._lastRemoteInputSeq = null;
      player._lastTrailSyncSeq = null;
      player._lastTrailBroadcast = null;
    });
    rebuildOccupancy();
    if (gameState) {
      gameState.frameCounter = 0;
      gameState.gameOverLogged = false;
      gameState.winnerShown = false;
      gameState.paused = false;
    }
    refreshPlayerUi();
    logPlayerPositions(snapshot.key || "applied");
  }

  function logPlayerPositions(contextLabel = "snapshot") {
    if (!gameState?.players) return;
    const data = gameState.players.filter(Boolean).map((p, idx) => ({
      slot: idx,
      name: p.name,
      clientId: p.clientId,
      x: Number(p.snakePosition?.x ?? 0).toFixed(2),
      y: Number(p.snakePosition?.y ?? 0).toFixed(2),
      direction: Number(p.snakeDirection ?? 0).toFixed(2),
    }));
    console.log(`[spawn:${contextLabel}]`, data);
  }

  function attachDefaultInputHandlers() {
    if (detachInput) {
      try {
        detachInput();
      } catch (e) { }
    }
    detachInput = attachInputHandlers(gameState);
  }

  function attachCustomInputHandlers(config) {
    if (detachInput) {
      try {
        detachInput();
      } catch (e) { }
    }
    detachInput = attachInputHandlers(config);
  }

  function releaseInputHandlers() {
    if (detachInput) {
      try {
        detachInput();
      } catch (e) { }
    }
    detachInput = null;
  }

  function handleReset(fn) {
    const res = fn(gameState);
    refreshPlayerUi();
    return res;
  }

  return {
    setContext,
    refreshPlayerUi,
    updateControls,
    renderRoster,
    applyLocalPrefs,
    applyLocalRoster,
    assignRemotePlayers,
    applySpawnSnapshot,
    logPlayerPositions,
    pruneToLocalOnly,
    ensurePlayerSlot,
    playerByClientId,
    attachDefaultInputHandlers,
    attachCustomInputHandlers,
    releaseInputHandlers,
    handleReset,
    getPlayers: () => gameState?.players || [],
  };
}
