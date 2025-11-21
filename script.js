import { initGame } from './src/initGame.js';

// First-start menu (only shown once). Injects a simple overlay that lets the user add extra players,
// shows each player's color and their control scheme, and saves the choice to localStorage.
// This menu does not change the existing gameplay code — it only collects and persists preferences.
// Create (or re-open) the player configuration overlay. This function is safe to call multiple times.
function openPlayerConfigMenu() {
  try {
    if (window.gameState) {
      window.gameState.paused = true;
    }
    // If an overlay already exists, bring it to front
    const existing = document.getElementById('firstStartMenuOverlay');
    if (existing) {
      existing.style.display = 'flex';
      return;
    }

    // Preset player templates (existing two players preserved)
    const presets = [
      { name: 'Player 1', color: '#ff6666', controls: 'ArrowLeft / ArrowRight' },
      { name: 'Player 2', color: '#6666ff', controls: 'Mouse Left / Mouse Right' },
      { name: 'Player 3', color: '#66ff66', controls: 'A / D' },
      { name: 'Player 4', color: '#ffd166', controls: 'Num4 / Num6' }
    ];

    // Start with saved configuration if available, or default to first two
    const saved = (() => {
      try { return JSON.parse(localStorage.getItem('playerConfig') || 'null'); } catch (e) { return null; }
    })();
    const players = Array.isArray(saved) && saved.length >= 2 ? saved.map(s => Object.assign({}, s)) : [Object.assign({}, presets[0]), Object.assign({}, presets[1])];

    // Inject minimal CSS for the overlay if not present
    if (!document.getElementById('firstStartMenuStyles')) {
      const style = document.createElement('style');
      style.id = 'firstStartMenuStyles';
      style.textContent = `
      #firstStartMenuOverlay { position: fixed; inset: 0; background: rgba(0,0,0,0.75); display: flex; align-items: center; justify-content: center; z-index: 9999; color: #fff; font-family: Arial, sans-serif; }
      #firstStartMenu { background: #111; border: 2px solid #fff; padding: 20px; border-radius: 8px; width: 420px; max-width: calc(100% - 40px); }
      #firstStartMenu h2 { margin: 0 0 12px 0; }
      .player-row { display:flex; align-items:center; justify-content:space-between; gap:8px; margin:8px 0; padding:8px; background: rgba(255,255,255,0.03); border-radius:6px; }
      .player-left { display:flex; align-items:center; gap:10px; }
      .color-swatch { width:28px; height:18px; border-radius:4px; border:1px solid #000; box-shadow:0 0 0 1px rgba(255,255,255,0.03) inset; }
      .controls-select { padding:6px; background:#222; color:#fff; border:1px solid #333; border-radius:4px; }
      .menu-actions { display:flex; gap:10px; justify-content:flex-end; margin-top:12px; }
      button { padding:8px 12px; border-radius:6px; border:1px solid #444; background:#222; color:#fff; cursor:pointer; }
      button.primary { background: #0b7; border-color: #087; color:#002; font-weight:700; }
      button.ghost { background:transparent; border-color:#555; }
      .add-btn { margin-left:4px; }
      .remove-btn { background:transparent; border: none; color:#f66; cursor:pointer; font-weight:600; }
      .muted { color: #aaa; font-size:13px; margin-top:8px; }
      `;
      document.head.appendChild(style);
    }

    const overlay = document.createElement('div');
    overlay.id = 'firstStartMenuOverlay';

    const menu = document.createElement('div');
    menu.id = 'firstStartMenu';

    const title = document.createElement('h2');
    title.textContent = 'Configure Players';

    const description = document.createElement('div');
    description.className = 'muted';
    description.textContent = 'Add or edit players and controls. Changes are persisted to localStorage and applied after reloading.';

    const list = document.createElement('div');
    list.id = 'playerList';

    function renderPlayers() {
      list.innerHTML = '';
      players.forEach((p, idx) => {
        const row = document.createElement('div');
        row.className = 'player-row';
        const left = document.createElement('div');
        left.className = 'player-left';
        const sw = document.createElement('div');
        sw.className = 'color-swatch';
        sw.style.background = p.color;
        const label = document.createElement('div');
        label.textContent = `${p.name}`;
        left.appendChild(sw);
        left.appendChild(label);

        const controlsSelect = document.createElement('select');
        controlsSelect.className = 'controls-select';
        const options = [ p.controls, 'ArrowLeft / ArrowRight', 'Mouse Left / Mouse Right', 'A / D', 'Num4 / Num6', 'J / L' ];
        const uniq = Array.from(new Set(options));
        uniq.forEach(opt => {
          const o = document.createElement('option');
          o.value = opt;
          o.textContent = opt;
          if (opt === p.controls) o.selected = true;
          controlsSelect.appendChild(o);
        });
        controlsSelect.addEventListener('change', () => { p.controls = controlsSelect.value; });

        row.appendChild(left);
        row.appendChild(controlsSelect);

        if (idx >= 2) {
          const removeBtn = document.createElement('button');
          removeBtn.className = 'remove-btn';
          removeBtn.textContent = 'Remove';
          removeBtn.addEventListener('click', () => { players.splice(idx, 1); renderPlayers(); });
          row.appendChild(removeBtn);
        }

        list.appendChild(row);
      });
    }

    renderPlayers();

    const actions = document.createElement('div');
    actions.className = 'menu-actions';

    const addBtn = document.createElement('button');
    addBtn.className = 'add-btn';
    addBtn.textContent = '+ Add Player';
    addBtn.addEventListener('click', () => { if (players.length >= presets.length) return; players.push(Object.assign({}, presets[players.length])); renderPlayers(); });

    const resetBtn = document.createElement('button');
    resetBtn.className = 'ghost';
    resetBtn.textContent = 'Reset';
    resetBtn.addEventListener('click', () => { players.length = 2; players[0] = Object.assign({}, presets[0]); players[1] = Object.assign({}, presets[1]); renderPlayers(); });

    const startBtn = document.createElement('button');
    startBtn.className = 'primary';
    startBtn.textContent = 'Start';
    startBtn.addEventListener('click', () => {
      try {
        localStorage.setItem('firstStartDone', 'true');
        localStorage.setItem('playerConfig', JSON.stringify(players.map(p => ({ name: p.name, color: p.color, controls: p.controls }))));
      } catch (e) { console.warn('Could not save player settings:', e); }
      if (window.gameState) {
        window.gameState.paused = false;
      }
      try { document.body.removeChild(overlay); } catch (e) {}
    });

    actions.appendChild(addBtn);
    actions.appendChild(resetBtn);
    actions.appendChild(startBtn);

    menu.appendChild(title);
    menu.appendChild(description);
    menu.appendChild(list);
    menu.appendChild(actions);
    overlay.appendChild(menu);
    document.body.appendChild(overlay);
  } catch (err) {
    console.error('openPlayerConfigMenu failed:', err);
  }
}

