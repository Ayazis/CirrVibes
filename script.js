import { initGame } from './src/initGame.js';
import {
  VIEW_SIZE,
  DEFAULT_ASPECT,
  TRAIL_WIDTH,
  TRAIL_COLLISION_RADIUS,
  TRAIL_SAFE_FRAMES,
  FIXED_TIMESTEP_MS
} from './src/constants.js';
import { Trail } from './src/trail.js';
import { OccupancyGrid } from './src/occupancyGrid.js';
import { getCanvasAspect, computeViewBounds, generateRandomStartingPosition } from './src/viewUtils.js';
import { loadPlayerConfig, loadFirstStartDone } from './src/persistence.js';
import { checkTrailCollision } from './src/collision.js';
import { openPlayerConfigMenu, showWinnerOverlay, showDrawOverlay } from './src/ui/overlays.js';
import { updateControlsInfoUI } from './src/ui/controlsInfo.js';

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
});

initGame();

// Generate random starting positions for both players
const player1Start = generateRandomStartingPosition();
const player2Start = generateRandomStartingPosition();

/*
  Build runtime game state from saved first-start playerConfig.
  Falls back to two-player default to keep existing gameplay unchanged.
*/
function hexToRgbArray(hex) {
  if (!hex) return [1.0, 1.0, 1.0, 1.0];
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return [r, g, b, 1.0];
}

const savedConfig = loadPlayerConfig();

const defaultConfig = [
  { name: 'Player 1', color: '#ff6666', controls: 'ArrowLeft / ArrowRight' },
  { name: 'Player 2', color: '#6666ff', controls: 'Mouse Left / Mouse Right' }
];

const effectiveConfig = (Array.isArray(savedConfig) && savedConfig.length >= 2) ? savedConfig : defaultConfig;

// Build players array; use existing player1Start/player2Start for the first two so behavior remains stable
const players = effectiveConfig.map((cfg, idx) => {
  const start = (idx === 0) ? player1Start : (idx === 1) ? player2Start : generateRandomStartingPosition();
  return {
    id: idx + 1,
    name: cfg.name || `Player ${idx + 1}`,
    snakePosition: { x: start.x, y: start.y },
    snakeDirection: start.direction,
    snakeSpeed: 1.2,
    turnSpeed: 180,
    isAlive: true,
    trail: new Trail(1024, start.x, start.y),
    isTurningLeft: false,
    isTurningRight: false,
    color: hexToRgbArray(cfg.color),
    controls: cfg.controls || (idx === 1 ? 'Mouse Left / Mouse Right' : 'ArrowLeft / ArrowRight'),
    score: 0,
    _deathProcessed: false
  };
});

window.gameState = {
  gameOverLogged: false,
  players,
  viewSize: VIEW_SIZE,
  viewBounds: computeViewBounds(),
  frameCounter: 0,
  paused: Boolean(window.playerConfigMenuOpen)
};

// Backwards-compatible aliases used by existing code
window.gameState.player1 = window.gameState.players[0];
window.gameState.player2 = window.gameState.players[1];

const occupancyGrid = new OccupancyGrid(0.12, TRAIL_SAFE_FRAMES);
window.gameState.occupancyGrid = occupancyGrid;
occupancyGrid.updateBounds(
  window.gameState.viewBounds.minX,
  window.gameState.viewBounds.maxX,
  window.gameState.viewBounds.minY,
  window.gameState.viewBounds.maxY,
  window.gameState.players,
  window.gameState.frameCounter
);

function awardPointsForDeath(deadPlayer) {
  try {
    if (!deadPlayer || !deadPlayer.id) return;
    const state = window.gameState;
    if (!state || !Array.isArray(state.players)) return;
    if (deadPlayer._deathProcessed) return;
    deadPlayer._deathProcessed = true;
    state.players.forEach((p) => {
      if (!p) return;
      if (p.id !== deadPlayer.id && p.isAlive) {
        p.score = (Number(p.score) || 0) + 1;
      }
    });
    try { if (typeof window.updateControlsInfoUI === 'function') window.updateControlsInfoUI(state.players); } catch (e) {}
  } catch (e) {
    // silent
  }
}
updateControlsInfoUI(window.gameState.players);
window.updateControlsInfoUI = updateControlsInfoUI;

/*
  Input mapping across configured players.
  controlsMap maps key/code strings (lowercased) to { playerIndex, side }.
  mousePlayerIndex is set if a player's control scheme uses the mouse.
*/
const controlsMap = new Map();
let mousePlayerIndex = null;

