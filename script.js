import { initGame } from './src/initGame.js';

// First-start menu (only shown once). Injects a simple overlay that lets the user add extra players,
// shows each player's color and their control scheme, and saves the choice to localStorage.
// This menu does not change the existing gameplay code — it only collects and persists preferences.
(function createFirstStartMenu() {
  try {
    const done = localStorage.getItem('firstStartDone');
    if (done === 'true') return; // already completed

    // Preset player templates (existing two players preserved)
    const presets = [
      { name: 'Player 1', color: '#ff6666', controls: 'ArrowLeft / ArrowRight' }, // existing
      { name: 'Player 2', color: '#6666ff', controls: 'Mouse Left / Mouse Right' }, // existing
      { name: 'Player 3', color: '#66ff66', controls: 'A / D' },
      { name: 'Player 4', color: '#ffd166', controls: 'Num4 / Num6' }
    ];

    // Start with two players by default
    const players = [Object.assign({}, presets[0]), Object.assign({}, presets[1])];

    // Inject minimal CSS for the overlay
    const style = document.createElement('style');
    style.textContent = `
      #firstStartMenuOverlay {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.75);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        color: #fff;
        font-family: Arial, sans-serif;
      }
      #firstStartMenu {
        background: #111;
        border: 2px solid #fff;
        padding: 20px;
        border-radius: 8px;
        width: 420px;
        max-width: calc(100% - 40px);
      }
      #firstStartMenu h2 { margin: 0 0 12px 0; }
      .player-row {
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:8px;
        margin:8px 0;
        padding:8px;
        background: rgba(255,255,255,0.03);
        border-radius:6px;
      }
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

    // Build overlay
    const overlay = document.createElement('div');
    overlay.id = 'firstStartMenuOverlay';

    const menu = document.createElement('div');
    menu.id = 'firstStartMenu';

    const title = document.createElement('h2');
    title.textContent = 'Welcome — Configure Players';

    const description = document.createElement('div');
    description.className = 'muted';
    description.textContent = 'This first-start menu runs only once. You can add players and see their colors and control keys. The in-game interface remains unchanged.';

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
        const options = [
          p.controls,
          'ArrowLeft / ArrowRight',
          'Mouse Left / Mouse Right',
          'A / D',
          'Num4 / Num6',
          'J / L'
        ];
        // Ensure unique options and keep current
        const uniq = Array.from(new Set(options));
        uniq.forEach(opt => {
          const o = document.createElement('option');
          o.value = opt;
          o.textContent = opt;
          if (opt === p.controls) o.selected = true;
          controlsSelect.appendChild(o);
        });
        controlsSelect.addEventListener('change', () => {
          p.controls = controlsSelect.value;
        });

        row.appendChild(left);
        row.appendChild(controlsSelect);

        // Allow removal for players beyond the first two
        if (idx >= 2) {
          const removeBtn = document.createElement('button');
          removeBtn.className = 'remove-btn';
          removeBtn.textContent = 'Remove';
          removeBtn.addEventListener('click', () => {
            players.splice(idx, 1);
            renderPlayers();
          });
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
    addBtn.addEventListener('click', () => {
      if (players.length >= presets.length) return;
      players.push(Object.assign({}, presets[players.length]));
      renderPlayers();
    });

    const resetBtn = document.createElement('button');
    resetBtn.className = 'ghost';
    resetBtn.textContent = 'Reset Menu';
    resetBtn.addEventListener('click', () => {
      players.length = 2;
      players[0] = Object.assign({}, presets[0]);
      players[1] = Object.assign({}, presets[1]);
      renderPlayers();
    });

    const startBtn = document.createElement('button');
    startBtn.className = 'primary';
    startBtn.textContent = 'Start Game';
    startBtn.addEventListener('click', () => {
      // Persist chosen settings and mark first-start as done.
      try {
        localStorage.setItem('firstStartDone', 'true');
        localStorage.setItem('playerConfig', JSON.stringify(players.map(p => ({ name: p.name, color: p.color, controls: p.controls }))));
      } catch (e) {
        console.warn('Could not save first-start settings:', e);
      }
      // Remove overlay and reload so the game initializes with the chosen configuration.
      // Reload is simple and keeps existing game initialization intact.
      try { document.body.removeChild(overlay); } catch(e) {}
      location.reload();
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
    // Fail silently — menu is optional and must not break the game
    console.error('First-start menu failed to initialize:', err);
  }
})();

const VIEW_SIZE = 10;
const DEFAULT_ASPECT = 16 / 9;
const TRAIL_WIDTH = 0.05;
const TRAIL_COLLISION_RADIUS = 0.06;
const TRAIL_SAFE_FRAMES = 10;
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

  push(x, y) {
    let idx;
    if (this._count < this._cap) {
      idx = (this._start + this._count) % this._cap;
      this._count++;
    } else {
      idx = this._start;
      this._start = (this._start + 1) % this._cap;
    }
    const p = idx * 2;
    this._data[p] = x;
    this._data[p + 1] = y;
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
    this.ages = new Uint32Array(size);
    this.owners = new Uint8Array(size);
    this.sampleX = new Float32Array(size);
    this.sampleY = new Float32Array(size);
    this.sampleRadius = new Float32Array(size);
  }

  clear() {
    this.ages.fill(0);
    this.owners.fill(0);
    this.sampleX.fill(0);
    this.sampleY.fill(0);
    this.sampleRadius.fill(0);
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
        this.ages[idx] = frame;
        this.owners[idx] = playerId;
        this.sampleX[idx] = x;
        this.sampleY[idx] = y;
        this.sampleRadius[idx] = radius;
      }
    }
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
        const owner = this.owners[idx];
        if (!owner) continue;
        const storedRadius = this.sampleRadius[idx];
        const combinedRadius = radius + storedRadius;
        if (combinedRadius <= 0) continue;
        const dx = x - this.sampleX[idx];
        const dy = y - this.sampleY[idx];
        if ((dx * dx + dy * dy) > combinedRadius * combinedRadius) continue;
        if (owner !== playerId) return true;
        const age = this.ages[idx];
        if (frame > age && frame - age > this.ownSafeFrames) {
          return true;
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
    controls: cfg.controls || (idx === 1 ? 'Mouse Left / Mouse Right' : 'ArrowLeft / ArrowRight')
  };
});

window.gameState = {
  gameOverLogged: false,
  players,
  viewSize: VIEW_SIZE,
  viewBounds: computeViewBounds(),
  frameCounter: 0
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

// Update the on-screen controls-info panel to reflect configured players
(function updateControlsInfoUI(playersList) {
  try {
    const container = document.querySelector('.controls-info');
    if (!container) return;
    const title = container.querySelector('h2');
    if (title) title.textContent = 'Achtung die Kurve - Players';
    const existing = container.querySelector('.player-controls');
    if (existing) existing.remove();

    const playerControls = document.createElement('div');
    playerControls.className = 'player-controls';
    playersList.forEach((p) => {
      const div = document.createElement('div');
      div.className = `player${p.id}`;
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
      const text = document.createTextNode(`${p.name}`);
      h3.appendChild(text);

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
})(window.gameState.players);

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
  // Reset game with 'R' key - only if all players are dead
  if (event.key === 'r' || event.key === 'R') {
    const allDead = (window.gameState.players || []).every(p => !p.isAlive);
    if (allDead) resetGame();
    return;
  }

  const keyId = (event.key || '').toLowerCase();
  const codeId = (event.code || '').toLowerCase();
  const mapped = controlsMap.get(keyId) || controlsMap.get(codeId);
  if (mapped) {
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

  state.frameCounter += 1;
  const playersArr = state.players;
  for (let i = 0; i < playersArr.length; i++) {
    updatePlayer(playersArr[i], deltaSeconds);
  }

  if (!state.gameOverLogged && playersArr.every((p) => !p.isAlive)) {
    state.gameOverLogged = true;
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
    return;
  }

  if (checkTrailCollision(newX, newY, player)) {
    player.isAlive = false;
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
