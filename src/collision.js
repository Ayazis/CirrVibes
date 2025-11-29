import {
  TRAIL_COLLISION_RADIUS,
  TRAIL_SAFE_FRAMES,
  TRAIL_WIDTH,
} from "./constants.js";
import { distanceToLineSegmentSq } from "./math.js";

// Check if a position collides with any trail in state;
// prefers occupancy grid if present.
export function checkTrailCollision(x, y, currentPlayer, state) {
  if (!state) return false;
  const grid = state.occupancyGrid;
  if (grid) {
    const hit = grid.checkCollision(
      x,
      y,
      TRAIL_COLLISION_RADIUS,
      currentPlayer.id,
      state.frameCounter
    );
    if (hit) return true;
  }

  const playersArr = state.players || [];
  for (let i = 0; i < playersArr.length; i++) {
    const player = playersArr[i];
    if (!player || !player.trail) continue;
    if (
      checkTrailSegmentCollision(
        x,
        y,
        player.trail,
        TRAIL_COLLISION_RADIUS,
        player === currentPlayer,
        TRAIL_SAFE_FRAMES
      )
    ) {
      return true;
    }
  }
  return false;
}

// Check collision with a specific trail
export function checkTrailSegmentCollision(
  x,
  y,
  trail,
  radius,
  isOwnTrail,
  skipPoints
) {
  if (!trail || trail.length < 2) return false;
  const skip = isOwnTrail ? Math.max(0, skipPoints) : 0;
  const maxIndex = trail.length - 1 - skip;
  if (maxIndex <= 0) return false;
  const radiusSq = radius * radius;
  const temp1 = { x: 0, y: 0 };
  const temp2 = { x: 0, y: 0 };
  for (let i = 0; i < maxIndex; i++) {
    const p1 = trail.get(i, temp1);
    const p2 = trail.get(i + 1, temp2);
    const distSq = distanceToLineSegmentSq(x, y, p1.x, p1.y, p2.x, p2.y);
    if (distSq < radiusSq) return true;
  }
  return false;
}
