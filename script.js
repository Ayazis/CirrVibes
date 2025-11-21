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
import { attachInputHandlers } from './src/input.js';
import { createInitialGameState } from './src/gameState.js';

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

window.gameState = createInitialGameState();

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

// Attach input handlers for current state
const detachInput = attachInputHandlers(window.gameState);

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
