import { initGame } from './src/initGame.js';
import { loadFirstStartDone } from './src/persistence.js';
import { openPlayerConfigMenu, showWinnerOverlay, showDrawOverlay } from './src/ui/overlays.js';
import { updateControlsInfoUI as renderControlsInfo } from './src/ui/controlsInfo.js';
import { attachInputHandlers } from './src/input.js';
import { createInitialGameState } from './src/gameState.js';
import { startFixedStepLoop, resetGame, forceReset } from './src/gameLoop.js';
import { initFirebase } from './src/firebaseClient.js';
import { RoomClient, createRoomId } from './src/roomClient.js';
import { generateRandomStartingPosition } from './src/viewUtils.js';
import { Trail } from './src/trail.js';

// Multiplayer POC globals/state
let mpMode = null; // 'host' | 'guest' | 'local' | null
let roomClient = null;
let inputSeq = 0;
let loopStarted = false;
let loopController = null;
let pendingPrefs = null;
let capturePrefs = null;
let detachInput = null;

// Open the player config on initial page load only when the user hasn't completed first-start.
// This avoids reopening the overlay after Save & Reload.
document.addEventListener('DOMContentLoaded', () => {
  try {
    const done = loadFirstStartDone();
    if (done !== 'true') openPlayerConfigMenu();
  } catch (e) {}
});

// Wire up the player selection button in the main UI
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('openPlayerMenuBtn');
  if (btn) btn.addEventListener('click', openPlayerConfigMenu);
  const startBtn = document.getElementById('startGameBtn');
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      if (window.gameState) window.gameState.paused = false;
      updateMpStatus('Running');
    });
  }
});

initGame();

window.gameState = createInitialGameState();

updateControls(window.gameState.players);
window.updateControlsInfoUI = updateControls;
renderRoster(window.gameState.players);
deactivateInactiveSlots();

// Attach input handlers for current state (local play)
detachInput = attachInputHandlers(window.gameState);

// Expose reset helpers
window.resetGame = () => {
  const res = resetGame(window.gameState);
  deactivateInactiveSlots();
  updateControls(window.gameState.players);
  renderRoster(window.gameState.players);
  return res;
};
window.forceReset = () => {
  const res = forceReset(window.gameState);
  deactivateInactiveSlots();
  updateControls(window.gameState.players);
  renderRoster(window.gameState.players);
  return res;
};

function startLoopWithCallbacks(callbacks) {
  if (loopStarted) return;
  loopStarted = true;
  loopController = startFixedStepLoop(window.gameState, callbacks);
}

function updateMpStatus(text) {
  const el = document.getElementById('mpStatus');
  if (el) el.textContent = text;
}

function updateRoomInfo(roomId, role) {
  const el = document.getElementById('mpRoomInfo');
  const display = document.getElementById('roomDisplay');
  const text = roomId ? `Room: ${roomId}${role ? ` (${role})` : ''}` : 'Room: --';
  if (el) el.textContent = text;
  if (display) display.textContent = text;
}

function updateLatency(ms) {
  const el = document.getElementById('mpLatency');
  if (!el) return;
  if (ms == null) {
    el.textContent = 'Latency: --';
    return;
  }
  el.textContent = `Latency: ${Math.max(0, Math.round(ms))} ms`;
}

function updateMpError(text) {
  const el = document.getElementById('mpStatus');
  if (el) el.textContent = text;
  console.error('[multiplayer]', text);
}

function getPlayerInfo() {
  const players = window.gameState?.players || [];
  const p1 = players[0] || {};
  return { name: p1.name || 'Player', color: '#ff6666', controls: p1.controls || '' };
}

function rgbaFromHex(hex) {
  let h = (hex || '').replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const r = parseInt(h.slice(0, 2) || 'ff', 16) / 255;
  const g = parseInt(h.slice(2, 4) || 'ff', 16) / 255;
  const b = parseInt(h.slice(4, 6) || 'ff', 16) / 255;
  return [r, g, b, 1];
}

