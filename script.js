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

// Attach input handlers for current state (local play)
let detachInput = attachInputHandlers(window.gameState);

// Expose reset helpers
window.resetGame = () => resetGame(window.gameState);
window.forceReset = () => forceReset(window.gameState);

// Multiplayer POC globals/state
let mpMode = null; // 'host' | 'guest' | null
let roomClient = null;
let inputSeq = 0;
let loopStarted = false;
let loopController = null;

function startLoopWithCallbacks(callbacks) {
  if (loopStarted) return;
  loopStarted = true;
  loopController = startFixedStepLoop(window.gameState, callbacks);
}

function updateMpStatus(text) {
  const el = document.getElementById('mpStatus');
  if (el) el.textContent = text;
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

async function startHost(roomId) {
  mpMode = 'host';
  roomClient = new RoomClient({ roomId, playerInfo: getPlayerInfo(), isHost: true });
  try {
    updateMpStatus('Connecting as host...');
    await roomClient.joinRoom();
    updateMpStatus(`Hosting ${roomId}`);
  } catch (e) {
    updateMpError(`Host join failed: ${e?.message || e}`);
    return;
  }
  if (window.gameState?.players?.[0]) {
    window.gameState.players[0].clientId = roomClient.playerId;
  }

  roomClient.listenPlayers((players) => {
    const others = Object.values(players || {}).filter((p) => p.id !== roomClient.playerId);
    const second = others[0];
    if (second && window.gameState?.players?.[1]) {
      window.gameState.players[1].clientId = second.id || second.playerId || second.name;
    }
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
  roomClient = new RoomClient({ roomId, playerInfo: getPlayerInfo(), isHost: false });
  try {
    updateMpStatus('Joining room...');
    await roomClient.joinRoom();
    updateMpStatus(`Joined ${roomId}`);
  } catch (e) {
    updateMpError(`Join failed: ${e?.message || e}`);
    return;
  }
  if (window.gameState?.players?.[1]) {
    window.gameState.players[1].clientId = roomClient.playerId;
  }
  if (window.gameState) window.gameState.paused = true;

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

  createBtn.addEventListener('click', async () => {
    const newId = createRoomId();
    input.value = newId;
    await startHost(newId);
  });

  joinBtn.addEventListener('click', async () => {
    const roomId = input.value.trim();
    if (!roomId) return;
    await startGuest(roomId);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  wireMultiplayerUI();
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
