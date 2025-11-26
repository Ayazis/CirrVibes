import { initGame } from './src/initGame.js';
import { openPlayerConfigMenu } from './src/ui/overlays.js';
import { createInitialGameState } from './src/gameState.js';
import { createMultiplayerRuntime } from './src/multiplayer/runtime.js';

initGame();

window.gameState = createInitialGameState();

const multiplayer = createMultiplayerRuntime({ gameState: window.gameState });
multiplayer.boot();

window.resetGame = () => multiplayer.resetGame();
window.forceReset = () => multiplayer.forceReset();
window.updateControlsInfoUI = () => multiplayer.renderControls();

document.addEventListener('DOMContentLoaded', () => {
  const playerBtn = document.getElementById('openPlayerMenuBtn');
  if (playerBtn) playerBtn.addEventListener('click', openPlayerConfigMenu);

  const startBtn = document.getElementById('startGameBtn');
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      if (window.gameState) window.gameState.paused = false;
      multiplayer.setStatus('Running');
    });
  }
});
