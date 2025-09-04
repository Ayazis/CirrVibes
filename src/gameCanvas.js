// Setup for the game canvas
export const setupCanvas = (canvasId) => {
  const canvas = document.getElementById(canvasId);
  canvas.width = window.innerWidth * 0.8;
  canvas.height = window.innerHeight * 0.8;
  return canvas;
};
