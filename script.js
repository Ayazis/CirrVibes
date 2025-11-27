import { initGame } from './src/initGame.js';
import { openPlayerConfigMenu } from './src/ui/overlays.js';
import { createInitialGameState } from './src/gameState.js';
import { createMultiplayerRuntime } from './src/multiplayer/runtime.js';


function detectTouchCapabilities() {
  if (typeof window === 'undefined') return { isTouch: false };
  const nav = window.navigator || {};  
  const coarsePointer = window.matchMedia ? window.matchMedia('(pointer: coarse)').matches : false;
  const touchEvents = 'ontouchstart' in window;  
  return {
    isTouch: Boolean( coarsePointer || touchEvents)    
  };
}

initGame();

window.gameState = createInitialGameState();
window.gameCapabilities = detectTouchCapabilities();

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

  if (window.gameCapabilities?.isTouch) {
    const touchControls = document.getElementById('touchControls');
    if (touchControls) {
      touchControls.classList.add('touch-controls--visible');
      touchControls.setAttribute('aria-hidden', 'false');
    }
  }
});
