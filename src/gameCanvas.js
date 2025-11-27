// Setup for the game canvas with Hi-DPI awareness
const BASE_CANVAS_WIDTH = 960;
const BASE_CANVAS_HEIGHT = 540;

export const resizeCanvasToDisplaySize = (canvas) => {
  if (!canvas) return false;

  // Keep the drawing buffer at a fixed resolution so all clients share
  // identical coordinates regardless of viewport or zoom.
  const displayWidth = BASE_CANVAS_WIDTH;
  const displayHeight = BASE_CANVAS_HEIGHT;
  let resized = false;

  if (canvas.width !== displayWidth) {
    canvas.width = displayWidth;
    resized = true;
  }

  if (canvas.height !== displayHeight) {
    canvas.height = displayHeight;
    resized = true;
  }

  return resized;
};

export const setupCanvas = (canvasId) => {
  const canvas = document.getElementById(canvasId);
  if (!canvas) {
    throw new Error(`Canvas with id "${canvasId}" was not found`);
  }

  // Size the canvas relative to the viewport but keep a sensible maximum for desktops.
  // Display size is handled by CSS, while the drawing buffer remains fixed for
  // consistent multiplayer coordinates across clients.
  canvas.style.width = "var(--canvas-width)";
  canvas.style.height = "auto";
  canvas.style.maxWidth = "var(--canvas-max-width)";
  canvas.style.maxHeight = "none";
  canvas.style.display = "block";

  resizeCanvasToDisplaySize(canvas);
  return canvas;
};
