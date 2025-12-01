import {
  openPlayerConfigMenu,
  showDrawOverlay,
  showWinnerOverlay,
} from "../ui/overlays.js";
import { showCountdownOverlay } from "../ui/inGameOverlay.js";
import {
  startFixedStepLoop,
  resetGame as resetGameState,
  forceReset as forceResetState,
} from "../gameLoop.js";
import {
  cssFromColor,
  normalizeColorPayload,
  rgbaFromHex,
} from "./colorUtils.js";
import { normalizeColorHex } from "./playerColors.js";
import { createFirebaseSession } from "./firebaseSession.js";
import { Trail } from "../trail.js";

const MIN_MULTIPLAYER_PLAYERS = 1;
const DUMMY_NAMES = [
  "NeonNova",
  "TurboTrail",
  "PhotonFox",
  "CosmoComet",
  "PlasmaPulse",
  "OrbitOtter",
  "LazerLynx",
  "VectorViper",
  "QuasarQuokka",
  "StellarSpark",
];
const NAME_SUFFIX_CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const TRAIL_SNAPSHOT_POINTS = 12;
const TRAIL_SNAPSHOT_INTERVAL_MS = 75;

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
    lastResultShownKey: null,
    dummyNameCursor: Math.floor(Math.random() * DUMMY_NAMES.length),
    localColorHex: null,
    trailSeq: 0,
    lastMatchStartTs: 0,
    pendingSpawnClientIds: new Set(),
  };

  function stripRoomPrefix(value = "") {
    if (!value) return "";
    let trimmed = value.trim();
    let lower = trimmed.toLowerCase();
    while (lower.startsWith("room-")) {
      trimmed = trimmed.slice(5);
      lower = lower.slice(5);
    }
    return trimmed;
  }

  function normalizeRoomId(value) {
    if (typeof value !== "string") return "";
    let cleaned = value.trim().toLowerCase();
    if (!cleaned) return "";
    while (cleaned.startsWith("room-")) {
      cleaned = cleaned.slice(5);
    }
    if (!cleaned) return "";
    return `room-${cleaned}`;
  }

  function displayRoomCode(roomId) {
    if (!roomId) return "";
    const stripped = stripRoomPrefix(roomId);
    return stripped || roomId;
  }

  function randomNameSuffix(length = 2) {
    let out = "";
    for (let i = 0; i < length; i += 1) {
      const idx = Math.floor(Math.random() * NAME_SUFFIX_CHARS.length);
      out += NAME_SUFFIX_CHARS[idx];
    }
    return out;
  }

  function nextDummyName() {
    const idx = state.dummyNameCursor % DUMMY_NAMES.length;
    const name = DUMMY_NAMES[idx];
    state.dummyNameCursor = (state.dummyNameCursor + 1) % DUMMY_NAMES.length;
    return `${name}-${randomNameSuffix(2)}`;
  }

  function updateAssignedColorSwatch(color) {
    const swatch = document.getElementById("prefColorSwatch");
    const fallback = "#444444";
    if (swatch) swatch.style.background = color || fallback;
  }

  function syncLocalPlayerColor(color) {
    const normalized = normalizeColorHex(color);
    if (!normalized || normalized === state.localColorHex) {
      if (!normalized) updateAssignedColorSwatch(null);
      return;
    }
    state.localColorHex = normalized;
    updateAssignedColorSwatch(normalized);
    const localPlayer = gameState?.players?.[0];
    if (localPlayer) {
      localPlayer.color = normalizeColorPayload(normalized);
      localRuntime.refreshPlayerUi();
    }
  }

  function syncContext() {
    const roomPlayerId = firebaseSession.getPlayerId();
    localRuntime.setContext({
      mpMode: state.mpMode || "local",
      hasRoom: firebaseSession.isConnected(),
      roomPlayerId,
    });
    if (gameState) {
      gameState.localClientId = roomPlayerId || null;
    }
  }

  function withLoopExtras(callbacks = {}) {
    return { ...callbacks, afterStep: handleAfterStep };
  }

  function startLoopWithCallbacks(callbacks) {
    const merged = withLoopExtras(callbacks);
    if (state.loopStarted) {
      if (state.loopController) state.loopController.setCallbacks(merged);
      return;
    }
    state.loopStarted = true;
    state.loopController = startFixedStepLoop(gameState, merged);
  }

  function updateMpStatus(text) {
    const el = document.getElementById("mpStatus");
    if (el) el.textContent = text;
  }

  function updateRoomInfo(roomId, role) {
    const el = document.getElementById("mpRoomInfo");
    const display = document.getElementById("roomDisplay");
    const copyBtn = document.getElementById("mpRoomCopyBtn");
    const friendly = roomId ? displayRoomCode(roomId) : null;
    const copyCode = roomId ? stripRoomPrefix(roomId) : "";
    const text = friendly ? `${friendly}` : "--";
    if (el) el.textContent = text;
    if (display) display.textContent = text;
    if (copyBtn) {
      copyBtn.disabled = !copyCode;
      copyBtn.dataset.roomCode = copyCode || "";
      copyBtn.title = copyCode ? `Copy ${copyCode}` : "Copy room code";
      if (!copyCode) copyBtn.textContent = "Copy Code";
    }
  }

  async function copyTextToClipboard(value) {
    if (!value) return false;
    const text = String(value);
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (err) {
      console.warn("Clipboard API copy failed", err);
    }
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "absolute";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      const result = document.execCommand("copy");
      document.body.removeChild(textarea);
      return result;
    } catch (err) {
      console.warn("execCommand copy fallback failed", err);
      return false;
    }
  }

  function updateLatency(ms) {
    const el = document.getElementById("mpLatency");
    if (!el) return;
    if (ms == null) {
      el.textContent = "Latency: --";
      return;
    }
    el.textContent = `Latency: ${Math.max(0, Math.round(ms))} ms`;
  }

  function updateMpError(text) {
    const el = document.getElementById("mpStatus");
    if (el) el.textContent = text;
    console.error("[multiplayer]", text);
  }

  function dismissResultOverlay() {
    const overlay = document.getElementById("winnerOverlay");
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  }

  function clearResultState() {
    dismissResultOverlay();
    state.lastResultShownKey = null;
  }

  function getPlayAgainOptions() {
    if (state.mpMode === "guest") {
      return {
        disablePlayAgain: true,
        disabledMessage: "Waiting for host to restart",
      };
    }
    return undefined;
  }

  function resolveResultPlayer(playerInfo = {}) {
    const list = gameState?.players || [];
    const byClient = playerInfo.clientId
      ? list.find((p) => p?.clientId === playerInfo.clientId)
      : null;
    const byId =
      !byClient && playerInfo.id
        ? list.find((p) => p?.id === playerInfo.id)
        : null;
    const match = byClient || byId;
    if (match) {
      return {
        id: match.id,
        name: match.name,
        color: match.color,
      };
    }
    return {
      id: playerInfo.id,
      name: playerInfo.name,
      color: normalizeColorPayload(playerInfo.color),
    };
  }

  function createResultPayload(type, extra = {}) {
    return {
      key: `result-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 6)}`,
      type,
      ...extra,
    };
  }

  function createResultPlayerPayload(player = {}) {
    if (!player) return null;
    return {
      id: player.id ?? null,
      clientId: player.clientId ?? null,
      name: player.name ?? null,
      color: normalizeColorPayload(player.color),
    };
  }

  function showMatchResult(result) {
    if (!result || !gameState) return;
    if (result.key) state.lastResultShownKey = result.key;
    const options = getPlayAgainOptions();
    const callback = () => {
      if (state.mpMode === "host") {
        beginHostedMatch();
      } else {
        forceResetState(gameState);
        localRuntime.refreshPlayerUi();
      }
    };
    if (result.type === "win" && result.player) {
      const playerData = resolveResultPlayer(result.player);
      playerData.color = normalizeColorPayload(playerData.color);
      showWinnerOverlay(playerData, callback, options);
    } else if (result.type === "draw") {
      showDrawOverlay(callback, options);
    }
  }

  function logPlayerPositions(contextLabel = "snapshot") {
    localRuntime.logPlayerPositions(contextLabel);
  }

  function resetSpawnConfirmations() {
    state.pendingSpawnClientIds = new Set();
    if (gameState) gameState.waitingForSpawnConfirm = false;
  }

  function setupSpawnConfirmations() {
    if (!gameState) {
      resetSpawnConfirmations();
      return;
    }
    const pending = new Set();
    const localId = firebaseSession.getPlayerId();
    (gameState.players || []).forEach((player) => {
      if (!player || !player.clientId) return;
      if (localId && player.clientId === localId) return;
      if (player.active === false) return;
      pending.add(player.clientId);
    });
    state.pendingSpawnClientIds = pending;
    if (gameState) gameState.waitingForSpawnConfirm = pending.size > 0;
  }

  function confirmSpawnForClient(clientId) {
    if (!clientId || !state.pendingSpawnClientIds) return;
    if (!state.pendingSpawnClientIds.has(clientId)) return;
    state.pendingSpawnClientIds.delete(clientId);
    if (state.pendingSpawnClientIds.size === 0 && gameState) {
      gameState.waitingForSpawnConfirm = false;
    }
  }

  function pruneSpawnConfirmations() {
    if (!state.pendingSpawnClientIds || state.pendingSpawnClientIds.size === 0)
      return;
    const lobbyIds = new Set(Object.keys(state.lobbyPlayers || {}));
    let changed = false;
    state.pendingSpawnClientIds.forEach((clientId) => {
      if (!lobbyIds.has(clientId)) {
        state.pendingSpawnClientIds.delete(clientId);
        changed = true;
      }
    });
    if (changed && state.pendingSpawnClientIds.size === 0 && gameState) {
      gameState.waitingForSpawnConfirm = false;
    }
  }

  function applyRemoteDeathScores(deadPlayer) {
    if (!deadPlayer || !gameState?.players) return;
    const players = gameState.players;
    players.forEach((p) => {
      if (!p || p.id === deadPlayer.id) return;
      if (p.isAlive) {
        p.score = (Number(p.score) || 0) + 1;
      }
    });
    try {
      if (typeof window.updateControlsInfoUI === "function") {
        window.updateControlsInfoUI(players);
      }
    } catch (e) { }
  }

  function getLocalNetworkPlayer() {
    if (!gameState?.players) return null;
    const localId = firebaseSession.getPlayerId();
    if (!localId) return null;
    return gameState.players.find((p) => p && p.clientId === localId) || null;
  }

  function collectRecentTrailPoints(trail, maxPoints) {
    if (!trail || trail.length === 0) return [];
    const count = Math.max(1, Math.min(maxPoints, trail.length));
    const start = trail.length - count;
    const out = [];
    const temp = { x: 0, y: 0 };
    for (let i = start; i < trail.length; i++) {
      const pt = trail.get(i, temp);
      if (!pt) continue;
      // Preserve NaN coordinates so gaps are visible to remote clients
      const x = Number.isFinite(pt.x) ? pt.x : NaN;
      const y = Number.isFinite(pt.y) ? pt.y : NaN;
      out.push([x, y]);
    }
    return out;
  }

  function replaceTrailTailPoints(player, points) {
    if (!Array.isArray(points) || points.length === 0) return;
    if (!player.trail) {
      player.trail = new Trail(1024, points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) {
        const pair = points[i];
        if (!Array.isArray(pair)) continue;
        player.trail.push(pair[0], pair[1]);
      }
      return;
    }
    if (player.trail.length < points.length) {
      player.trail.clear();
      for (let i = 0; i < points.length; i++) {
        const pair = points[i];
        if (!Array.isArray(pair)) continue;
        player.trail.push(pair[0], pair[1]);
      }
      return;
    }
    const start = player.trail.length - points.length;
    for (let i = 0; i < points.length; i++) {
      const pair = points[i];
      if (!Array.isArray(pair)) continue;
      const rawX = pair[0];
      const rawY = pair[1];
      const x = Number(rawX);
      const y = Number(rawY);
      // Allow NaN values to represent gaps — set them into the trail
      if (!Number.isFinite(x) && !Number.isFinite(y)) {
        player.trail.set(start + i, NaN, NaN);
        continue;
      }
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        // If one coord is invalid, set both to NaN to mark a gap
        player.trail.set(start + i, NaN, NaN);
        continue;
      }
      player.trail.set(start + i, x, y);
    }
  }

  function applyTrailSnapshotPayload(clientId, payload) {
    if (!payload || !gameState) return;
    const currentSpawnKey = state.lastAppliedSpawnKey || null;
    const payloadSpawn = payload.spawnKey || null;
    if (currentSpawnKey && payloadSpawn && payloadSpawn !== currentSpawnKey) {
      return;
    }
    if (currentSpawnKey && !payloadSpawn) {
      return;
    }
    const player = localRuntime.playerByClientId(clientId);
    if (!player) return;
    confirmSpawnForClient(clientId);
    const seq =
      typeof payload.seq === "number" ? payload.seq : Number(payload.seq);
    if (Number.isFinite(seq)) {
      const prev =
        typeof player._lastTrailSyncSeq === "number"
          ? player._lastTrailSyncSeq
          : -Infinity;
      if (seq <= prev) return;
      player._lastTrailSyncSeq = seq;
    }
    const points = Array.isArray(payload.points) ? payload.points : [];
    if (points.length > 0) {
      replaceTrailTailPoints(player, points);
      const lastPair = points[points.length - 1];
      if (Array.isArray(lastPair)) {
        const lx = Number(lastPair[0]);
        const ly = Number(lastPair[1]);
        if (Number.isFinite(lx)) player.snakePosition.x = lx;
        if (Number.isFinite(ly)) player.snakePosition.y = ly;
      }
    }
      // Apply gap state sent by remote if present
      if (typeof payload.isGap === 'boolean') {
        player.isGap = !!payload.isGap;
      }
    if (typeof payload.direction === "number") {
      player.snakeDirection = payload.direction;
    }
    const isAlive = payload.isAlive !== false;
    if (!isAlive && player.isAlive) {
      player.isAlive = false;
      if (!player._deathProcessed) {
        player._deathProcessed = true;
        applyRemoteDeathScores(player);
      }
    } else if (isAlive && !player.isAlive) {
      player.isAlive = true;
      player._deathProcessed = false;
    }
  }

  function handleTrailSnapshots(trails = {}) {
    const entries = Object.entries(trails || {});
    if (!entries.length) return;
    const localId = firebaseSession.getPlayerId();
    const minTs = state.lastMatchStartTs || 0;
    entries.forEach(([clientId, payload]) => {
      if (!payload) return;
      if (localId && clientId === localId) return;
      const payloadTs =
        typeof payload.ts === "number" ? payload.ts : Number(payload.ts);
      if (minTs && Number.isFinite(payloadTs) && payloadTs < minTs) {
        return;
      }
      applyTrailSnapshotPayload(clientId, payload);
    });
  }

  function maybeSendLocalTrailSnapshot(options = {}) {
    const { force = false, resetSeq = false } = options;
    if (!firebaseSession.isConnected()) return;
    if (state.mpMode !== "host" && state.mpMode !== "guest") return;
    if (!gameState) return;
    const localPlayer = getLocalNetworkPlayer();
    if (!localPlayer || !localPlayer.trail || localPlayer.trail.length === 0)
      return;
    const now = Date.now();
    const hadBroadcast = !!localPlayer._lastTrailBroadcast;
    const prevMeta = localPlayer._lastTrailBroadcast || {
      ts: 0,
      length: 0,
      alive: true,
    };
    const aliveChanged = prevMeta.alive !== !!localPlayer.isAlive;
    if (!force) {
      if (gameState.paused && !aliveChanged && hadBroadcast) {
        return;
      }
      if (!aliveChanged && now - prevMeta.ts < TRAIL_SNAPSHOT_INTERVAL_MS) {
        return;
      }
    }
    const points = collectRecentTrailPoints(
      localPlayer.trail,
      TRAIL_SNAPSHOT_POINTS,
    );
    if (!points.length) return;
    if (resetSeq) state.trailSeq = 0;
    state.trailSeq += 1;
    firebaseSession
      .sendTrailSnapshot({
        seq: state.trailSeq,
        ts: now,
        points,
        direction: localPlayer.snakeDirection,
        isAlive: !!localPlayer.isAlive,
        isGap: !!localPlayer.isGap,
        spawnKey: state.lastAppliedSpawnKey || null,
      })
      .catch((err) => {
        console.warn("sendTrailSnapshot failed", err);
      });
    localPlayer._lastTrailBroadcast = {
      ts: now,
      length: localPlayer.trail.length,
      alive: !!localPlayer.isAlive,
    };
  }

  function handleAfterStep() {
    maybeSendLocalTrailSnapshot();
  }

  function setPrefInputsDisabled(disabled) {
    const flag = !!disabled;
    state.prefInputs.forEach((input) => {
      if (input) input.disabled = flag;
    });
  }

  function rebindInputHandlers() {
    const isNetMode = state.mpMode === "host" || state.mpMode === "guest";
    if (isNetMode && firebaseSession.isConnected()) {
      attachNetworkInputHandlers();
      return;
    }
    localRuntime.attachDefaultInputHandlers();
  }

  function handleLocalConfigStart(event) {
    const roster = event?.detail?.players;
    if (!Array.isArray(roster) || roster.length < 2) return;
    const isMultiplayerMode =
      state.mpMode === "host" || state.mpMode === "guest";
    if (isMultiplayerMode || state.hasSelectedMultiplayer) return;
    localRuntime.applyLocalRoster(roster);

    // Start countdown for local game
    if (gameState) gameState.paused = true;
    showCountdownOverlay(3, () => {
      if (gameState) gameState.paused = false;
    });
  }

  function applyLocalPrefsFromInputs() {
    if (!state.capturePrefs) return state.pendingPrefs;
    state.pendingPrefs = state.capturePrefs();
    localRuntime.applyLocalPrefs(state.pendingPrefs);
    rebindInputHandlers();
    return state.pendingPrefs;
  }

  function syncPrefsFromInputs(options = {}) {
    const force = !!options.force;
    if (
      !force &&
      state.localReady &&
      (state.mpMode === "host" || state.mpMode === "guest")
    ) {
      return;
    }
    applyLocalPrefsFromInputs();
    syncRoomProfileFromPrefs();
  }

  function updatePrimaryActionsVisibility() {
    const playerBtn = document.getElementById("openPlayerMenuBtn");
    const startBtn = document.getElementById("startGameBtn");
    const isMultiplayer =
      state.mpMode === "host" ||
      state.mpMode === "guest" ||
      state.hasSelectedMultiplayer;
    const display = isMultiplayer ? "none" : "";
    if (playerBtn) playerBtn.style.display = display;
    if (startBtn) startBtn.style.display = display;
  }

  async function syncRoomProfileFromPrefs() {
    if (!firebaseSession.isConnected() || !state.pendingPrefs) return;
    try {
      await firebaseSession.updateProfile({
        name: state.pendingPrefs.name,
        controls: state.pendingPrefs.controls,
      });
    } catch (e) {
      console.warn("syncRoomProfileFromPrefs failed", e);
    }
  }

  function setModeOverlayState(mode) {
    const overlay = document.getElementById("modeOverlay");
    const selectBlock = document.getElementById("modeSelectBlock");
    const roomPrompt = document.getElementById("mpRoomPrompt");
    const mpConfig = document.getElementById("mpConfig");
    if (!overlay) return;
    if (mode === "hidden") {
      overlay.style.display = "none";
      return;
    }
    overlay.style.display = "flex";
    if (selectBlock)
      selectBlock.style.display = mode === "select" ? "block" : "none";
    if (roomPrompt)
      roomPrompt.style.display = mode === "room" ? "flex" : "none";
    if (mpConfig) mpConfig.style.display = mode === "lobby" ? "block" : "none";
  }

  function renderLobbyPlayers(players) {
    const listEl = document.getElementById("mpPlayerList");
    if (!listEl) return;
    const hostId = state.lobbyMeta?.hostId || null;
    const localId = firebaseSession.getPlayerId();
    const entries = Object.values(players || {}).sort(
      (a, b) => (a?.joinedAt || 0) - (b?.joinedAt || 0)
    );
    if (!entries.length) {
      listEl.innerHTML = '<div class="muted-text">No players connected</div>';
      return;
    }
    const rows = entries
      .map((p) => {
        const color = cssFromColor(rgbaFromHex(p?.color || "#888888"));
        const name = escapeHtml(p?.name || p?.id || "Player");
        const isHost = !!(
          p &&
          ((hostId && p.id === hostId) ||
            (typeof p.isHost === "boolean"
              ? p.isHost
              : state.mpMode === "host" && localId && p.id === localId))
        );
        const ready = !!p?.ready;
        const badgeClass = isHost ? "host" : ready ? "yes" : "no";
        // Compact labels/icons
        const label = isHost ? "HOST" : ready ? "RDY" : "";

        return `<div class="mp-player ${badgeClass}" title="${name}">
          <span class="swatch" style="background:${color};"></span>
          <span class="name">${name}</span>
          ${label ? `<span class="status-badge">${label}</span>` : ""}
        </div>`;
      })
      .join("");
    listEl.innerHTML = rows;
  }

  function lobbyCounts() {
    const players = Object.values(state.lobbyPlayers || {});
    const total = players.length;
    const ready = players.filter((p) => p && p.ready).length;
    const hostId = state.lobbyMeta?.hostId || null;
    const localId = firebaseSession.getPlayerId();
    const hostPresent = players.some((p) => {
      if (!p) return false;
      if (hostId) return p.id === hostId;
      if (typeof p.isHost === "boolean") return !!p.isHost;
      if (state.mpMode === "host" && localId) return p.id === localId;
      return false;
    });
    const guests = players.filter((p) => {
      if (!p) return false;
      if (hostId) return p.id !== hostId;
      if (typeof p.isHost === "boolean") return !p.isHost;
      if (state.mpMode === "host" && localId) return p.id !== localId;
      return true;
    });
    const guestTotal = guests.length;
    const guestReady = guests.filter((p) => p.ready).length;
    return { total, ready, guestTotal, guestReady, hostPresent };
  }

  function updateLobbyRoleUi() {
    const readyBtn = document.getElementById("mpReadyBtn");
    const startBtn = document.getElementById("mpStartBtn");
    if (!readyBtn || !startBtn) return;
    if (state.mpMode === "host") {
      readyBtn.style.display = "none";
      startBtn.style.display = "inline-flex";
    } else if (state.mpMode === "guest") {
      readyBtn.style.display = "inline-flex";
      startBtn.style.display = "none";
    } else {
      readyBtn.style.display = "inline-flex";
      startBtn.style.display = "none";
      readyBtn.disabled = true;
    }
  }

  function updateLobbyUi() {
    const readyBtn = document.getElementById("mpReadyBtn");
    const startBtn = document.getElementById("mpStartBtn");
    const status = state.lobbyMeta?.status || "waiting";
    const { total, ready, guestTotal, guestReady, hostPresent } = lobbyCounts();
    const guestsReady = guestTotal === 0 || (guestReady === guestTotal);
    const enoughPlayers = total >= MIN_MULTIPLAYER_PLAYERS;
    let statusText = "Waiting for players...";
    if (total) {
      if (hostPresent) {
        statusText = guestTotal
          ? `Guests ready: ${guestReady}/${guestTotal}`
          : "Waiting for guests...";
      } else {
        statusText = `Players ready: ${ready}/${total}`;
      }
    }
    if (
      firebaseSession.isConnected() &&
      (state.mpMode === "host" || state.mpMode === "guest")
    ) {
      updateMpStatus(statusText);
    }
    if (readyBtn) {
      readyBtn.textContent = state.localReady ? "Unready" : "Ready Up";
      readyBtn.disabled =
        !firebaseSession.isConnected() ||
        (state.mpMode !== "guest" && state.mpMode !== "host") ||
        status === "running";
    }
    if (startBtn) {
      const canStart =
        state.mpMode === "host" &&
        status !== "running" &&
        enoughPlayers &&
        guestsReady;
      startBtn.disabled = !canStart;
      if (!guestsReady) {
        startBtn.title = "Waiting for other players to ready up";
      } else if (!enoughPlayers) {
        startBtn.title = `Need at least ${MIN_MULTIPLAYER_PLAYERS} players`;
      } else {
        startBtn.removeAttribute("title");
      }
    }
  }

  function areGuestsReady() {
    const { guestTotal, guestReady } = lobbyCounts();
    return guestTotal === 0 || (guestReady === guestTotal);
  }

  function hasEnoughPlayers() {
    const { total } = lobbyCounts();
    return total >= MIN_MULTIPLAYER_PLAYERS;
  }

  async function setLocalReadyState(nextReady) {
    if (!firebaseSession.isConnected()) return;
    const prev = state.localReady;
    state.localReady = nextReady;
    const shouldLock =
      nextReady && (state.mpMode === "host" || state.mpMode === "guest");
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
      if (prev && (state.mpMode === "host" || state.mpMode === "guest")) {
        setPrefInputsDisabled(true);
      } else if (!prev) {
        setPrefInputsDisabled(false);
      }
      updateLobbyUi();
      updateMpError(`Ready update failed: ${e?.message || e}`);
    }
  }

  async function beginHostedMatch() {
    if (!firebaseSession.isConnected() || state.mpMode !== "host") return;
    if (!hasEnoughPlayers() || !areGuestsReady()) {
      updateMpError("Cannot start: not enough players or not all ready");
      return;
    }
    try {
      forceResetState(gameState);
      if (gameState) gameState.paused = true;
      await firebaseSession.updateMeta({ status: "running", startedAt: Date.now() });
      const spawnKey = await broadcastSpawnSnapshot();
      state.pendingSpawnClientIds = new Set(
        Object.values(state.lobbyPlayers || {})
          .map((p) => p.id)
          .filter((id) => id !== firebaseSession.getPlayerId())
      );

      // Start countdown for host
      setModeOverlayState("hidden");
      // Host sets status to running immediately so guests see it, 
      // but local pause is handled by countdown callback.
      // Note: handleMetaChange will also trigger for host, so we need to be careful not to double countdown.
      // Actually, handleMetaChange sees "running" and might trigger it too.
      // Let's rely on handleMetaChange for consistency or just set it here.
      // If we set it here, handleMetaChange might re-trigger.
      // Let's just update meta and let handleMetaChange do the work for everyone including host.

    } catch (e) {
      console.warn("beginHostedMatch failed", e);
    }
  }

  function handlePlayersUpdate(players) {
    state.lobbyPlayers = players || {};
    pruneSpawnConfirmations();
    renderLobbyPlayers(state.lobbyPlayers);
    const localId = firebaseSession.getPlayerId();
    if (localId) {
      const localEntry =
        state.lobbyPlayers[localId] ||
        Object.values(state.lobbyPlayers || {}).find(
          (player) => player?.id === localId
        );
      if (localEntry?.color) {
        syncLocalPlayerColor(localEntry.color);
      }
    }
    const assignedSlots = localRuntime.assignRemotePlayers(state.lobbyPlayers);
    if (state.mpMode !== "host" && state.mpMode !== "guest") {
      const total = gameState?.players?.length || 0;
      updateMpStatus(`Players: ${Math.min(assignedSlots, total)} / ${total}`);
    }
    updateLobbyUi();
  }

  function handleMetaChange(meta = {}) {
    state.lobbyMeta = meta || {};
    const status = state.lobbyMeta.status || "waiting";
    if (typeof state.lobbyMeta.startedAt === "number") {
      state.lastMatchStartTs = state.lobbyMeta.startedAt;
    }
    if (status !== "running") {
      resetSpawnConfirmations();
    }
    const snapshot = state.lobbyMeta.spawnSnapshot;
    if (snapshot?.key && snapshot.key !== state.lastAppliedSpawnKey) {
      localRuntime.applySpawnSnapshot(snapshot);
      state.lastAppliedSpawnKey = snapshot.key;
      if (state.mpMode === "host") {
        setupSpawnConfirmations();
      }
      maybeSendLocalTrailSnapshot({ force: true, resetSeq: true });
    }
    const result = state.lobbyMeta.lastResult;
    if (result?.key && result.key !== state.lastResultShownKey) {
      showMatchResult(result);
    }
    if ((state.mpMode === "host" || state.mpMode === "guest") && gameState) {
      // If status is running, we might need to start countdown if we just transitioned
      if (status === "running" && gameState.paused) {
        // We are transitioning to running state
        setModeOverlayState("hidden");
        showCountdownOverlay(3, () => {
          if (gameState) gameState.paused = false;
        });
      } else if (status !== "running") {
        gameState.paused = true;
      }
    }
    if (!state.hasSelectedMultiplayer) return;
    if (status === "running") {
      state.showLobbyOnWaiting = false;
      clearResultState();
      // setModeOverlayState("hidden"); // Handled above with countdown
    } else if (
      (state.mpMode === "host" || state.mpMode === "guest") &&
      state.showLobbyOnWaiting
    ) {
      setModeOverlayState("lobby");
    }
    updateLobbyUi();
  }

  function handleRemoteInputs(inputs = {}) {
    const players = gameState?.players || [];
    const localId = firebaseSession.getPlayerId();
    let freshestTs = null;
    Object.entries(inputs).forEach(([pid, intent]) => {
      if (localId && pid === localId) return;
      const player = players.find((p) => p && p.clientId === pid);
      if (!player) return;
      const seq =
        typeof intent.seq === "number" ? intent.seq : Number(intent.seq);
      if (typeof seq === "number" && !Number.isNaN(seq)) {
        const prevSeq =
          typeof player._lastRemoteInputSeq === "number"
            ? player._lastRemoteInputSeq
            : -Infinity;
        if (seq <= prevSeq) return;
        player._lastRemoteInputSeq = seq;
      }
      player.isTurningLeft = !!intent.turningLeft;
      player.isTurningRight = !!intent.turningRight;
      const ts = typeof intent.ts === "number" ? intent.ts : Number(intent.ts);
      if (typeof ts === "number" && !Number.isNaN(ts)) {
        freshestTs = freshestTs == null ? ts : Math.max(freshestTs, ts);
      }
    });
    if (freshestTs != null) {
      const lag = Date.now() - freshestTs;
      updateLatency(lag);
    }
  }

  function sendLocalInputIntent(flags = {}) {
    if (!firebaseSession.isConnected()) return;
    state.inputSeq += 1;
    firebaseSession.sendInput({
      seq: state.inputSeq,
      ts: Date.now(),
      turningLeft: !!flags.isTurningLeft,
      turningRight: !!flags.isTurningRight,
    });
  }

  function attachNetworkInputHandlers() {
    if (!gameState?.players) return;
    const localId = firebaseSession.getPlayerId();
    if (!localId) return;
    const localPlayer = (gameState.players || []).find(
      (p) => p && p.clientId === localId
    );
    if (!localPlayer) return;
    localRuntime.attachCustomInputHandlers({
      players: [localPlayer],
      onInputChange: (_playerIdx, flags) => {
        if (!firebaseSession.isConnected()) return;
        sendLocalInputIntent(flags);
      },
    });
    sendLocalInputIntent({
      isTurningLeft: !!localPlayer.isTurningLeft,
      isTurningRight: !!localPlayer.isTurningRight,
    });
  }

  firebaseSession.setCallbacks({
    onPlayersUpdate: (players) => handlePlayersUpdate(players),
    onMetaUpdate: (meta) => handleMetaChange(meta || {}),
    onInputIntent: (inputs) => handleRemoteInputs(inputs),
    onTrailUpdate: (trails) => handleTrailSnapshots(trails || {}),
  });

  async function cleanupRoomClient() {
    await firebaseSession.disconnect();
    syncContext();
  }

  function resetLobbyState() {
    state.lobbyPlayers = {};
    state.lobbyMeta = {};
    state.localReady = false;
    state.mpMode = state.mpMode === "local" ? "local" : null;
    state.localColorHex = null;
    state.trailSeq = 0;
    resetSpawnConfirmations();
    setPrefInputsDisabled(false);
    state.lastAppliedSpawnKey = null;
    state.showLobbyOnWaiting = false;
    clearResultState();
    renderLobbyPlayers(state.lobbyPlayers);
    updateAssignedColorSwatch(null);
    updateLobbyUi();
    updateLatency(null);
    updateRoomInfo(null);
    updateMpStatus("Offline");
    syncContext();
    localRuntime.attachDefaultInputHandlers();
    localRuntime.refreshPlayerUi();
    updatePrimaryActionsVisibility();
  }

  function getPlayerInfo() {
    const players = gameState?.players || [];
    const p1 = players[0] || {};
    return {
      name: p1.name || nextDummyName(),
      controls: p1.controls || "ArrowLeft / ArrowRight",
    };
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text == null ? "" : String(text);
    return div.innerHTML;
  }

  function initModeOverlay() {
    const selectLocal = document.getElementById("selectLocal");
    const selectMp = document.getElementById("selectMp");
    const nameInput = document.getElementById("prefName");
    const controlsInput = document.getElementById("prefControls");
    const roomPromptBack = document.getElementById("mpRoomPromptBack");

    const ensureDummyNameSeed = () => {
      if (!nameInput) return nextDummyName();
      const trimmed = nameInput.value.trim();
      if (trimmed) return trimmed;
      const generated = nextDummyName();
      nameInput.value = generated;
      return generated;
    };

    state.capturePrefs = () => ({
      name: ensureDummyNameSeed(),
      controls:
        (controlsInput && controlsInput.value) || "ArrowLeft / ArrowRight",
    });

    state.prefInputs = [nameInput, controlsInput].filter(Boolean);
    setPrefInputsDisabled(false);
    ensureDummyNameSeed();

    const handlePrefInput = () => {
      syncPrefsFromInputs();
    };

    if (nameInput) nameInput.addEventListener("input", handlePrefInput);
    if (controlsInput)
      controlsInput.addEventListener("change", handlePrefInput);

    syncPrefsFromInputs();

    setModeOverlayState("select");
    renderLobbyPlayers(state.lobbyPlayers);
    updateLobbyRoleUi();
    updateLobbyUi();
    updatePrimaryActionsVisibility();

    if (selectLocal) {
      selectLocal.addEventListener("click", async () => {
        await cleanupRoomClient();
        resetLobbyState();
        state.mpMode = "local";
        state.hasSelectedMultiplayer = false;
        state.showLobbyOnWaiting = false;
        applyLocalPrefsFromInputs();
        setModeOverlayState("hidden");
        openPlayerConfigMenu();
        updateMpStatus("Local mode");
        updateRoomInfo(null);
        state.localReady = false;
        setPrefInputsDisabled(false);
        updateLobbyRoleUi();
        syncContext();
        localRuntime.attachDefaultInputHandlers();
        localRuntime.refreshPlayerUi();
        updatePrimaryActionsVisibility();
      });
    }

    if (selectMp) {
      selectMp.addEventListener("click", () => {
        state.hasSelectedMultiplayer = true;
        localRuntime.pruneToLocalOnly();
        state.localReady = false;
        setPrefInputsDisabled(false);
        applyLocalPrefsFromInputs();
        state.showLobbyOnWaiting = false;
        setModeOverlayState("room");
        updateLobbyRoleUi();
        updateMpStatus("Choose create or join to continue");
        updatePrimaryActionsVisibility();
      });
    }

    if (roomPromptBack) {
      roomPromptBack.addEventListener("click", () => {
        state.hasSelectedMultiplayer = false;
        state.localReady = false;
        state.showLobbyOnWaiting = false;
        setPrefInputsDisabled(false);
        setModeOverlayState("select");
        updateRoomInfo(null);
        updateMpStatus("Offline");
        updatePrimaryActionsVisibility();
      });
    }
  }

  async function broadcastSpawnSnapshot() {
    if (!firebaseSession.isConnected() || state.mpMode !== "host") return null;
    if (!gameState?.players) return null;
    const key = `spawn-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    const players = gameState.players
      .map((p, idx) => {
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
          controls: p.controls,
        };
      })
      .filter(Boolean);
    try {
      await firebaseSession.updateMeta({ spawnSnapshot: { key, players } });
      // state.lastAppliedSpawnKey = key;
      logPlayerPositions("host-broadcast");
    } catch (e) {
      console.warn("broadcastSpawnSnapshot failed", e);
    }
    return key;
  }

  async function startHost(roomIdInput) {
    const roomId = normalizeRoomId(roomIdInput);
    if (!roomId) {
      updateMpError("Enter a valid room id to host");
      return;
    }
    state.mpMode = "host";
    state.inputSeq = 0;
    state.trailSeq = 0;
    state.hasSelectedMultiplayer = true;
    localRuntime.pruneToLocalOnly();
    applyLocalPrefsFromInputs();
    const info = state.pendingPrefs || getPlayerInfo();
    try {
      updateMpStatus("Connecting as host...");
      await firebaseSession.connectHost(roomId, info);
      updateMpStatus(`Hosting ${displayRoomCode(roomId)}`);
      updateRoomInfo(roomId, "host");
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
    try {
      await firebaseSession.setReady(false);
    } catch (e) { }
    localRuntime.refreshPlayerUi();
    attachNetworkInputHandlers();
    maybeSendLocalTrailSnapshot();
    updateLobbyRoleUi();
    updateLobbyUi();
    state.showLobbyOnWaiting = true;
    setModeOverlayState("lobby");
    updatePrimaryActionsVisibility();

    const callbacks = {
      onWinner: (player) => {
        const result = createResultPayload("win", {
          player: createResultPlayerPayload(player),
        });
        firebaseSession.updateMeta({
          status: "waiting",
          finishedAt: Date.now(),
          lastResult: result,
        });
        showMatchResult(result);
      },
      onDraw: () => {
        const result = createResultPayload("draw");
        firebaseSession.updateMeta({
          status: "waiting",
          finishedAt: Date.now(),
          lastResult: result,
        });
        showMatchResult(result);
      },
    };

    startLoopWithCallbacks(callbacks);
  }

  async function startGuest(roomIdInput) {
    const roomId = normalizeRoomId(roomIdInput);
    if (!roomId) {
      updateMpError("Enter a valid room id to join");
      return;
    }
    state.mpMode = "guest";
    state.inputSeq = 0;
    state.trailSeq = 0;
    state.hasSelectedMultiplayer = true;
    localRuntime.pruneToLocalOnly();
    applyLocalPrefsFromInputs();
    const info = state.pendingPrefs || getPlayerInfo();
    try {
      updateMpStatus("Joining room...");
      await firebaseSession.connectGuest(roomId, info);
      updateMpStatus(`Joined ${displayRoomCode(roomId)}`);
      updateRoomInfo(roomId, "guest");
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
    try {
      await firebaseSession.setReady(false);
    } catch (e) { }
    localRuntime.refreshPlayerUi();
    attachNetworkInputHandlers();
    maybeSendLocalTrailSnapshot();
    updateLobbyRoleUi();
    updateLobbyUi();
    state.showLobbyOnWaiting = true;
    setModeOverlayState("lobby");
    updatePrimaryActionsVisibility();
  }

  function wireMultiplayerUI() {
    const createBtn = document.getElementById("createRoomBtn");
    const joinBtn = document.getElementById("joinRoomBtn");
    const input = document.getElementById("roomIdInput");
    const readyBtn = document.getElementById("mpReadyBtn");
    const startBtn = document.getElementById("mpStartBtn");
    const copyBtn = document.getElementById("mpRoomCopyBtn");

    if (createBtn && joinBtn && input) {
      const ensurePrefs = () => {
        applyLocalPrefsFromInputs();
      };

      createBtn.addEventListener("click", async () => {
        const generated = firebaseSession.generateRoomId();
        const newId = normalizeRoomId(generated) || generated;
        input.value = displayRoomCode(newId);
        ensurePrefs();
        await cleanupRoomClient();
        resetLobbyState();
        await startHost(newId);
        updateLobbyRoleUi();
      });

      joinBtn.addEventListener("click", async () => {
        const roomId = normalizeRoomId(input.value);
        if (!roomId) {
          updateMpError("Enter a room code to join");
          return;
        }
        input.value = displayRoomCode(roomId);
        ensurePrefs();
        await cleanupRoomClient();
        resetLobbyState();
        await startGuest(roomId);
        updateLobbyRoleUi();
      });
    }

    if (readyBtn) {
      readyBtn.addEventListener("click", async () => {
        if (
          !firebaseSession.isConnected() ||
          (state.mpMode !== "guest" && state.mpMode !== "host")
        )
          return;
        if ((state.lobbyMeta?.status || "waiting") === "running") return;
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
      startBtn.addEventListener("click", () => {
        if (!firebaseSession.isConnected() || state.mpMode !== "host") return;
        if ((state.lobbyMeta?.status || "waiting") === "running") return;
        if (!hasEnoughPlayers() || !areGuestsReady()) return;
        beginHostedMatch();
      });
    }

    if (copyBtn) {
      let resetTimer = null;
      copyBtn.addEventListener("click", async () => {
        if (copyBtn.disabled) return;
        const code = copyBtn.dataset.roomCode;
        if (!code) return;
        const ok = await copyTextToClipboard(code);
        copyBtn.textContent = ok ? "Copied!" : "Copy Failed";
        clearTimeout(resetTimer);
        resetTimer = setTimeout(() => {
          copyBtn.textContent = "Copy Code";
        }, 1500);
      });
    }
  }

  function startLocalLoop() {
    startLoopWithCallbacks({
      onWinner: (player) => {
        const result = createResultPayload("win", {
          player: createResultPlayerPayload(player),
        });
        showMatchResult(result);
      },
      onDraw: () => {
        const result = createResultPayload("draw");
        showMatchResult(result);
      },
    });
  }

  function boot() {
    syncContext();
    localRuntime.refreshPlayerUi();
    localRuntime.attachDefaultInputHandlers();
    startLocalLoop();
    if (typeof window !== "undefined") {
      window.addEventListener(
        "local-player-config-start",
        handleLocalConfigStart
      );
    }
    document.addEventListener("DOMContentLoaded", () => {
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
    setStatus: updateMpStatus,
  };
}