const shouldPauseForFirstStart = true;

// Always open the player configuration overlay on every page load
try {
  openPlayerConfigMenu();
} catch (e) {}

// Wire up the player selection button in the main UI
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('openPlayerMenuBtn');
  if (btn) btn.addEventListener('click', openPlayerConfigMenu);
});

const VIEW_SIZE = 10;
const DEFAULT_ASPECT = 16 / 9;
const TRAIL_WIDTH = 0.05;
const TRAIL_COLLISION_RADIUS = 0.06;
const TRAIL_SAFE_FRAMES = 10;
const MAX_CELL_STAMPS = 4;
const FIXED_TIMESTEP_MS = 1000 / 60;

function getCanvasAspect() {
  const canvas = document.getElementById('gameCanvas');
  if (canvas && canvas.height) {
    return canvas.width / canvas.height;
  }
  return DEFAULT_ASPECT;
}

function computeViewBounds() {
  const state = window.gameState;
  if (state && state.viewBounds) {
    return state.viewBounds;
  }
  const aspect = getCanvasAspect();
  const horizontalBoundary = VIEW_SIZE * aspect;
  const verticalBoundary = VIEW_SIZE;
  return {
    minX: -horizontalBoundary,
    maxX: horizontalBoundary,
    minY: -verticalBoundary,
    maxY: verticalBoundary
  };
}

