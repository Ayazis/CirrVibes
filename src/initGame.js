// Game initialization logic
import { setupCanvas } from './gameCanvas.js';
import { draw3DScene } from './draw3DScene.js';

export const initGame = () => {
  const canvas = setupCanvas('gameCanvas');
  const gl = canvas.getContext('webgl');
  draw3DScene(gl, canvas);
};
