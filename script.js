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
import { loadPlayerConfig } from './src/persistence.js';
import { checkTrailCollision, checkTrailSegmentCollision } from './src/collision.js';

// First-start menu (only shown once). Injects a simple overlay that lets the user add extra players,
// shows each player's color and their control scheme, and saves the choice to localStorage.
// This menu does not change the existing gameplay code — it only collects and persists preferences.
// Create (or re-open) the player configuration overlay. This function is safe to call multiple times.
function openPlayerConfigMenu() {
  try {
    // If an overlay already exists, bring it to front
    const existing = document.getElementById('firstStartMenuOverlay');
    if (existing) {
      existing.style.display = 'flex';
      try { window.playerConfigMenuOpen = true; if (window.gameState) window.gameState.paused = true; } catch (e) {}
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
    startBtn.textContent = 'Save & Reload';
    startBtn.addEventListener('click', () => {
      try {
        localStorage.setItem('firstStartDone', 'true');
        localStorage.setItem('playerConfig', JSON.stringify(players.map(p => ({ name: p.name, color: p.color, controls: p.controls }))));
      } catch (e) { console.warn('Could not save player settings:', e); }
      // Ensure we clear the open flag and unpause the game if it's initialized.
      try { window.playerConfigMenuOpen = false; if (window.gameState) window.gameState.paused = false; } catch (e) {}
      // Remove any overlay element by id (robust against scope / re-creations)
      try {
        const el = document.getElementById('firstStartMenuOverlay');
        if (el && el.parentNode) el.parentNode.removeChild(el);
      } catch (e) {}
      // Reload to apply saved settings (keep for legacy behavior)
      try { location.reload(); } catch (e) {}
    });

    const closeBtn = document.createElement('button');
    closeBtn.className = 'ghost';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => {
      try { window.playerConfigMenuOpen = false; if (window.gameState) window.gameState.paused = false; } catch (e) {}
      // Remove overlay by id to avoid closure-scope issues
      try {
        const el = document.getElementById('firstStartMenuOverlay');
        if (el && el.parentNode) el.parentNode.removeChild(el);
      } catch (e) {}
    });

    actions.appendChild(addBtn);
    actions.appendChild(resetBtn);
    actions.appendChild(closeBtn);
    actions.appendChild(startBtn);

    menu.appendChild(title);
    menu.appendChild(description);
    menu.appendChild(list);
    menu.appendChild(actions);
    try { window.playerConfigMenuOpen = true; if (window.gameState) window.gameState.paused = true; } catch (e) {}
    overlay.appendChild(menu);
    document.body.appendChild(overlay);
  } catch (err) {
    console.error('openPlayerConfigMenu failed:', err);
  }
}

 // Open the player config on initial page load only when the user hasn't completed first-start.
 // This avoids reopening the overlay after Save & Reload.
document.addEventListener('DOMContentLoaded', () => {
  try {
    const done = localStorage.getItem('firstStartDone');
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