function cssFromColor(arrOrHex) {
  if (typeof arrOrHex === 'string') return arrOrHex;
  if (Array.isArray(arrOrHex)) {
    const [r, g, b] = arrOrHex;
    return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
  }
  return '#cccccc';
}

function visiblePlayers(players) {
  const list = [];
  const local = players?.[0];
  if (local) list.push(local);
  const hasRoom = Boolean(roomClient);
  if (!hasRoom && mpMode === 'local') {
    (players || []).slice(1).forEach((p) => { if (p) list.push(p); });
  } else if (hasRoom || mpMode === 'host' || mpMode === 'guest') {
    (players || []).slice(1).forEach((p) => { if (p && p.clientId) list.push(p); });
  }
  return list;
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
    color: rgbaFromHex(cfg?.color || '#66ccff'),
    controls: cfg?.controls || 'ArrowLeft / ArrowRight',
    score: cfg?.score || 0,
    _deathProcessed: false
  };
}

function ensurePlayerSlot(idx, cfg) {
  if (!window.gameState) return null;
  if (!window.gameState.players) window.gameState.players = [];
  while (window.gameState.players.length <= idx) {
    window.gameState.players.push(null);
  }
  if (!window.gameState.players[idx]) {
    window.gameState.players[idx] = createPlayerFromConfig(cfg, idx);
  } else if (cfg) {
    const p = window.gameState.players[idx];
    p.name = cfg.name || p.name;
    p.controls = cfg.controls || p.controls;
    p.color = cfg.color ? rgbaFromHex(cfg.color) : p.color;
    p.clientId = cfg.clientId || p.clientId;
    p.active = true;
  }
  return window.gameState.players[idx];
}

function rebuildOccupancy() {
  if (window.gameState?.occupancyGrid) {
    window.gameState.occupancyGrid.rebuildFromTrails(window.gameState.players.filter(Boolean), window.gameState.frameCounter || 0);
  }
}

function pruneToLocalOnly() {
  if (!window.gameState) return;
  if (!window.gameState.players || !window.gameState.players[0]) return;
  window.gameState.players = [window.gameState.players[0]];
  window.gameState.player1 = window.gameState.players[0];
  window.gameState.player2 = window.gameState.players[1];
  window.gameState.players[0].active = true;
  rebuildOccupancy();
  deactivateInactiveSlots();
  updateControls(window.gameState.players);
  renderRoster(window.gameState.players);
}

