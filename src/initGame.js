// Game initialization logic
import { setupCanvas } from './gameCanvas.js';
import { drawScene } from './drawScene.js';

export const initGame = () => {
  const canvas = setupCanvas('gameCanvas');
  const gl = canvas.getContext('webgl');
  drawScene(gl, canvas);
};
