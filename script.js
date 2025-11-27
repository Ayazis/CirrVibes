import { initGame } from "./src/initGame.js";
import { openPlayerConfigMenu } from "./src/ui/overlays.js";
import { createInitialGameState } from "./src/gameState.js";
import { createMultiplayerRuntime } from "./src/multiplayer/runtime.js";
import { isTouchDevice } from "./src/initGame.js";

initGame();

window.gameState = createInitialGameState();
window.gameCapabilities = isTouchDevice();
const multiplayer = createMultiplayerRuntime({ gameState: window.gameState });
multiplayer.boot();

window.resetGame = () => multiplayer.resetGame();
window.forceReset = () => multiplayer.forceReset();
window.updateControlsInfoUI = () => multiplayer.renderControls();

document.addEventListener("DOMContentLoaded", () => {
  const playerBtn = document.getElementById("openPlayerMenuBtn");
  if (playerBtn) playerBtn.addEventListener("click", openPlayerConfigMenu);

  const startBtn = document.getElementById("startGameBtn");
  if (startBtn) {
    startBtn.addEventListener("click", () => {
      if (window.gameState) window.gameState.paused = false;
      multiplayer.setStatus("Running");
    });
  }

  if (window.gameCapabilities?.isTouch) {
    const touchControls = document.getElementById("touchControls");
    const orientationWarning = document.getElementById(
      "orientationWarning",
    );

    const orientationMedia = window.matchMedia
      ? window.matchMedia("(orientation: landscape)")
      : null;

    const checkLandscape = () => {
      if (orientationMedia) return orientationMedia.matches;
      return window.innerWidth > window.innerHeight;
    };

    const updateTouchUI = () => {
      const isLandscape = checkLandscape();

      if (touchControls) {
        if (isLandscape) {
          touchControls.classList.add("touch-controls--visible");
          touchControls.setAttribute("aria-hidden", "false");
        } else {
          touchControls.classList.remove("touch-controls--visible");
          touchControls.setAttribute("aria-hidden", "true");
        }
      }

      if (orientationWarning) {
        orientationWarning.classList.toggle(
          "orientation-warning--visible",
          !isLandscape,
        );
        orientationWarning.setAttribute(
          "aria-hidden",
          isLandscape ? "true" : "false",
        );
      }
    };

    updateTouchUI();

    if (orientationMedia?.addEventListener) {
      orientationMedia.addEventListener("change", updateTouchUI);
    } else if (orientationMedia?.addListener) {
      orientationMedia.addListener(updateTouchUI);
    }

    window.addEventListener("orientationchange", updateTouchUI);
    window.addEventListener("resize", updateTouchUI);
  }
});