function deactivateInactiveSlots() {
  const players = window.gameState?.players || [];
  const isNet = mpMode === 'host' || mpMode === 'guest';
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

function updateControls(players) {
  renderControlsInfo(visiblePlayers(players));
}

function renderRoster(players) {
  const el = document.getElementById('roster');
  if (!el) return;
  const list = visiblePlayers(players);
  const cards = list.map((p) => {
    const color = cssFromColor(p.color);
    const name = p.name || `Player ${p.id}`;
    const controls = p.controls || '';
    return `<div class="card"><h4><span class="swatch" style="background:${color};"></span>${name}</h4><div>${controls}</div></div>`;
  }).join('');
  el.innerHTML = cards;
}

function applyLocalPrefs() {
  if (!pendingPrefs || !window.gameState?.players?.[0]) return;
  const p = window.gameState.players[0];
  p.name = pendingPrefs.name || p.name;
  p.controls = pendingPrefs.controls || p.controls;
  p.color = rgbaFromHex(pendingPrefs.color || '#66ccff');
  updateControls(window.gameState.players);
  renderRoster(window.gameState.players);
  if (detachInput) try { detachInput(); } catch (e) {}
  detachInput = attachInputHandlers(window.gameState);
}

function assignRemotePlayers(remotePlayers) {
  if (!window.gameState) return;
  // rebuild non-local slots for fresh assignment in multiplayer
  if (mpMode === 'host' || mpMode === 'guest') {
    window.gameState.players = window.gameState.players.slice(0, 1); // keep local only
  }
  const list = Object.values(remotePlayers || {}).sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
  let slot = 1;
  list.forEach((rp) => {
    if (rp.id === roomClient?.playerId) return;
    if (slot >= 4) return;
    const cfg = { name: rp.name, color: rp.color, controls: rp.controls, clientId: rp.id || rp.playerId };
    ensurePlayerSlot(slot, cfg);
    slot += 1;
  });
  rebuildOccupancy();
  updateControls(window.gameState.players);
  renderRoster(window.gameState.players);
  updateMpStatus(`Players: ${Math.min(slot, window.gameState.players.length)} / ${window.gameState.players.length}`);
}

function initModeOverlay() {
  const overlay = document.getElementById('modeOverlay');
  const mpConfig = document.getElementById('mpConfig');
  const selectLocal = document.getElementById('selectLocal');
  const selectMp = document.getElementById('selectMp');
  const readyBtn = document.getElementById('mpReadyBtn');
  const nameInput = document.getElementById('prefName');
  const colorInput = document.getElementById('prefColor');
  const controlsInput = document.getElementById('prefControls');

  capturePrefs = () => ({
    name: (nameInput && nameInput.value) || 'Player',
    color: (colorInput && colorInput.value) || '#66ccff',
    controls: (controlsInput && controlsInput.value) || 'ArrowLeft / ArrowRight'
  });

  if (selectLocal) {
    selectLocal.addEventListener('click', () => {
      mpMode = 'local';
      pendingPrefs = capturePrefs();
      applyLocalPrefs();
      if (mpConfig) mpConfig.style.display = 'none';
      if (overlay) overlay.style.display = 'none';
      updateMpStatus('Local mode');
      updateRoomInfo(null);
    });
  }

  if (selectMp) {
    selectMp.addEventListener('click', () => {
      pruneToLocalOnly();
      if (mpConfig) mpConfig.style.display = 'block';
      if (selectLocal) selectLocal.style.display = 'none';
      if (selectMp) selectMp.style.display = 'none';
      const question = overlay?.querySelector('h3');
      const subtitle = overlay?.querySelector('p');
      if (question) question.style.display = 'none';
      if (subtitle) subtitle.style.display = 'none';
      updateMpStatus('Multiplayer selected - set prefs');
    });
  }

  if (readyBtn) {
    readyBtn.addEventListener('click', () => {
      pendingPrefs = capturePrefs();
      applyLocalPrefs();
      deactivateInactiveSlots();
      updateControls(window.gameState.players);
      renderRoster(window.gameState.players);
      if (overlay) overlay.style.display = 'none';
      updateMpStatus('Ready - create or join a room');
    });
  }
}

async function startHost(roomId) {
  mpMode = 'host';
  pruneToLocalOnly();
  applyLocalPrefs();
  const info = pendingPrefs || getPlayerInfo();
  roomClient = new RoomClient({ roomId, playerInfo: info, isHost: true });
  try {
    updateMpStatus('Connecting as host...');
    await roomClient.joinRoom();
    updateMpStatus(`Hosting ${roomId}`);
    updateRoomInfo(roomId, 'host');
  } catch (e) {
    updateMpError(`Host join failed: ${e?.message || e}`);
    return;
  }
  if (window.gameState?.players?.[0]) {
    window.gameState.players[0].clientId = roomClient.playerId;
  }
  deactivateInactiveSlots();
  updateControls(window.gameState.players);
  renderRoster(window.gameState.players);

  roomClient.listenPlayers((players) => {
    assignRemotePlayers(players);
  });

  roomClient.listenInputs((inputs) => {
    const players = window.gameState?.players || [];
    Object.entries(inputs).forEach(([pid, intent]) => {
      const player = players.find((p) => p.clientId === pid);
      if (!player) return;
      player.isTurningLeft = !!intent.turningLeft;
      player.isTurningRight = !!intent.turningRight;
    });
  });

  const callbacks = {
    onWinner: (player) => showWinnerOverlay(player, () => forceReset(window.gameState)),
    onDraw: () => showDrawOverlay(() => forceReset(window.gameState)),
    publishState: (state) => {
      const payload = {
        frame: state.frameCounter,
        players: state.players.map((p) => ({
          id: p.id,
          name: p.name,
          color: p.color,
          x: p.snakePosition.x,
          y: p.snakePosition.y,
          direction: p.snakeDirection,
          isAlive: p.isAlive,
          score: p.score
        }))
      };
      roomClient.publishState(payload);
    },
    publishHz: 8
  };

  startLoopWithCallbacks(callbacks);
  if (loopController) loopController.setCallbacks(callbacks);
}

async function startGuest(roomId) {
  mpMode = 'guest';
  pruneToLocalOnly();
  applyLocalPrefs();
  const info = pendingPrefs || getPlayerInfo();
  roomClient = new RoomClient({ roomId, playerInfo: info, isHost: false });
  try {
    updateMpStatus('Joining room...');
    await roomClient.joinRoom();
    updateMpStatus(`Joined ${roomId}`);
    updateRoomInfo(roomId, 'guest');
  } catch (e) {
    updateMpError(`Join failed: ${e?.message || e}`);
    return;
  }
  if (window.gameState?.players?.[0]) {
    window.gameState.players[0].clientId = roomClient.playerId;
  }
  if (window.gameState) window.gameState.paused = true;
  deactivateInactiveSlots();
  updateControls(window.gameState.players);
  renderRoster(window.gameState.players);

  roomClient.listenPlayers((players) => {
    assignRemotePlayers(players);
  });

  roomClient.listenState((state) => {
    const players = window.gameState?.players || [];
    // Ensure slots exist for incoming state
    const incoming = state.players || [];
    incoming.forEach((p, idx) => {
      ensurePlayerSlot(idx, { name: p.name, color: p.color, controls: p.controls });
    });
    (state.players || []).forEach((p, idx) => {
      if (!players[idx]) return;
      players[idx].snakePosition.x = p.x;
      players[idx].snakePosition.y = p.y;
      players[idx].snakeDirection = p.direction;
      players[idx].isAlive = p.isAlive;
      players[idx].score = p.score;
    });
    try { updateControls(window.gameState.players); } catch (e) {}
    if (state.lastUpdate) {
      const lag = Date.now() - state.lastUpdate;
      updateLatency(lag);
    }
  });

  // Mirror local input state into Firebase intent
  if (detachInput) try { detachInput(); } catch (e) {}
  detachInput = attachInputHandlers({
    players: window.gameState.players,
    onInputChange: (playerIdx, flags) => {
      inputSeq += 1;
      roomClient.sendInput({
        seq: inputSeq,
        ts: Date.now(),
        turningLeft: flags.isTurningLeft,
        turningRight: flags.isTurningRight
      });
    }
  });
}

function wireMultiplayerUI() {
  const createBtn = document.getElementById('createRoomBtn');
  const joinBtn = document.getElementById('joinRoomBtn');
  const input = document.getElementById('roomIdInput');
  if (!createBtn || !joinBtn || !input) return;
  const ensurePrefs = () => {
    if (!pendingPrefs && capturePrefs) pendingPrefs = capturePrefs();
    applyLocalPrefs();
  };

  createBtn.addEventListener('click', async () => {
    const newId = createRoomId();
    input.value = newId;
    ensurePrefs();
    await startHost(newId);
  });

  joinBtn.addEventListener('click', async () => {
    const roomId = input.value.trim();
    if (!roomId) return;
    ensurePrefs();
    await startGuest(roomId);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  wireMultiplayerUI();
  initModeOverlay();
});

// Start the fixed-timestep game loop (local only by default)
startLoopWithCallbacks({
  onWinner: (player) => showWinnerOverlay(player, () => forceReset(window.gameState)),
  onDraw: () => showDrawOverlay(() => forceReset(window.gameState))
});

// Expose lightweight Firebase hooks for POC usage in console/experiments.
window.initFirebase = initFirebase;
window.createRoomClient = (opts = {}) => new RoomClient(opts);
window.createRoomId = createRoomId;