function buildInputMappings() {
  controlsMap.clear();
  mousePlayerIndex = null;
  const playersArr = window.gameState.players || [];
  playersArr.forEach((p, idx) => {
    const cfg = (p.controls || '').toLowerCase();
    if (cfg.includes('arrow')) {
      controlsMap.set('arrowleft', { playerIndex: idx, side: 'left' });
      controlsMap.set('arrowright', { playerIndex: idx, side: 'right' });
      // Some browsers may expose arrow keys via event.code too
      controlsMap.set('arrowleft', { playerIndex: idx, side: 'left' });
      controlsMap.set('arrowright', { playerIndex: idx, side: 'right' });
    } else if (cfg.includes('mouse')) {
      mousePlayerIndex = idx;
    } else if (cfg.includes('a / d') || (cfg.includes('a') && cfg.includes('d'))) {
      controlsMap.set('a', { playerIndex: idx, side: 'left' });
      controlsMap.set('d', { playerIndex: idx, side: 'right' });
      controlsMap.set('A', { playerIndex: idx, side: 'left' });
      controlsMap.set('D', { playerIndex: idx, side: 'right' });
    } else if (cfg.includes('num4') || cfg.includes('num6') || cfg.includes('numpad')) {
      controlsMap.set('numpad4', { playerIndex: idx, side: 'left' });
      controlsMap.set('numpad6', { playerIndex: idx, side: 'right' });
      controlsMap.set('4', { playerIndex: idx, side: 'left' });
      controlsMap.set('6', { playerIndex: idx, side: 'right' });
    } else if (cfg.includes('j / l') || (cfg.includes('j') && cfg.includes('l'))) {
      controlsMap.set('j', { playerIndex: idx, side: 'left' });
      controlsMap.set('l', { playerIndex: idx, side: 'right' });
      controlsMap.set('J', { playerIndex: idx, side: 'left' });
      controlsMap.set('L', { playerIndex: idx, side: 'right' });
    }
  });
}

// Build initial mappings
buildInputMappings();

// Mouse state (generic)
let mouseState = {
  isPressed: false,
  leftButton: false,
  rightButton: false
};

// Keyboard handling for all mapped players
document.addEventListener('keydown', (event) => {
  // NOTE: reset via 'R' removed — game now pauses and exposes restart button in overlays

  const keyId = (event.key || '').toLowerCase();
  const codeId = (event.code || '').toLowerCase();
  const mapped = controlsMap.get(keyId) || controlsMap.get(codeId);
  if (mapped) {
    // Prevent default browser actions (caret move, scrolling) when using mapped controls
    try { event.preventDefault(); } catch (e) {}
    const player = window.gameState.players[mapped.playerIndex];
    if (!player || !player.isAlive) return;
    if (mapped.side === 'left') player.isTurningLeft = true;
    else player.isTurningRight = true;
  }
});

// Keyup handling
document.addEventListener('keyup', (event) => {
  const keyId = (event.key || '').toLowerCase();
  const codeId = (event.code || '').toLowerCase();
  const mapped = controlsMap.get(keyId) || controlsMap.get(codeId);
  if (mapped) {
    try { event.preventDefault(); } catch (e) {}
    const player = window.gameState.players[mapped.playerIndex];
    if (!player) return;
    if (mapped.side === 'left') player.isTurningLeft = false;
    else player.isTurningRight = false;
  }
});

// Mouse handling for the mouse-controlled player (if any)
document.addEventListener('mousedown', (event) => {
  if (mousePlayerIndex === null) return;
  const player = window.gameState.players[mousePlayerIndex];
  if (!player || !player.isAlive) return;

  mouseState.isPressed = true;

  if (event.button === 0) { // Left mouse button
    mouseState.leftButton = true;
    player.isTurningLeft = true;
  } else if (event.button === 2) { // Right mouse button
    mouseState.rightButton = true;
    player.isTurningRight = true;
  }

  event.preventDefault();
});

document.addEventListener('mouseup', (event) => {
  if (mousePlayerIndex === null) return;
  const player = window.gameState.players[mousePlayerIndex];
  if (!player) return;

  if (event.button === 0) {
    mouseState.leftButton = false;
    player.isTurningLeft = false;
  } else if (event.button === 2) {
    mouseState.rightButton = false;
    player.isTurningRight = false;
  }

  if (!mouseState.leftButton && !mouseState.rightButton) mouseState.isPressed = false;
});

// Prevent context menu on right click
document.addEventListener('contextmenu', (event) => {
  event.preventDefault();
});

