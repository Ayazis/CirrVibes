import { initGame } from './src/initGame.js';
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
let lobbyPlayers = {};
let lobbyMeta = {};
let localReady = false;
let hasSelectedMultiplayer = false;
let prefInputs = [];

const MIN_MULTIPLAYER_PLAYERS = 2;

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

function setPrefInputsDisabled(disabled) {
  prefInputs.forEach((input) => {
    if (input) input.disabled = !!disabled;
  });
}

function capturePrefsFromInputs() {
  if (!capturePrefs) return pendingPrefs;
  pendingPrefs = capturePrefs();
  applyLocalPrefs();
  return pendingPrefs;
}

async function syncRoomProfileFromPrefs() {
  if (!roomClient || !pendingPrefs) return;
  try {
    await roomClient.updateSelf({
      name: pendingPrefs.name,
      color: pendingPrefs.color,
      controls: pendingPrefs.controls
    });
  } catch (e) {
    console.warn('syncRoomProfileFromPrefs failed', e);
  }
}

function setModeOverlayState(mode) {
  const overlay = document.getElementById('modeOverlay');
  const selectBlock = document.getElementById('modeSelectBlock');
  const mpConfig = document.getElementById('mpConfig');
  if (!overlay) return;
  if (mode === 'hidden') {
    overlay.style.display = 'none';
    return;
  }
  overlay.style.display = 'flex';
  if (selectBlock) selectBlock.style.display = mode === 'select' ? 'block' : 'none';
  if (mpConfig) mpConfig.style.display = mode === 'lobby' ? 'block' : 'none';
}

function renderLobbyPlayers(players) {
  const listEl = document.getElementById('mpPlayerList');
  if (!listEl) return;
  const entries = Object.values(players || {}).sort((a, b) => (a?.joinedAt || 0) - (b?.joinedAt || 0));
  if (!entries.length) {
    listEl.innerHTML = '<div class="muted-text">No players connected</div>';
    return;
  }
  const rows = entries.map((p) => {
    const color = cssFromColor(rgbaFromHex(p?.color || '#888888'));
    const name = escapeHtml(p?.name || p?.id || 'Player');
    const ready = !!p?.ready;
    const badgeClass = ready ? 'yes' : 'no';
    const label = ready ? 'Ready' : 'Not ready';
    return `<div class="mp-player"><div class="player-info"><span class="swatch" style="background:${color};"></span><span>${name}</span></div><span class="ready badge ${badgeClass}">${label}</span></div>`;
  }).join('');
  listEl.innerHTML = rows;
}

function lobbyCounts() {
  const players = Object.values(lobbyPlayers || {});
  const total = players.length;
  const ready = players.filter((p) => p && p.ready).length;
  return { total, ready };
}

function updateLobbyRoleUi() {
  const readyBtn = document.getElementById('mpReadyBtn');
  const startBtn = document.getElementById('mpStartBtn');
  if (!readyBtn || !startBtn) return;
  if (mpMode === 'host') {
    readyBtn.style.display = 'inline-flex';
    startBtn.style.display = 'inline-flex';
  } else if (mpMode === 'guest') {
    readyBtn.style.display = 'inline-flex';
    startBtn.style.display = 'none';
  } else {
    readyBtn.style.display = 'inline-flex';
    startBtn.style.display = 'none';
    readyBtn.disabled = true;
  }
}

function updateLobbyUi() {
  const readyBtn = document.getElementById('mpReadyBtn');
  const startBtn = document.getElementById('mpStartBtn');
  const status = lobbyMeta?.status || 'waiting';
  const { total, ready } = lobbyCounts();
  const statusText = total ? `Players ready: ${ready}/${total}` : 'Waiting for players...';
  if (roomClient && (mpMode === 'host' || mpMode === 'guest')) {
    updateMpStatus(statusText);
  }
  if (readyBtn) {
    readyBtn.textContent = localReady ? 'Unready' : 'Ready Up';
    readyBtn.disabled = !roomClient || ((mpMode !== 'guest' && mpMode !== 'host')) || status === 'running';
  }
  if (startBtn) {
    const canStart = mpMode === 'host' && status !== 'running' && total >= MIN_MULTIPLAYER_PLAYERS && ready === total;
    startBtn.disabled = !canStart;
  }
}

