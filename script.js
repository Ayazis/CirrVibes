import { initGame } from './src/initGame.js';
import { loadFirstStartDone } from './src/persistence.js';
import { openPlayerConfigMenu, showWinnerOverlay, showDrawOverlay } from './src/ui/overlays.js';
import { updateControlsInfoUI } from './src/ui/controlsInfo.js';
import { attachInputHandlers } from './src/input.js';
import { createInitialGameState } from './src/gameState.js';
import { startFixedStepLoop, resetGame, forceReset } from './src/gameLoop.js';
import { initFirebase } from './src/firebaseClient.js';
import { RoomClient, createRoomId } from './src/roomClient.js';

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

updateControlsInfoUI(window.gameState.players);
window.updateControlsInfoUI = updateControlsInfoUI;
renderRoster(window.gameState.players);
renderRoster(window.gameState.players);

// Attach input handlers for current state (local play)
let detachInput = attachInputHandlers(window.gameState);

// Expose reset helpers
window.resetGame = () => resetGame(window.gameState);
window.forceReset = () => forceReset(window.gameState);

// Multiplayer POC globals/state
let mpMode = null; // 'host' | 'guest' | 'local' | null
let roomClient = null;
let inputSeq = 0;
let loopStarted = false;
let loopController = null;
let pendingPrefs = null;
let capturePrefs = null;

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

function renderRoster(players) {
  const el = document.getElementById('roster');
  if (!el) return;
  const isLocal = mpMode === 'local' || mpMode === null;
  const cards = (players || [])
    .filter((p, idx) => {
      if (!p) return false;
      if (idx === 0) return true;
      return isLocal ? true : Boolean(p.clientId);
    })
    .map((p) => {
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
  updateControlsInfoUI(window.gameState.players);
  renderRoster(window.gameState.players);
  if (detachInput) try { detachInput(); } catch (e) {}
  detachInput = attachInputHandlers(window.gameState);
}

function assignRemotePlayers(remotePlayers) {
  if (!window.gameState) return;
  // reset non-local slots for fresh assignment in multiplayer
  if (mpMode === 'host' || mpMode === 'guest') {
    for (let i = 1; i < window.gameState.players.length; i++) {
      const p = window.gameState.players[i];
      if (!p) continue;
      p.clientId = null;
    }
  }
  const list = Object.values(remotePlayers || {}).sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
  let slot = 1;
  list.forEach((rp) => {
    if (rp.id === roomClient?.playerId) return;
    if (slot >= window.gameState.players.length) return;
    const target = window.gameState.players[slot];
    target.clientId = rp.id || rp.playerId;
    target.name = rp.name || target.name;
    target.controls = rp.controls || target.controls;
    target.color = rp.color ? rgbaFromHex(rp.color) : target.color;
    slot += 1;
  });
  updateControlsInfoUI(window.gameState.players);
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
      if (selectLocal) selectLocal.style.display = 'none';
      if (selectMp) selectMp.style.display = 'none';
      const question = overlay?.querySelector('h3');
      const subtitle = overlay?.querySelector('p');
      if (question) question.style.display = 'none';
      if (subtitle) subtitle.style.display = 'none';
      if (mpConfig) mpConfig.style.display = 'none';
      if (overlay) overlay.style.display = 'none';
      updateMpStatus('Local mode');
      updateRoomInfo(null);
    });
  }

  if (selectMp) {
    selectMp.addEventListener('click', () => {
      if (selectLocal) selectLocal.style.display = 'none';
      if (selectMp) selectMp.style.display = 'none';
      const question = overlay?.querySelector('h3');
      const subtitle = overlay?.querySelector('p');
      if (question) question.style.display = 'none';
      if (subtitle) subtitle.style.display = 'none';
      if (mpConfig) mpConfig.style.display = 'block';
      updateMpStatus('Multiplayer selected - set prefs');
    });
  }

  if (readyBtn) {
    readyBtn.addEventListener('click', () => {
      pendingPrefs = capturePrefs();
      applyLocalPrefs();
      if (overlay) overlay.style.display = 'none';
      updateMpStatus('Ready - create or join a room');
    });
  }
}

async function startHost(roomId) {
  mpMode = 'host';
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

  roomClient.listenPlayers((players) => {
    assignRemotePlayers(players);
  });

  roomClient.listenState((state) => {
    const players = window.gameState?.players || [];
    (state.players || []).forEach((p, idx) => {
      if (!players[idx]) return;
      players[idx].snakePosition.x = p.x;
      players[idx].snakePosition.y = p.y;
      players[idx].snakeDirection = p.direction;
      players[idx].isAlive = p.isAlive;
      players[idx].score = p.score;
    });
    try { updateControlsInfoUI(window.gameState.players); } catch (e) {}
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
