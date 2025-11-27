import {
  VIEW_SIZE,
  MAX_CELL_STAMPS,
  TRAIL_WIDTH,
  TRAIL_SAFE_FRAMES,
} from "./constants.js";

// Spatial hash for quick trail collision checks.
export class OccupancyGrid {
  constructor(cellSize = 0.1, ownSafeFrames = TRAIL_SAFE_FRAMES) {
    this.cellSize = cellSize;
    this.ownSafeFrames = ownSafeFrames;
    this.minX = -VIEW_SIZE;
    this.maxX = VIEW_SIZE;
    this.minY = -VIEW_SIZE;
    this.maxY = VIEW_SIZE;
    this._initStorage();
  }

  _initStorage() {
    const width = Math.max(1e-6, this.maxX - this.minX);
    const height = Math.max(1e-6, this.maxY - this.minY);
    this.cols = Math.max(1, Math.ceil(width / this.cellSize));
    this.rows = Math.max(1, Math.ceil(height / this.cellSize));
    this.invCellSize = 1 / this.cellSize;
    const size = this.cols * this.rows;
    const slots = size * MAX_CELL_STAMPS;
    this.stampCount = new Uint8Array(size);
    this.stampX = new Float32Array(slots);
    this.stampY = new Float32Array(slots);
    this.stampRadius = new Float32Array(slots);
    this.stampOwner = new Uint16Array(slots);
    this.stampAge = new Uint32Array(slots);
  }

  clear() {
    this.stampCount.fill(0);
    this.stampX.fill(0);
    this.stampY.fill(0);
    this.stampRadius.fill(0);
    this.stampOwner.fill(0);
    this.stampAge.fill(0);
  }

  updateBounds(minX, maxX, minY, maxY, players, frame = 0) {
    const changed =
      minX !== this.minX ||
      maxX !== this.maxX ||
      minY !== this.minY ||
      maxY !== this.maxY;
    if (!changed) return;
    this.minX = minX;
    this.maxX = maxX;
    this.minY = minY;
    this.maxY = maxY;
    this._initStorage();
    if (players) {
      this.rebuildFromTrails(players, frame);
    }
  }

  rebuildFromTrails(players, frame = 0) {
    this.clear();
    if (!Array.isArray(players)) return;
    for (let i = 0; i < players.length; i++) {
      const player = players[i];
      if (!player || !player.trail || player.trail.length < 1) continue;
      const id = player.id ?? i + 1;
      const trail = player.trail;
      const tempPrev = { x: 0, y: 0 };
      const tempCurr = { x: 0, y: 0 };
      if (trail.length === 1) {
        const only = trail.get(0, tempPrev);
        this._occupyCircle(only.x, only.y, TRAIL_WIDTH, id, frame);
        continue;
      }
      for (let t = 1; t < trail.length; t++) {
        const prev = trail.get(t - 1, tempPrev);
        const curr = trail.get(t, tempCurr);
        if (!prev || !curr) continue;
        this.occupySegment(prev.x, prev.y, curr.x, curr.y, id, frame);
      }
    }
  }

  occupySegment(x1, y1, x2, y2, playerId, frame, radius = TRAIL_WIDTH) {
    if (
      !Number.isFinite(x1) ||
      !Number.isFinite(y1) ||
      !Number.isFinite(x2) ||
      !Number.isFinite(y2)
    )
      return;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy);
    const step = Math.max(this.cellSize * 0.5, 1e-3);
    const steps = Math.max(1, Math.ceil(length / step));
    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps;
      const px = x1 + dx * t;
      const py = y1 + dy * t;
      this._occupyCircle(px, py, radius, playerId, frame);
    }
  }

  _occupyCircle(x, y, radius, playerId, frame) {
    const minCol = Math.floor((x - radius - this.minX) * this.invCellSize);
    const maxCol = Math.floor((x + radius - this.minX) * this.invCellSize);
    const minRow = Math.floor((y - radius - this.minY) * this.invCellSize);
    const maxRow = Math.floor((y + radius - this.minY) * this.invCellSize);
    for (let row = minRow; row <= maxRow; row++) {
      if (row < 0 || row >= this.rows) continue;
      for (let col = minCol; col <= maxCol; col++) {
        if (col < 0 || col >= this.cols) continue;
        if (!this._circleIntersectsCell(x, y, radius, col, row)) continue;
        const idx = row * this.cols + col;
        this._writeStamp(idx, x, y, radius, playerId, frame);
      }
    }
  }

  _writeStamp(idx, x, y, radius, playerId, frame) {
    const count = this.stampCount[idx];
    if (count >= MAX_CELL_STAMPS) return;
    const slot = idx * MAX_CELL_STAMPS + count;
    this.stampX[slot] = x;
    this.stampY[slot] = y;
    this.stampRadius[slot] = radius;
    this.stampOwner[slot] = playerId;
    this.stampAge[slot] = frame;
    this.stampCount[idx] = count + 1;
  }

  _circleIntersectsCell(x, y, radius, col, row) {
    const cellMinX = this.minX + col * this.cellSize;
    const cellMinY = this.minY + row * this.cellSize;
    const cellMaxX = cellMinX + this.cellSize;
    const cellMaxY = cellMinY + this.cellSize;
    const nearestX = Math.max(cellMinX, Math.min(x, cellMaxX));
    const nearestY = Math.max(cellMinY, Math.min(y, cellMaxY));
    const dx = x - nearestX;
    const dy = y - nearestY;
    return dx * dx + dy * dy <= radius * radius;
  }

  checkCollision(x, y, radius, playerId, frame) {
    const col = Math.floor((x - this.minX) * this.invCellSize);
    const row = Math.floor((y - this.minY) * this.invCellSize);
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return true;
    const idx = row * this.cols + col;
    const count = this.stampCount[idx];
    if (!count) return false;
    const start = idx * MAX_CELL_STAMPS;
    radius += TRAIL_WIDTH;
    const radiusSq = radius * radius;
    for (let i = 0; i < count; i++) {
      const slot = start + i;
      const owner = this.stampOwner[slot];
      const stampRadius = this.stampRadius[slot];
      if (
        owner === playerId &&
        frame - this.stampAge[slot] <= this.ownSafeFrames
      )
        continue;
      const dx = x - this.stampX[slot];
      const dy = y - this.stampY[slot];
      const distSq = dx * dx + dy * dy;
      const rad = stampRadius + radius;
      if (distSq <= rad * rad || distSq <= radiusSq) return true;
    }
    return false;
  }
}