function areAllPlayersReady() {
  const { total, ready } = lobbyCounts();
  if (total < MIN_MULTIPLAYER_PLAYERS) return false;
  return total > 0 && ready === total;
}

async function setLocalReadyState(nextReady) {
  if (!roomClient) return;
  const prev = localReady;
  localReady = nextReady;
  const shouldLock = nextReady && (mpMode === 'host' || mpMode === 'guest');
  if (shouldLock) {
    setPrefInputsDisabled(true);
  } else if (!nextReady) {
    setPrefInputsDisabled(false);
  }
  updateLobbyUi();
  try {
    await roomClient.setReady(nextReady);
  } catch (e) {
    localReady = prev;
    if (prev && (mpMode === 'host' || mpMode === 'guest')) {
      setPrefInputsDisabled(true);
    } else if (!prev) {
      setPrefInputsDisabled(false);
    }
    updateLobbyUi();
    updateMpError(`Ready update failed: ${e?.message || e}`);
  }
}

async function beginHostedMatch() {
  if (!roomClient || mpMode !== 'host') return;
  if (!areAllPlayersReady()) return;
  if (!window.gameState) return;
  updateMpStatus('Starting match...');
  forceReset(window.gameState);
  window.gameState.paused = false;
  const startTs = Date.now();
  lobbyMeta = { ...(lobbyMeta || {}), status: 'running', startedAt: startTs };
  updateLobbyUi();
  setModeOverlayState('hidden');
  try {
    await roomClient.updateMeta({ status: 'running', startedAt: startTs });
  } catch (e) {
    updateMpError(`Failed to start match: ${e?.message || e}`);
  }
}

function handlePlayersUpdate(players) {
  lobbyPlayers = players || {};
  renderLobbyPlayers(lobbyPlayers);
  if (mpMode === 'host' || mpMode === 'guest') assignRemotePlayers(lobbyPlayers);
  updateLobbyUi();
}

function handleMetaChange(meta = {}) {
  lobbyMeta = meta || {};
  const status = lobbyMeta.status || 'waiting';
  if (!hasSelectedMultiplayer) return;
  if (status === 'running') {
    setModeOverlayState('hidden');
  } else if (mpMode === 'host' || mpMode === 'guest') {
    setModeOverlayState('lobby');
  }
  updateLobbyUi();
}

async function cleanupRoomClient() {
  if (!roomClient) return;
  try { await roomClient.leaveRoom(); } catch (e) {}
  roomClient = null;
}

function resetLobbyState() {
  lobbyPlayers = {};
  lobbyMeta = {};
  localReady = false;
  mpMode = mpMode === 'local' ? 'local' : null;
  setPrefInputsDisabled(false);
  renderLobbyPlayers(lobbyPlayers);
  updateLobbyUi();
  updateLatency(null);
  updateRoomInfo(null);
  updateMpStatus('Offline');
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

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text == null ? '' : String(text);
  return div.innerHTML;
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
  if (mpMode !== 'host' && mpMode !== 'guest') {
    updateMpStatus(`Players: ${Math.min(slot, window.gameState.players.length)} / ${window.gameState.players.length}`);
  }
}

function initModeOverlay() {
  const selectLocal = document.getElementById('selectLocal');
  const selectMp = document.getElementById('selectMp');
  const nameInput = document.getElementById('prefName');
  const colorInput = document.getElementById('prefColor');
  const controlsInput = document.getElementById('prefControls');

  capturePrefs = () => ({
    name: (nameInput && nameInput.value) || 'Player',
    color: (colorInput && colorInput.value) || '#66ccff',
    controls: (controlsInput && controlsInput.value) || 'ArrowLeft / ArrowRight'
  });

  prefInputs = [nameInput, colorInput, controlsInput].filter(Boolean);
  setPrefInputsDisabled(false);
  const handlePrefInput = () => {
    if (localReady && (mpMode === 'host' || mpMode === 'guest')) return;
    capturePrefsFromInputs();
    syncRoomProfileFromPrefs();
  };
  if (nameInput) nameInput.addEventListener('input', handlePrefInput);
  if (colorInput) colorInput.addEventListener('change', handlePrefInput);
  if (controlsInput) controlsInput.addEventListener('change', handlePrefInput);

  setModeOverlayState('select');
  renderLobbyPlayers(lobbyPlayers);
  updateLobbyRoleUi();
  updateLobbyUi();

  if (selectLocal) {
    selectLocal.addEventListener('click', async () => {
      await cleanupRoomClient();
      resetLobbyState();
      mpMode = 'local';
      hasSelectedMultiplayer = false;
      capturePrefsFromInputs();
      setModeOverlayState('hidden');
      openPlayerConfigMenu();
      updateMpStatus('Local mode');
      updateRoomInfo(null);
      localReady = false;
      setPrefInputsDisabled(false);
      updateLobbyRoleUi();
    });
  }

  if (selectMp) {
    selectMp.addEventListener('click', () => {
      hasSelectedMultiplayer = true;
      pruneToLocalOnly();
      localReady = false;
      setPrefInputsDisabled(false);
      capturePrefsFromInputs();
      setModeOverlayState('lobby');
      updateLobbyRoleUi();
      updateMpStatus('Multiplayer selected - create or join a room');
    });
  }
}

