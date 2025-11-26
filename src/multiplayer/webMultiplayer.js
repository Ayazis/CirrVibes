import { openPlayerConfigMenu, showDrawOverlay, showWinnerOverlay } from '../ui/overlays.js';
import { startFixedStepLoop, resetGame as resetGameState, forceReset as forceResetState } from '../gameLoop.js';
import { Trail } from '../trail.js';
import { cssFromColor, normalizeColorPayload, rgbaFromHex } from './colorUtils.js';
import { createFirebaseSession } from './firebaseSession.js';

const MIN_MULTIPLAYER_PLAYERS = 2;

export function createWebMultiplayer({ gameState, localRuntime }) {
  const firebaseSession = createFirebaseSession();
  const state = {
    mpMode: null,
    inputSeq: 0,
    loopStarted: false,
    loopController: null,
    pendingPrefs: null,
    capturePrefs: null,
    lobbyPlayers: {},
    lobbyMeta: {},
    prefInputs: [],
    localReady: false,
    hasSelectedMultiplayer: false,
    lastAppliedSpawnKey: null,
    showLobbyOnWaiting: false,
    lastResultShownKey: null
  };

  function syncContext() {
    localRuntime.setContext({
      mpMode: state.mpMode || 'local',
      hasRoom: firebaseSession.isConnected(),
      roomPlayerId: firebaseSession.getPlayerId()
    });
  }

  function startLoopWithCallbacks(callbacks) {
    if (state.loopStarted) return;
    state.loopStarted = true;
    state.loopController = startFixedStepLoop(gameState, callbacks);
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

  function dismissResultOverlay() {
    const overlay = document.getElementById('winnerOverlay');
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  }

  function clearResultState() {
    dismissResultOverlay();
    state.lastResultShownKey = null;
  }

  function getPlayAgainOptions() {
    if (state.mpMode === 'guest') {
      return { disablePlayAgain: true, disabledMessage: 'Waiting for host to restart' };
    }
    return undefined;
  }

  function resolveResultPlayer(playerInfo = {}) {
    const list = gameState?.players || [];
    const byClient = playerInfo.clientId ? list.find((p) => p?.clientId === playerInfo.clientId) : null;
    const byId = !byClient && playerInfo.id ? list.find((p) => p?.id === playerInfo.id) : null;
    const match = byClient || byId;
    if (match) {
      return {
        id: match.id,
        name: match.name,
        color: match.color
      };
    }
    return {
      id: playerInfo.id,
      name: playerInfo.name,
      color: normalizeColorPayload(playerInfo.color)
    };
  }

  function createResultPayload(type, extra = {}) {
    return {
      key: `result-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      ...extra
    };
  }

  function showMatchResult(result) {
    if (!result || !gameState) return;
    if (result.key) state.lastResultShownKey = result.key;
    const options = getPlayAgainOptions();
    const callback = () => {
      if (state.mpMode === 'host') {
        beginHostedMatch();
      } else {
        forceResetState(gameState);
        localRuntime.refreshPlayerUi();
      }
    };
    if (result.type === 'win' && result.player) {
      const playerData = resolveResultPlayer(result.player);
      playerData.color = normalizeColorPayload(playerData.color);
      showWinnerOverlay(playerData, callback, options);
    } else if (result.type === 'draw') {
      showDrawOverlay(callback, options);
    }
  }

  function logPlayerPositions(contextLabel = 'snapshot') {
    localRuntime.logPlayerPositions(contextLabel);
  }

  function setPrefInputsDisabled(disabled) {
    state.prefInputs.forEach((input) => {
      if (input) input.disabled = !!disabled;
    });
  }

  function applyLocalPrefsFromInputs() {
    if (!state.capturePrefs) return state.pendingPrefs;
    state.pendingPrefs = state.capturePrefs();
    localRuntime.applyLocalPrefs(state.pendingPrefs);
    localRuntime.attachDefaultInputHandlers();
    return state.pendingPrefs;
  }

  async function syncRoomProfileFromPrefs() {
    if (!firebaseSession.isConnected() || !state.pendingPrefs) return;
    try {
      await firebaseSession.updateProfile({
        name: state.pendingPrefs.name,
        color: state.pendingPrefs.color,
        controls: state.pendingPrefs.controls
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
    const players = Object.values(state.lobbyPlayers || {});
    const total = players.length;
    const ready = players.filter((p) => p && p.ready).length;
    return { total, ready };
  }

  function updateLobbyRoleUi() {
    const readyBtn = document.getElementById('mpReadyBtn');
    const startBtn = document.getElementById('mpStartBtn');
    if (!readyBtn || !startBtn) return;
    if (state.mpMode === 'host') {
      readyBtn.style.display = 'inline-flex';
      startBtn.style.display = 'inline-flex';
    } else if (state.mpMode === 'guest') {
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
    const status = state.lobbyMeta?.status || 'waiting';
    const { total, ready } = lobbyCounts();
    const statusText = total ? `Players ready: ${ready}/${total}` : 'Waiting for players...';
    if (firebaseSession.isConnected() && (state.mpMode === 'host' || state.mpMode === 'guest')) {
      updateMpStatus(statusText);
    }
    if (readyBtn) {
      readyBtn.textContent = state.localReady ? 'Unready' : 'Ready Up';
      readyBtn.disabled = !firebaseSession.isConnected() || ((state.mpMode !== 'guest' && state.mpMode !== 'host')) || status === 'running';
    }
    if (startBtn) {
      const canStart = state.mpMode === 'host' && status !== 'running' && total >= MIN_MULTIPLAYER_PLAYERS && ready === total;
      startBtn.disabled = !canStart;
    }
  }

  function areAllPlayersReady() {
    const { total, ready } = lobbyCounts();
    if (total < MIN_MULTIPLAYER_PLAYERS) return false;
    return total > 0 && ready === total;
  }

  async function setLocalReadyState(nextReady) {
    if (!firebaseSession.isConnected()) return;
    const prev = state.localReady;
    state.localReady = nextReady;
    const shouldLock = nextReady && (state.mpMode === 'host' || state.mpMode === 'guest');
    if (shouldLock) {
      setPrefInputsDisabled(true);
    } else if (!nextReady) {
      setPrefInputsDisabled(false);
    }
    updateLobbyUi();
    try {
      await firebaseSession.setReady(nextReady);
    } catch (e) {
      state.localReady = prev;
      if (prev && (state.mpMode === 'host' || state.mpMode === 'guest')) {
        setPrefInputsDisabled(true);
      } else if (!prev) {
        setPrefInputsDisabled(false);
      }
      updateLobbyUi();
      updateMpError(`Ready update failed: ${e?.message || e}`);
    }
  }

  async function beginHostedMatch() {
    if (!firebaseSession.isConnected() || state.mpMode !== 'host') return;
    if (!areAllPlayersReady()) return;
    if (!gameState) return;
    updateMpStatus('Starting match...');
    forceResetState(gameState);
    gameState.paused = false;
    const startTs = Date.now();
    state.lobbyMeta = { ...(state.lobbyMeta || {}), status: 'running', startedAt: startTs };
    updateLobbyUi();
    setModeOverlayState('hidden');
    clearResultState();
    try {
      state.showLobbyOnWaiting = false;
      await broadcastSpawnSnapshot();
    } catch (e) {
      console.warn('Spawn snapshot failed', e);
    }
    try {
      await firebaseSession.updateMeta({ status: 'running', startedAt: startTs, lastResult: null });
    } catch (e) {
      updateMpError(`Failed to start match: ${e?.message || e}`);
    }
  }

  function handlePlayersUpdate(players) {
    state.lobbyPlayers = players || {};
    renderLobbyPlayers(state.lobbyPlayers);
    const assignedSlots = localRuntime.assignRemotePlayers(state.lobbyPlayers);
    if (state.mpMode !== 'host' && state.mpMode !== 'guest') {
      const total = gameState?.players?.length || 0;
      updateMpStatus(`Players: ${Math.min(assignedSlots, total)} / ${total}`);
    }
    updateLobbyUi();
  }

  function handleMetaChange(meta = {}) {
    state.lobbyMeta = meta || {};
    const status = state.lobbyMeta.status || 'waiting';
    const snapshot = state.lobbyMeta.spawnSnapshot;
    if (snapshot?.key && snapshot.key !== state.lastAppliedSpawnKey) {
      localRuntime.applySpawnSnapshot(snapshot);
      state.lastAppliedSpawnKey = snapshot.key;
    }
    const result = state.lobbyMeta.lastResult;
    if (result?.key && result.key !== state.lastResultShownKey) {
      showMatchResult(result);
    }
    if (!state.hasSelectedMultiplayer) return;
    if (status === 'running') {
      state.showLobbyOnWaiting = false;
      clearResultState();
      setModeOverlayState('hidden');
    } else if ((state.mpMode === 'host' || state.mpMode === 'guest') && state.showLobbyOnWaiting) {
      setModeOverlayState('lobby');
    }
    updateLobbyUi();
  }

  function handleRemoteInputs(inputs = {}) {
    const players = gameState?.players || [];
    Object.entries(inputs).forEach(([pid, intent]) => {
      const player = players.find((p) => p && p.clientId === pid);
      if (!player) return;
      player.isTurningLeft = !!intent.turningLeft;
      player.isTurningRight = !!intent.turningRight;
    });
  }

  function handleRemoteState(remoteState = {}) {
    const players = gameState?.players || [];
    const incoming = remoteState.players || [];
    const isFreshFrame = typeof remoteState.frame === 'number' && remoteState.frame <= 1;
    const updated = new Set();
    incoming.forEach((p, idx) => {
      const cfg = { name: p.name, color: p.color, controls: p.controls, clientId: p.clientId };
      let player = (p.clientId && localRuntime.playerByClientId?.(p.clientId)) || players[idx];
      if (!player) player = localRuntime.ensurePlayerSlot(idx, cfg);
      if (!player) return;
      if (cfg.clientId) player.clientId = cfg.clientId;
      if (cfg.name) player.name = cfg.name;
      if (cfg.controls) player.controls = cfg.controls;
      if (cfg.color) player.color = Array.isArray(cfg.color) ? cfg.color : rgbaFromHex(cfg.color);
      player.snakePosition.x = p.x;
      player.snakePosition.y = p.y;
      player.snakeDirection = p.direction;
      player.isAlive = p.isAlive;
      player.score = p.score;
      if (!player.trail || isFreshFrame) {
        player.trail = new Trail(1024, p.x, p.y);
      } else {
        const scratch = player._trailScratch || (player._trailScratch = { x: p.x, y: p.y });
        const last = player.trail.peekLast(scratch);
        if (!last || last.x !== p.x || last.y !== p.y) {
          player.trail.push(p.x, p.y);
        }
      }
      updated.add(player);
    });
    players.forEach((pl) => {
      if (!updated.has(pl)) {
        pl.active = false;
      } else {
        pl.active = true;
      }
    });
    try { localRuntime.updateControls(); } catch (e) {}
    try { localRuntime.renderRoster(); } catch (e) {}
    if (remoteState.lastUpdate) {
      const lag = Date.now() - remoteState.lastUpdate;
      updateLatency(lag);
    }
  }

  firebaseSession.setCallbacks({
    onPlayersUpdate: (players) => handlePlayersUpdate(players),
    onMetaUpdate: (meta) => handleMetaChange(meta || {}),
    onInputIntent: (inputs) => handleRemoteInputs(inputs),
    onStateUpdate: (remoteState) => handleRemoteState(remoteState || {})
  });

  async function cleanupRoomClient() {
    await firebaseSession.disconnect();
    syncContext();
  }

  function resetLobbyState() {
    state.lobbyPlayers = {};
    state.lobbyMeta = {};
    state.localReady = false;
    state.mpMode = state.mpMode === 'local' ? 'local' : null;
    setPrefInputsDisabled(false);
    state.lastAppliedSpawnKey = null;
    state.showLobbyOnWaiting = false;
    clearResultState();
    renderLobbyPlayers(state.lobbyPlayers);
    updateLobbyUi();
    updateLatency(null);
    updateRoomInfo(null);
    updateMpStatus('Offline');
    syncContext();
    localRuntime.refreshPlayerUi();
  }

  function getPlayerInfo() {
    const players = gameState?.players || [];
    const p1 = players[0] || {};
    return { name: p1.name || 'Player', color: '#ff6666', controls: p1.controls || '' };
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
  }

  function initModeOverlay() {
    const selectLocal = document.getElementById('selectLocal');
    const selectMp = document.getElementById('selectMp');
    const nameInput = document.getElementById('prefName');
    const colorInput = document.getElementById('prefColor');
    const controlsInput = document.getElementById('prefControls');

    state.capturePrefs = () => ({
      name: (nameInput && nameInput.value) || 'Player',
      color: (colorInput && colorInput.value) || '#66ccff',
      controls: (controlsInput && controlsInput.value) || 'ArrowLeft / ArrowRight'
    });

    state.prefInputs = [nameInput, colorInput, controlsInput].filter(Boolean);
    setPrefInputsDisabled(false);
    const handlePrefInput = () => {
      if (state.localReady && (state.mpMode === 'host' || state.mpMode === 'guest')) return;
      applyLocalPrefsFromInputs();
      syncRoomProfileFromPrefs();
    };
    if (nameInput) nameInput.addEventListener('input', handlePrefInput);
    if (colorInput) colorInput.addEventListener('change', handlePrefInput);
    if (controlsInput) controlsInput.addEventListener('change', handlePrefInput);

    setModeOverlayState('select');
    renderLobbyPlayers(state.lobbyPlayers);
    updateLobbyRoleUi();
    updateLobbyUi();

    if (selectLocal) {
      selectLocal.addEventListener('click', async () => {
        await cleanupRoomClient();
        resetLobbyState();
        state.mpMode = 'local';
        state.hasSelectedMultiplayer = false;
        state.showLobbyOnWaiting = false;
        applyLocalPrefsFromInputs();
        setModeOverlayState('hidden');
        openPlayerConfigMenu();
        updateMpStatus('Local mode');
        updateRoomInfo(null);
        state.localReady = false;
        setPrefInputsDisabled(false);
        updateLobbyRoleUi();
        syncContext();
        localRuntime.attachDefaultInputHandlers();
        localRuntime.refreshPlayerUi();
      });
    }

    if (selectMp) {
      selectMp.addEventListener('click', () => {
        state.hasSelectedMultiplayer = true;
        localRuntime.pruneToLocalOnly();
        state.localReady = false;
        setPrefInputsDisabled(false);
        applyLocalPrefsFromInputs();
        state.showLobbyOnWaiting = true;
        setModeOverlayState('lobby');
        updateLobbyRoleUi();
        updateMpStatus('Multiplayer selected - create or join a room');
      });
    }
  }

  async function broadcastSpawnSnapshot() {
    if (!firebaseSession.isConnected() || state.mpMode !== 'host') return null;
    if (!gameState?.players) return null;
    const key = `spawn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const players = gameState.players.map((p, idx) => {
      if (!p) return null;
      return {
        index: idx,
        id: p.id,
        clientId: p.clientId || null,
        name: p.name,
        x: p.snakePosition.x,
        y: p.snakePosition.y,
        direction: p.snakeDirection,
        color: p.color,
        controls: p.controls
      };
    }).filter(Boolean);
    try {
      await firebaseSession.updateMeta({ spawnSnapshot: { key, players } });
      state.lastAppliedSpawnKey = key;
      logPlayerPositions('host-broadcast');
    } catch (e) {
      console.warn('broadcastSpawnSnapshot failed', e);
    }
    return key;
  }

  async function startHost(roomId) {
    state.mpMode = 'host';
    state.hasSelectedMultiplayer = true;
    localRuntime.pruneToLocalOnly();
    applyLocalPrefsFromInputs();
    const info = state.pendingPrefs || getPlayerInfo();
    try {
      updateMpStatus('Connecting as host...');
      await firebaseSession.connectHost(roomId, info);
      updateMpStatus(`Hosting ${roomId}`);
      updateRoomInfo(roomId, 'host');
    } catch (e) {
      updateMpError(`Host join failed: ${e?.message || e}`);
      return;
    }
    syncContext();
    if (gameState?.players?.[0]) {
      gameState.players[0].clientId = firebaseSession.getPlayerId();
    }
    if (gameState) gameState.paused = true;
    state.localReady = false;
    setPrefInputsDisabled(false);
    try { await firebaseSession.setReady(false); } catch (e) {}
    localRuntime.refreshPlayerUi();
    localRuntime.attachDefaultInputHandlers();
    updateLobbyRoleUi();
    updateLobbyUi();
    state.showLobbyOnWaiting = true;
    setModeOverlayState('lobby');

    const callbacks = {
      onWinner: (player) => {
        const result = createResultPayload('win', { player: { id: player.id, name: player.name, color: player.color } });
        firebaseSession.updateMeta({ status: 'waiting', finishedAt: Date.now(), lastResult: result });
        showMatchResult(result);
      },
      onDraw: () => {
        const result = createResultPayload('draw');
        firebaseSession.updateMeta({ status: 'waiting', finishedAt: Date.now(), lastResult: result });
        showMatchResult(result);
      },
      publishState: (statePayload) => {
        const payload = {
          frame: statePayload.frameCounter,
          players: statePayload.players.map((p) => ({
            id: p.id,
            name: p.name,
            color: p.color,
            clientId: p.clientId || null,
            x: p.snakePosition.x,
            y: p.snakePosition.y,
            direction: p.snakeDirection,
            isAlive: p.isAlive,
            score: p.score
          }))
        };
        firebaseSession.publishState(payload);
      },
      publishHz: 8
    };

    startLoopWithCallbacks(callbacks);
    if (state.loopController) state.loopController.setCallbacks(callbacks);
  }

  async function startGuest(roomId) {
    state.mpMode = 'guest';
    state.hasSelectedMultiplayer = true;
    localRuntime.pruneToLocalOnly();
    applyLocalPrefsFromInputs();
    const info = state.pendingPrefs || getPlayerInfo();
    try {
      updateMpStatus('Joining room...');
      await firebaseSession.connectGuest(roomId, info);
      updateMpStatus(`Joined ${roomId}`);
      updateRoomInfo(roomId, 'guest');
    } catch (e) {
      updateMpError(`Join failed: ${e?.message || e}`);
      return;
    }
    syncContext();
    if (gameState?.players?.[0]) {
      gameState.players[0].clientId = firebaseSession.getPlayerId();
    }
    if (gameState) gameState.paused = true;
    state.localReady = false;
    setPrefInputsDisabled(false);
    try { await firebaseSession.setReady(false); } catch (e) {}
    localRuntime.refreshPlayerUi();
    localRuntime.attachDefaultInputHandlers();
    updateLobbyRoleUi();
    updateLobbyUi();
    state.showLobbyOnWaiting = true;
    setModeOverlayState('lobby');

    localRuntime.attachCustomInputHandlers({
      players: gameState.players,
      onInputChange: (playerIdx, flags) => {
        state.inputSeq += 1;
        firebaseSession.sendInput({
          seq: state.inputSeq,
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
      applyLocalPrefsFromInputs();
    };

    createBtn.addEventListener('click', async () => {
      const newId = firebaseSession.generateRoomId();
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
        if (!firebaseSession.isConnected() || (state.mpMode !== 'guest' && state.mpMode !== 'host')) return;
        if ((state.lobbyMeta?.status || 'waiting') === 'running') return;
        readyBtn.disabled = true;
        const next = !state.localReady;
        try {
          if (next) {
            applyLocalPrefsFromInputs();
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

  function startLocalLoop() {
    startLoopWithCallbacks({
      onWinner: (player) => {
        const result = createResultPayload('win', { player: { id: player.id, name: player.name, color: player.color } });
        showMatchResult(result);
      },
      onDraw: () => {
        const result = createResultPayload('draw');
        showMatchResult(result);
      }
    });
  }

  function boot() {
    syncContext();
    localRuntime.refreshPlayerUi();
    localRuntime.attachDefaultInputHandlers();
    startLocalLoop();
    document.addEventListener('DOMContentLoaded', () => {
      wireMultiplayerUI();
      initModeOverlay();
    });
  }

  function resetGame() {
    return localRuntime.handleReset(resetGameState);
  }

  function forceReset() {
    return localRuntime.handleReset(forceResetState);
  }

  return {
    boot,
    resetGame,
    forceReset,
    renderControls: () => localRuntime.updateControls(),
    setStatus: updateMpStatus
  };
}