// Game loop for continuous movement and turning
function updateSnake(deltaSeconds) {
  const state = window.gameState;
  if (!state || !state.players) return;
  if (state.paused) return;

  state.frameCounter += 1;
  const playersArr = state.players;
  for (let i = 0; i < playersArr.length; i++) {
    updatePlayer(playersArr[i], deltaSeconds);
  }

  // Check for end conditions: single winner or all dead (draw)
  const alive = playersArr.filter(p => p && p.isAlive);
  if (alive.length === 1 && !state.winnerShown) {
    state.winnerShown = true;
    state.paused = true;
    showWinnerOverlay(alive[0], forceReset);
  } else if (alive.length === 0 && !state.gameOverLogged) {
    state.gameOverLogged = true;
    state.paused = true;
    showDrawOverlay(forceReset);
  }
}


// Reset game function (can be called manually or automatically)
function resetGame() {
  const state = window.gameState;

  if (!state.players.every((p) => !p.isAlive)) {
    return false;
  }

  const newStarts = state.players.map(() => generateRandomStartingPosition());
  state.gameOverLogged = false;

  state.players.forEach((player, idx) => {
    const start = newStarts[idx];
    player.snakePosition = { x: start.x, y: start.y };
    player.snakeDirection = start.direction;
    player.isAlive = true;
    player.trail = new Trail(1024, start.x, start.y);
    player.isTurningLeft = false;
    player.isTurningRight = false;
    player._deathProcessed = false;
  });

  state.player1 = state.players[0];
  state.player2 = state.players[1];
  state.frameCounter = 0;
  if (state.occupancyGrid) {
    state.occupancyGrid.rebuildFromTrails(state.players, state.frameCounter);
  }

  return true;
}

// Expose reset function globally for manual reset
window.resetGame = resetGame;

// Force reset (used by overlays) - resets players regardless of current alive state
function forceReset() {
  const state = window.gameState;
  if (!state || !state.players) return false;

  const newStarts = state.players.map(() => generateRandomStartingPosition());
  state.gameOverLogged = false;
  state.winnerShown = false;
  state.paused = false;

  state.players.forEach((player, idx) => {
    const start = newStarts[idx];
    player.snakePosition = { x: start.x, y: start.y };
    player.snakeDirection = start.direction;
    player.isAlive = true;
    player.trail = new Trail(1024, start.x, start.y);
    player.isTurningLeft = false;
    player.isTurningRight = false;
    player._deathProcessed = false;
  });

  state.player1 = state.players[0];
  state.player2 = state.players[1];
  state.frameCounter = 0;
  if (state.occupancyGrid) {
    state.occupancyGrid.rebuildFromTrails(state.players, state.frameCounter);
  }

  return true;
}

window.forceReset = forceReset;

function updatePlayer(player, deltaSeconds) {
  if (!player || !player.isAlive) return;

  const turnAmount = player.turnSpeed * deltaSeconds;
  if (player.isTurningLeft) {
    player.snakeDirection = (player.snakeDirection + turnAmount);
  }
  if (player.isTurningRight) {
    player.snakeDirection = (player.snakeDirection - turnAmount);
  }

  player.snakeDirection = ((player.snakeDirection % 360) + 360) % 360;

  const directionRad = (player.snakeDirection * Math.PI) / 180;
  const distance = player.snakeSpeed * deltaSeconds;
  const deltaX = Math.cos(directionRad) * distance;
  const deltaY = Math.sin(directionRad) * distance;
  const newX = player.snakePosition.x + deltaX;
  const newY = player.snakePosition.y + deltaY;

  const bounds = computeViewBounds();
  if (newX < bounds.minX || newX > bounds.maxX || newY < bounds.minY || newY > bounds.maxY) {
    player.isAlive = false;
    awardPointsForDeath(player);
    return;
  }

  if (checkTrailCollision(newX, newY, player, window.gameState)) {
    player.isAlive = false;
    awardPointsForDeath(player);
    return;
  }

  const state = window.gameState;
  const grid = state?.occupancyGrid;
  const tailScratch = player._trailScratch || (player._trailScratch = { x: player.snakePosition.x, y: player.snakePosition.y });
  const lastPoint = player.trail.peekLast(tailScratch) || tailScratch;

  player.snakePosition.x = newX;
  player.snakePosition.y = newY;
  player.trail.push(newX, newY);

  if (grid) {
    grid.occupySegment(lastPoint.x, lastPoint.y, newX, newY, player.id, window.gameState.frameCounter, TRAIL_WIDTH);
  }
}

// Start the fixed-timestep game loop
(function startFixedStepLoop() {
  let lastTime = null;
  let accumulator = 0;
  const stepMs = FIXED_TIMESTEP_MS;
  const stepSeconds = stepMs / 1000;
  function frame(now) {
    if (lastTime == null) lastTime = now;
    let delta = now - lastTime;
    lastTime = now;
    if (delta > 250) delta = stepMs;
    accumulator += delta;
    while (accumulator >= stepMs) {
      updateSnake(stepSeconds);
      accumulator -= stepMs;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
