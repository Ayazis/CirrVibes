import { VIEW_SIZE, TRAIL_SAFE_FRAMES } from './constants.js';
import { generateRandomStartingPosition, computeViewBounds } from './viewUtils.js';
import { Trail } from './trail.js';
import { OccupancyGrid } from './occupancyGrid.js';
import { loadPlayerConfig } from './persistence.js';

function hexToRgbArray(hex) {
  if (!hex) return [1.0, 1.0, 1.0, 1.0];
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return [r, g, b, 1.0];
}

export function createInitialGameState() {
  const player1Start = generateRandomStartingPosition();
  const player2Start = generateRandomStartingPosition();

  const savedConfig = loadPlayerConfig();
  const defaultConfig = [
    { name: 'Player 1', color: '#ff6666', controls: 'ArrowLeft / ArrowRight' },
    { name: 'Player 2', color: '#6666ff', controls: 'Mouse Left / Mouse Right' }
  ];
  const effectiveConfig = (Array.isArray(savedConfig) && savedConfig.length >= 2) ? savedConfig : defaultConfig;

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

  const viewBounds = computeViewBounds();
  const occupancyGrid = new OccupancyGrid(0.12, TRAIL_SAFE_FRAMES);
  occupancyGrid.updateBounds(
    viewBounds.minX,
    viewBounds.maxX,
    viewBounds.minY,
    viewBounds.maxY,
    players,
    0
  );

  const state = {
    gameOverLogged: false,
    players,
    viewSize: VIEW_SIZE,
    viewBounds,
    frameCounter: 0,
    paused: Boolean(window.playerConfigMenuOpen),
    occupancyGrid
  };

  state.player1 = state.players[0];
  state.player2 = state.players[1];

  return state;
}
