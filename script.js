import { initGame } from './src/initGame.js';
import { loadFirstStartDone } from './src/persistence.js';
import { openPlayerConfigMenu, showWinnerOverlay, showDrawOverlay } from './src/ui/overlays.js';
import { updateControlsInfoUI } from './src/ui/controlsInfo.js';
import { attachInputHandlers } from './src/input.js';
import { createInitialGameState } from './src/gameState.js';
import { startFixedStepLoop, resetGame, forceReset } from './src/gameLoop.js';

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

updateControlsInfoUI(window.gameState.players);
window.updateControlsInfoUI = updateControlsInfoUI;

// Attach input handlers for current state
attachInputHandlers(window.gameState);

// Expose reset helpers
window.resetGame = () => resetGame(window.gameState);
window.forceReset = () => forceReset(window.gameState);

// Start the fixed-timestep game loop
startFixedStepLoop(window.gameState, {
  onWinner: (player) => showWinnerOverlay(player, () => forceReset(window.gameState)),
  onDraw: () => showDrawOverlay(() => forceReset(window.gameState))
});
