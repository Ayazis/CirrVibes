import { VIEW_SIZE, DEFAULT_ASPECT } from "./constants.js";

export function getCanvasAspect() {
  const canvas = document.getElementById("gameCanvas");
  if (canvas && canvas.height) {
    return canvas.width / canvas.height;
  }
  return DEFAULT_ASPECT;
}

export function computeViewBounds() {
  const state = window.gameState;
  if (state && state.viewBounds) {
    return state.viewBounds;
  }
  const aspect = getCanvasAspect();
  const horizontalBoundary = VIEW_SIZE * aspect;
  const verticalBoundary = VIEW_SIZE;
  return {
    minX: -horizontalBoundary,
    maxX: horizontalBoundary,
    minY: -verticalBoundary,
    maxY: verticalBoundary,
  };
}

// Function to generate random starting positions and angles for snakes
export function generateRandomStartingPosition() {
  const bounds = computeViewBounds();
  const safeMargin = 1;
  const minX = bounds.minX + safeMargin;
  const maxX = bounds.maxX - safeMargin;
  const minY = bounds.minY + safeMargin;
  const maxY = bounds.maxY - safeMargin;
  const horizontalRange = Math.max(0, maxX - minX);
  const verticalRange = Math.max(0, maxY - minY);
  const x = minX + Math.random() * horizontalRange;
  const y = minY + Math.random() * verticalRange;
  const direction = Math.random() * 360;
  return { x, y, direction };
}
