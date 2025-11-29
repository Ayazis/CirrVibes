import { FIXED_TIMESTEP_MS, TRAIL_WIDTH } from "./constants.js";
import {
  computeViewBounds,
  generateRandomStartingPosition,
} from "./viewUtils.js";
import { checkTrailCollision } from "./collision.js";
import { Trail } from "./trail.js";

const DEFAULT_PUBLISH_INTERVAL_MS = 80;

function updatePlayer(player, deltaSeconds, state) {
  if (!player || player.active === false || !player.isAlive) return;
  const hasAuthority = player?.clientId == state?.localClientId;

  const turnAmount = player.turnSpeed * deltaSeconds;
  if (player.isTurningLeft) {
    player.snakeDirection = player.snakeDirection + turnAmount;
  }
  if (player.isTurningRight) {
    player.snakeDirection = player.snakeDirection - turnAmount;
  }

  player.snakeDirection = ((player.snakeDirection % 360) + 360) % 360;

  const directionRad = (player.snakeDirection * Math.PI) / 180;
  const distance = player.snakeSpeed * deltaSeconds;
  const deltaX = Math.cos(directionRad) * distance;
  const deltaY = Math.sin(directionRad) * distance;
  const newX = player.snakePosition.x + deltaX;
  const newY = player.snakePosition.y + deltaY;

  const bounds = computeViewBounds();
  if (
    newX < bounds.minX ||
    newX > bounds.maxX ||
    newY < bounds.minY ||
    newY > bounds.maxY
  ) {
    if (hasAuthority) {
      // local player hit the wall
      player.isAlive = false;
      awardPointsForDeath(player, state);
    }
  }

  if (hasAuthority && checkTrailCollision(newX, newY, player, state)) {
    // local player hit a trail
    player.isAlive = false;
    awardPointsForDeath(player, state);
  }

  const grid = state?.occupancyGrid;
  const tailScratch =
    player._trailScratch ||
    (player._trailScratch = {
      x: player.snakePosition.x,
      y: player.snakePosition.y,
    });
  const lastPoint = player.trail.peekLast(tailScratch) || tailScratch;

  player.snakePosition.x = newX;
  player.snakePosition.y = newY;
  player.trail.push(newX, newY);

  if (grid) {
    grid.occupySegment(
      lastPoint.x,
      lastPoint.y,
      newX,
      newY,
      player.id,
      state.frameCounter,
      TRAIL_WIDTH
    );
  }
}

function awardPointsForDeath(deadPlayer, state) {
  try {
    if (!deadPlayer || !deadPlayer.id) return;
    if (!state || !Array.isArray(state.players)) return;
    if (deadPlayer._deathProcessed) return;
    deadPlayer._deathProcessed = true;
    state.players.forEach((p) => {
      if (!p) return;
      if (p.id !== deadPlayer.id && p.isAlive) {
        p.score = (Number(p.score) || 0) + 1;
      }
    });
    try {
      if (typeof window.updateControlsInfoUI === "function")
        window.updateControlsInfoUI(state.players);
    } catch (e) {}
  } catch (e) {
    // silent
  }
}

export function updateSnake(deltaSeconds, state, { onWinner, onDraw } = {}) {
  if (!state || !state.players) return;
  if (state.paused) return;

  state.frameCounter += 1;
  const playersArr = state.players;
  for (let i = 0; i < playersArr.length; i++) {
    updatePlayer(playersArr[i], deltaSeconds, state);
  }

  const alive = playersArr.filter((p) => p && p.isAlive);
  if (state.waitingForSpawnConfirm) {
    return;
  }
  if (alive.length === 1 && !state.winnerShown) {
    state.winnerShown = true;
    state.paused = true;
    if (onWinner) onWinner(alive[0]);
  } else if (alive.length === 0 && !state.gameOverLogged) {
    state.gameOverLogged = true;
    state.paused = true;
    if (onDraw) onDraw();
  }
}

export function resetGame(state) {
  if (!state || !state.players) return false;
  if (!state.players.every((p) => !p.isAlive || p.active === false)) {
    return false;
  }
  const newStarts = state.players.map(() => generateRandomStartingPosition());
  state.gameOverLogged = false;

  state.players.forEach((player, idx) => {
    if (player && player.active === false) return;
    const start = newStarts[idx];
    player.snakePosition = { x: start.x, y: start.y };
    player.snakeDirection = start.direction;
    player.isAlive = true;
    player.trail = new Trail(1024, start.x, start.y);
    player.isTurningLeft = false;
    player.isTurningRight = false;
    player._deathProcessed = false;
    player._lastTrailBroadcast = null;
    player._lastTrailSyncSeq = null;
  });

  state.player1 = state.players[0];
  state.player2 = state.players[1];
  state.frameCounter = 0;
  if (state.occupancyGrid) {
    state.occupancyGrid.rebuildFromTrails(state.players, state.frameCounter);
  }
  state.waitingForSpawnConfirm = false;

  return true;
}

export function forceReset(state) {
  if (!state || !state.players) return false;

  const newStarts = state.players.map(() => generateRandomStartingPosition());
  state.gameOverLogged = false;
  state.winnerShown = false;
  state.paused = false;

  state.players.forEach((player, idx) => {
    if (player && player.active === false) return;
    const start = newStarts[idx];
    player.snakePosition = { x: start.x, y: start.y };
    player.snakeDirection = start.direction;
    player.isAlive = true;
    player.trail = new Trail(1024, start.x, start.y);
    player.isTurningLeft = false;
    player.isTurningRight = false;
    player._deathProcessed = false;
    player._lastTrailBroadcast = null;
    player._lastTrailSyncSeq = null;
  });

  state.player1 = state.players[0];
  state.player2 = state.players[1];
  state.frameCounter = 0;
  if (state.occupancyGrid) {
    state.occupancyGrid.rebuildFromTrails(state.players, state.frameCounter);
  }
  state.waitingForSpawnConfirm = false;

  return true;
}

export function startFixedStepLoop(state, callbacks = {}) {
  let lastTime = null;
  let accumulator = 0;
  const stepMs = FIXED_TIMESTEP_MS;
  const stepSeconds = stepMs / 1000;

  let callbackBag = callbacks || {};
  let publish = callbackBag.publishState;
  let afterStep = callbackBag.afterStep;
  let publishIntervalMs =
    typeof callbackBag.publishIntervalMs === "number"
      ? Math.max(0, callbackBag.publishIntervalMs)
      : DEFAULT_PUBLISH_INTERVAL_MS;

  let lastPublish = 0;

  function setCallbacks(next) {
    callbackBag = next || {};
    publish = callbackBag.publishState;
    afterStep = callbackBag.afterStep;
    publishIntervalMs =
      typeof callbackBag.publishIntervalMs === "number"
        ? Math.max(0, callbackBag.publishIntervalMs)
        : DEFAULT_PUBLISH_INTERVAL_MS;
  }

  function frame(now) {
    if (lastTime == null) lastTime = now;
    let delta = now - lastTime;
    lastTime = now;
    if (delta > 250) delta = stepMs;
    accumulator += delta;
    while (accumulator >= stepMs) {
      updateSnake(stepSeconds, state, callbackBag);
      if (typeof afterStep === "function") {
        try {
          afterStep(state);
        } catch (err) {
          console.warn("afterStep callback failed", err);
        }
      }
      accumulator -= stepMs;
    }

    if (publish && now - lastPublish >= publishIntervalMs) {
      lastPublish = now;
      try {
        publish(state);
      } catch (e) {
        // ignore publish errors in loop
      }
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return { setCallbacks };
}