// Function to generate random starting positions and angles for snakes
function generateRandomStartingPosition() {
  const bounds = computeViewBounds();
  const safeMargin = 1;
  const minX = bounds.minX + safeMargin;
  const maxX = bounds.maxX - safeMargin;
  const minY = bounds.minY + safeMargin;
  const maxY = bounds.maxY - safeMargin;
  const horizontalRange = Math.max(0, maxX - minX);
  const verticalRange = Math.max(0, maxY - minY);
  const x = minX + Math.random() * horizontalRange;
  const y = minY + Math.random() * verticalRange;
  const direction = Math.random() * 360;
  return { x, y, direction };
}

initGame();

// Generate random starting positions for both players
const player1Start = generateRandomStartingPosition();
const player2Start = generateRandomStartingPosition();

// Snake game state with two players
class Trail {
  constructor(capacity = 1024, startX = 0, startY = 0) {
    this._cap = Math.max(1, capacity);
    this._data = new Float32Array(this._cap * 2);
    this._start = 0;
    this._count = 0;
    if (typeof startX === 'number' && typeof startY === 'number') {
      this.push(startX, startY);
    }
  }

  _grow() {
    const newCap = this._cap * 2;
    const newData = new Float32Array(newCap * 2);
    for (let i = 0; i < this._count; i++) {
      const idx = (this._start + i) % this._cap;
      const oldPos = idx * 2;
      const newPos = i * 2;
      newData[newPos] = this._data[oldPos];
      newData[newPos + 1] = this._data[oldPos + 1];
    }
    this._data = newData;
    this._cap = newCap;
    this._start = 0;
  }

  push(x, y) {
    if (this._count >= this._cap) {
      this._grow();
    }
    const idx = (this._start + this._count) % this._cap;
    const p = idx * 2;
    this._data[p] = x;
    this._data[p + 1] = y;
    this._count++;
  }

  forEach(cb) {
    for (let i = 0; i < this._count; i++) {
      const idx = (this._start + i) % this._cap;
      const p = idx * 2;
      cb(this._data[p], this._data[p + 1], i);
    }
  }

  get(i, out) {
    if (i < 0 || i >= this._count) return undefined;
    const idx = (this._start + i) % this._cap;
    const p = idx * 2;
    const target = out ?? { x: 0, y: 0 };
    target.x = this._data[p];
    target.y = this._data[p + 1];
    return target;
  }

  peekLast(out) {
    if (this._count === 0) return undefined;
    return this.get(this._count - 1, out);
  }

  clear() {
    this._start = 0;
    this._count = 0;
  }

  get length() {
    return this._count;
  }
}

class OccupancyGrid {
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
    const changed = minX !== this.minX || maxX !== this.maxX || minY !== this.minY || maxY !== this.maxY;
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
    if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) return;
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
    const base = idx * MAX_CELL_STAMPS;
    let count = this.stampCount[idx];
    let slot;
    if (count < MAX_CELL_STAMPS) {
      slot = base + count;
      this.stampCount[idx] = count + 1;
    } else {
      slot = base;
      let oldestAge = this.stampAge[slot];
      for (let i = 1; i < MAX_CELL_STAMPS; i++) {
        const candidate = base + i;
        const candidateAge = this.stampAge[candidate];
        if (candidateAge < oldestAge) {
          slot = candidate;
          oldestAge = candidateAge;
        }
      }
    }

    this.stampX[slot] = x;
    this.stampY[slot] = y;
    this.stampRadius[slot] = radius;
    this.stampOwner[slot] = playerId;
    this.stampAge[slot] = frame;
  }

  _circleIntersectsCell(cx, cy, radius, col, row) {
    const cellMinX = this.minX + col * this.cellSize;
    const cellMinY = this.minY + row * this.cellSize;
    const cellMaxX = cellMinX + this.cellSize;
    const cellMaxY = cellMinY + this.cellSize;
    const closestX = Math.max(cellMinX, Math.min(cx, cellMaxX));
    const closestY = Math.max(cellMinY, Math.min(cy, cellMaxY));
    const dx = cx - closestX;
    const dy = cy - closestY;
    return (dx * dx + dy * dy) <= radius * radius;
  }

  checkCollision(x, y, radius, playerId, frame) {
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
        const count = this.stampCount[idx];
        if (!count) continue;
        const base = idx * MAX_CELL_STAMPS;
        for (let i = 0; i < count; i++) {
          const slot = base + i;
          const owner = this.stampOwner[slot];
          if (!owner) continue;
          const storedRadius = this.stampRadius[slot];
          const combinedRadius = radius + storedRadius;
          if (combinedRadius <= 0) continue;
          const dx = x - this.stampX[slot];
          const dy = y - this.stampY[slot];
          if ((dx * dx + dy * dy) > combinedRadius * combinedRadius) continue;
          if (owner !== playerId) return true;
          const age = this.stampAge[slot];
          if (frame > age && frame - age > this.ownSafeFrames) {
            return true;
          }
        }
      }
    }
    return false;
  }
}




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

