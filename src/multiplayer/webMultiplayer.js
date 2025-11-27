import {
  openPlayerConfigMenu,
  showDrawOverlay,
  showWinnerOverlay,
} from "../ui/overlays.js";
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

const MIN_MULTIPLAYER_PLAYERS = 2;
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
  };

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
    localRuntime.setContext({
      mpMode: state.mpMode || "local",
      hasRoom: firebaseSession.isConnected(),
      roomPlayerId: firebaseSession.getPlayerId(),
    });
  }

  function startLoopWithCallbacks(callbacks) {
    if (state.loopStarted) return;
    state.loopStarted = true;
    state.loopController = startFixedStepLoop(gameState, callbacks);
  }

  function updateMpStatus(text) {
    const el = document.getElementById("mpStatus");
    if (el) el.textContent = text;
  }

  function updateRoomInfo(roomId, role) {
    const el = document.getElementById("mpRoomInfo");
    const display = document.getElementById("roomDisplay");
    const text = roomId
      ? `Room: ${roomId}${role ? ` (${role})` : ""}`
      : "Room: --";
    if (el) el.textContent = text;
    if (display) display.textContent = text;
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
    const mpConfig = document.getElementById("mpConfig");
    if (!overlay) return;
    if (mode === "hidden") {
      overlay.style.display = "none";
      return;
    }
    overlay.style.display = "flex";
    if (selectBlock)
      selectBlock.style.display = mode === "select" ? "block" : "none";
    if (mpConfig) mpConfig.style.display = mode === "lobby" ? "block" : "none";
  }

  function renderLobbyPlayers(players) {
    const listEl = document.getElementById("mpPlayerList");
    if (!listEl) return;
    const hostId = state.lobbyMeta?.hostId || null;
    const localId = firebaseSession.getPlayerId();
    const entries = Object.values(players || {}).sort(
      (a, b) => (a?.joinedAt || 0) - (b?.joinedAt || 0),
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
        const label = isHost ? "Host" : ready ? "Ready" : "Not ready";
        return `<div class="mp-player"><div class="player-info"><span class="swatch" style="background:${color};"></span><span>${name}</span></div><span class="ready badge ${badgeClass}">${label}</span></div>`;
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
    const guestsReady = guestTotal > 0 && guestReady === guestTotal;
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
    return guestTotal > 0 && guestReady === guestTotal;
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
    if (!hasEnoughPlayers() || !areGuestsReady()) return;
    if (!gameState) return;
    updateMpStatus("Starting match...");
    forceResetState(gameState);
    gameState.paused = false;
    const startTs = Date.now();
    state.lobbyMeta = {
      ...(state.lobbyMeta || {}),
      status: "running",
      startedAt: startTs,
    };
    updateLobbyUi();
    setModeOverlayState("hidden");
    clearResultState();
    try {
      state.showLobbyOnWaiting = false;
      await broadcastSpawnSnapshot();
    } catch (e) {
      console.warn("Spawn snapshot failed", e);
    }
    try {
      await firebaseSession.updateMeta({
        status: "running",
        startedAt: startTs,
        lastResult: null,
      });
    } catch (e) {
      updateMpError(`Failed to start match: ${e?.message || e}`);
    }
  }

  function handlePlayersUpdate(players) {
    state.lobbyPlayers = players || {};
    renderLobbyPlayers(state.lobbyPlayers);
    const localId = firebaseSession.getPlayerId();
    if (localId) {
      const localEntry =
        state.lobbyPlayers[localId] ||
        Object.values(state.lobbyPlayers || {}).find(
          (player) => player?.id === localId,
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
    const snapshot = state.lobbyMeta.spawnSnapshot;
    if (snapshot?.key && snapshot.key !== state.lastAppliedSpawnKey) {
      localRuntime.applySpawnSnapshot(snapshot);
      state.lastAppliedSpawnKey = snapshot.key;
    }
    const result = state.lobbyMeta.lastResult;
    if (result?.key && result.key !== state.lastResultShownKey) {
      showMatchResult(result);
    }
    if ((state.mpMode === "host" || state.mpMode === "guest") && gameState) {
      gameState.paused = status !== "running";
    }
    if (!state.hasSelectedMultiplayer) return;
    if (status === "running") {
      state.showLobbyOnWaiting = false;
      clearResultState();
      setModeOverlayState("hidden");
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
      (p) => p && p.clientId === localId,
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
        state.showLobbyOnWaiting = true;
        setModeOverlayState("lobby");
        updateLobbyRoleUi();
        updateMpStatus("Multiplayer selected - create or join a room");
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
      state.lastAppliedSpawnKey = key;
      logPlayerPositions("host-broadcast");
    } catch (e) {
      console.warn("broadcastSpawnSnapshot failed", e);
    }
    return key;
  }

  async function startHost(roomId) {
    state.mpMode = "host";
    state.inputSeq = 0;
    state.hasSelectedMultiplayer = true;
    localRuntime.pruneToLocalOnly();
    applyLocalPrefsFromInputs();
    const info = state.pendingPrefs || getPlayerInfo();
    try {
      updateMpStatus("Connecting as host...");
      await firebaseSession.connectHost(roomId, info);
      updateMpStatus(`Hosting ${roomId}`);
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
    } catch (e) {}
    localRuntime.refreshPlayerUi();
    attachNetworkInputHandlers();
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
    if (state.loopController) state.loopController.setCallbacks(callbacks);
  }

  async function startGuest(roomId) {
    state.mpMode = "guest";
    state.inputSeq = 0;
    state.hasSelectedMultiplayer = true;
    localRuntime.pruneToLocalOnly();
    applyLocalPrefsFromInputs();
    const info = state.pendingPrefs || getPlayerInfo();
    try {
      updateMpStatus("Joining room...");
      await firebaseSession.connectGuest(roomId, info);
      updateMpStatus(`Joined ${roomId}`);
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
    } catch (e) {}
    localRuntime.refreshPlayerUi();
    attachNetworkInputHandlers();
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
    if (!createBtn || !joinBtn || !input) return;
    const ensurePrefs = () => {
      applyLocalPrefsFromInputs();
    };

    createBtn.addEventListener("click", async () => {
      const newId = firebaseSession.generateRoomId();
      input.value = newId;
      ensurePrefs();
      await cleanupRoomClient();
      resetLobbyState();
      await startHost(newId);
      updateLobbyRoleUi();
    });

    joinBtn.addEventListener("click", async () => {
      const roomId = input.value.trim();
      if (!roomId) return;
      ensurePrefs();
      await cleanupRoomClient();
      resetLobbyState();
      await startGuest(roomId);
      updateLobbyRoleUi();
    });

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
