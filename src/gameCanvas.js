// Setup for the game canvas with Hi-DPI awareness
export const resizeCanvasToDisplaySize = (canvas) => {
  if (!canvas) return false;
  const dpr = window.devicePixelRatio || 1;
  const displayWidth = Math.floor(canvas.clientWidth * dpr);
  const displayHeight = Math.floor(canvas.clientHeight * dpr);
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

  // Size the canvas relative to the viewport but keep a sensible maximum for desktops
  canvas.style.width = "80vw";
  canvas.style.height = "80vh";
  canvas.style.maxWidth = "960px";
  canvas.style.maxHeight = "540px";
  canvas.style.display = "block";

  resizeCanvasToDisplaySize(canvas);
  return canvas;
};
