// Distance helpers shared by collision detection.
export function distanceToLineSegment(px, py, x1, y1, x2, y2) {
  return Math.sqrt(distanceToLineSegmentSq(px, py, x1, y1, x2, y2));
}

export function distanceToLineSegmentSq(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    const vx = px - x1;
    const vy = py - y1;
    return vx * vx + vy * vy;
  }

  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;

  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;
  const rx = px - closestX;
  const ry = py - closestY;
  return rx * rx + ry * ry;
}