const savedConfig = (() => {
  try {
    return JSON.parse(localStorage.getItem('playerConfig') || 'null');
  } catch (e) {
    return null;
  }
})();

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
  paused: shouldPauseForFirstStart
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
    // Avoid awarding multiple times for the same death instance
    if (deadPlayer._deathProcessed) return;
    deadPlayer._deathProcessed = true;
    // Award only to other players that are currently alive (dead snakes must not gain points)
    state.players.forEach((p) => {
      if (!p) return;
      if (p.id !== deadPlayer.id && p.isAlive) {
        p.score = (Number(p.score) || 0) + 1;
      }
    });
    // Refresh controls UI
    try { if (typeof window.updateControlsInfoUI === 'function') window.updateControlsInfoUI(state.players); } catch (e) {}
  } catch (e) {
    // silent
  }
}

// Update the on-screen controls-info panel to reflect configured players
function updateControlsInfoUI(playersList) {
  try {
    const container = document.querySelector('.controls-info');
    if (!container) return;
    const title = container.querySelector('h2');
    if (title) title.textContent = 'Line Evader';
    const existing = container.querySelector('.player-controls');
    if (existing) existing.remove();

    const playerControls = document.createElement('div');
    playerControls.className = 'player-controls';
    playersList.forEach((p) => {
      const div = document.createElement('div');
      div.className = `player${p.id} player-card`;
      div.style.background = 'rgba(255,255,255,0.03)';
      div.style.padding = '8px';
      div.style.borderRadius = '6px';
      div.style.minWidth = '160px';

      const h3 = document.createElement('h3');
      const sw = document.createElement('span');
      sw.style.display = 'inline-block';
      sw.style.width = '12px';
      sw.style.height = '12px';
      sw.style.marginRight = '8px';
      sw.style.verticalAlign = 'middle';
      const r = Math.round(p.color[0] * 255);
      const g = Math.round(p.color[1] * 255);
      const b = Math.round(p.color[2] * 255);
      sw.style.background = `rgb(${r}, ${g}, ${b})`;
      h3.appendChild(sw);
      const nameNode = document.createTextNode(`${p.name}`);
      h3.appendChild(nameNode);

      // score display
      const scoreSpan = document.createElement('span');
      scoreSpan.className = 'player-score';
      scoreSpan.style.marginLeft = '8px';
      scoreSpan.style.fontWeight = '700';
      scoreSpan.style.color = '#fff';
      scoreSpan.textContent = `${(p.score != null) ? p.score : 0}`;
      h3.appendChild(scoreSpan);

      const p1 = document.createElement('p');
      p1.textContent = `Controls: ${p.controls}`;
      p1.style.margin = '6px 0 0 0';
      p1.style.fontSize = '14px';

      div.appendChild(h3);
      div.appendChild(p1);
      playerControls.appendChild(div);
    });

    const gameInfo = container.querySelector('.game-info');
    if (gameInfo) container.insertBefore(playerControls, gameInfo);
    else container.appendChild(playerControls);
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
    showWinnerOverlay(alive[0]);
  } else if (alive.length === 0 && !state.gameOverLogged) {
    state.gameOverLogged = true;
    state.paused = true;
    showDrawOverlay();
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

// Create a simple winner overlay UI
function _ensureWinnerStyles() {
  if (document.getElementById('winnerOverlayStyles')) return;
  const s = document.createElement('style');
  s.id = 'winnerOverlayStyles';
  s.textContent = `
    #winnerOverlay { position: fixed; inset: 0; background: rgba(0,0,0,0.75); display:flex; align-items:center; justify-content:center; z-index:10000; }
    #winnerBox { background:#111; color:#fff; padding:20px; border-radius:8px; border:1px solid #444; min-width:280px; text-align:center; }
    #winnerBox h2 { margin:0 0 12px 0; }
    #winnerBox p { margin:8px 0; }
    #winnerBox button { margin-top:12px; padding:8px 12px; border-radius:6px; border:1px solid #444; background:#222; color:#fff; cursor:pointer; }
  `;
  document.head.appendChild(s);
}

function showWinnerOverlay(player) {
  try {
    _ensureWinnerStyles();
    const existing = document.getElementById('winnerOverlay');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.id = 'winnerOverlay';
    const box = document.createElement('div');
    box.id = 'winnerBox';
    const title = document.createElement('h2');
    title.textContent = 'Winner!';
    const name = document.createElement('p');
    name.textContent = `${player.name || ('Player ' + player.id)} wins!`;
    const sw = document.createElement('div');
    sw.style.width = '28px';
    sw.style.height = '14px';
    sw.style.margin = '8px auto';
    sw.style.borderRadius = '4px';
    const r = Math.round((player.color[0] || 1) * 255);
    const g = Math.round((player.color[1] || 1) * 255);
    const b = Math.round((player.color[2] || 1) * 255);
    sw.style.background = `rgb(${r}, ${g}, ${b})`;

    const btn = document.createElement('button');
    btn.textContent = 'Play Again';
    btn.addEventListener('click', () => {
      try { document.body.removeChild(overlay); } catch (e) {}
      forceReset();
    });

    box.appendChild(title);
    box.appendChild(name);
    box.appendChild(sw);
    box.appendChild(btn);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  } catch (e) {
    console.error('showWinnerOverlay failed', e);
  }
}

function showDrawOverlay() {
  try {
    _ensureWinnerStyles();
    const existing = document.getElementById('winnerOverlay');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.id = 'winnerOverlay';
    const box = document.createElement('div');
    box.id = 'winnerBox';
    const title = document.createElement('h2');
    title.textContent = 'Draw';
    const msg = document.createElement('p');
    msg.textContent = 'All players eliminated.';
    const btn = document.createElement('button');
    btn.textContent = 'Play Again';
    btn.addEventListener('click', () => { try { document.body.removeChild(overlay); } catch (e) {} forceReset(); });
    box.appendChild(title);
    box.appendChild(msg);
    box.appendChild(btn);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  } catch (e) {
    console.error('showDrawOverlay failed', e);
  }
}

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

  if (checkTrailCollision(newX, newY, player)) {
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

// Check if a position collides with any trail
function checkTrailCollision(x, y, currentPlayer) {
  const state = window.gameState;
  if (!state) return false;
  const grid = state.occupancyGrid;
  if (grid) {
    return grid.checkCollision(x, y, TRAIL_COLLISION_RADIUS, currentPlayer.id, state.frameCounter);
  }

  const playersArr = state.players || [];
  for (let i = 0; i < playersArr.length; i++) {
    const player = playersArr[i];
    if (!player || !player.trail) continue;
    if (checkTrailSegmentCollision(x, y, player.trail, TRAIL_COLLISION_RADIUS, player === currentPlayer, TRAIL_SAFE_FRAMES)) {
      return true;
    }
  }
  return false;
}

// Check collision with a specific trail
function checkTrailSegmentCollision(x, y, trail, radius, isOwnTrail, skipPoints) {
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

// Calculate distance from point to line segment
function distanceToLineSegment(px, py, x1, y1, x2, y2) {
  // Keep the old function name but implement using squared distance helper
  return Math.sqrt(distanceToLineSegmentSq(px, py, x1, y1, x2, y2));
}

// Squared-distance variant (avoids Math.sqrt)
function distanceToLineSegmentSq(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    // segment is a point
    const vx = px - x1;
    const vy = py - y1;
    return vx * vx + vy * vy;
  }

  // Project point onto line (parameter t)
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;

  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;
  const rx = px - closestX;
  const ry = py - closestY;
  return rx * rx + ry * ry;
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
