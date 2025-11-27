import { createLocalRuntime } from "./localRuntime.js";
import { createWebMultiplayer } from "./webMultiplayer.js";

export function createMultiplayerRuntime({ gameState }) {
  const localRuntime = createLocalRuntime({ gameState });
  const webMultiplayer = createWebMultiplayer({ gameState, localRuntime });

  return {
    boot: () => webMultiplayer.boot(),
    resetGame: () => webMultiplayer.resetGame(),
    forceReset: () => webMultiplayer.forceReset(),
    renderControls: () => webMultiplayer.renderControls(),
    setStatus: (text) => webMultiplayer.setStatus(text),
  };
}