async function startHost(roomId) {
  mpMode = 'host';
  hasSelectedMultiplayer = true;
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
  if (window.gameState) window.gameState.paused = true;
  localReady = false;
  setPrefInputsDisabled(false);
  try { await roomClient.setReady(false); } catch (e) {}
  deactivateInactiveSlots();
  updateControls(window.gameState.players);
  renderRoster(window.gameState.players);
  updateLobbyRoleUi();
  updateLobbyUi();
  setModeOverlayState('lobby');

  roomClient.listenPlayers((players) => {
    handlePlayersUpdate(players);
  });

  roomClient.listenMeta((meta) => {
    handleMetaChange(meta || {});
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
    onWinner: (player) => {
      roomClient.updateMeta({ status: 'waiting', finishedAt: Date.now() });
      setModeOverlayState('lobby');
      showWinnerOverlay(player, () => forceReset(window.gameState));
    },
    onDraw: () => {
      roomClient.updateMeta({ status: 'waiting', finishedAt: Date.now() });
      setModeOverlayState('lobby');
      showDrawOverlay(() => forceReset(window.gameState));
    },
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
  hasSelectedMultiplayer = true;
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
  localReady = false;
  setPrefInputsDisabled(false);
  try { await roomClient.setReady(false); } catch (e) {}
  deactivateInactiveSlots();
  updateControls(window.gameState.players);
  renderRoster(window.gameState.players);
  updateLobbyRoleUi();
  updateLobbyUi();
  setModeOverlayState('lobby');

  roomClient.listenPlayers((players) => {
    handlePlayersUpdate(players);
  });

  roomClient.listenMeta((meta) => {
    handleMetaChange(meta || {});
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
  const readyBtn = document.getElementById('mpReadyBtn');
  const startBtn = document.getElementById('mpStartBtn');
  if (!createBtn || !joinBtn || !input) return;
  const ensurePrefs = () => {
    capturePrefsFromInputs();
  };

  createBtn.addEventListener('click', async () => {
    const newId = createRoomId();
    input.value = newId;
    ensurePrefs();
    await cleanupRoomClient();
    resetLobbyState();
    await startHost(newId);
    updateLobbyRoleUi();
  });

  joinBtn.addEventListener('click', async () => {
    const roomId = input.value.trim();
    if (!roomId) return;
    ensurePrefs();
    await cleanupRoomClient();
    resetLobbyState();
    await startGuest(roomId);
    updateLobbyRoleUi();
  });

  if (readyBtn) {
    readyBtn.addEventListener('click', async () => {
      if (!roomClient || (mpMode !== 'guest' && mpMode !== 'host')) return;
      if ((lobbyMeta?.status || 'waiting') === 'running') return;
      readyBtn.disabled = true;
      const next = !localReady;
      try {
        if (next) {
          capturePrefsFromInputs();
          await syncRoomProfileFromPrefs();
        } else {
          setPrefInputsDisabled(false);
        }
        await setLocalReadyState(next);
        updateLobbyUi();
      } catch (e) {
        updateMpError(`Ready toggle failed: ${e?.message || e}`);
      } finally {
        readyBtn.disabled = false;
      }
    });
  }

  if (startBtn) {
    startBtn.addEventListener('click', () => {
      beginHostedMatch();
    });
  }
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
