import { initGame } from './src/initGame.js';

initGame();

// Snake game state
window.gameState = {
  snakePosition: { x: 0, y: 0 }, // Current position
  snakeDirection: 0, // Direction in degrees (0 = right, 90 = up, 180 = left, 270 = down)
  snakeSpeed: 0.02, // Movement speed
  turnSpeed: 3, // Degrees per frame when turning
  isAlive: true,
  trail: [{ x: 0, y: 0 }], // Trail points for collision detection
  isTurningLeft: false,
  isTurningRight: false
};

// Add controls for the snake
const controls = {
  left: 'ArrowLeft',
  right: 'ArrowRight',
};

// Handle key press events (start turning)
document.addEventListener('keydown', (event) => {
  if (!window.gameState.isAlive) return;
  
  if (event.key === controls.left && !window.gameState.isTurningLeft) {
    window.gameState.isTurningLeft = true;
    console.log('Started turning left');
  } else if (event.key === controls.right && !window.gameState.isTurningRight) {
    window.gameState.isTurningRight = true;
    console.log('Started turning right');
  }
});

// Handle key release events (stop turning)
document.addEventListener('keyup', (event) => {
  if (event.key === controls.left) {
    window.gameState.isTurningLeft = false;
    console.log('Stopped turning left');
  } else if (event.key === controls.right) {
    window.gameState.isTurningRight = false;
    console.log('Stopped turning right');
  }
});

// Game loop for continuous movement and turning
function updateSnake() {
  if (!window.gameState.isAlive) return;
  
  const state = window.gameState;
  
  // Apply turning
  if (state.isTurningLeft) {
    state.snakeDirection -= state.turnSpeed;
  }
  if (state.isTurningRight) {
    state.snakeDirection += state.turnSpeed;
  }
  
  // Normalize direction to 0-360 range
  state.snakeDirection = ((state.snakeDirection % 360) + 360) % 360;
  
  // Convert direction to radians for movement calculation
  const directionRad = (state.snakeDirection * Math.PI) / 180;
  
  // Calculate movement
  const deltaX = Math.cos(directionRad) * state.snakeSpeed;
  const deltaY = Math.sin(directionRad) * state.snakeSpeed;
  
  // Update position
  state.snakePosition.x += deltaX;
  state.snakePosition.y += deltaY;
  
  // Add current position to trail (for collision detection and rendering)
  state.trail.push({ x: state.snakePosition.x, y: state.snakePosition.y });
  
  // Limit trail length to prevent memory issues (keep last 1000 points)
  if (state.trail.length > 1000) {
    state.trail.shift();
  }
  
  // Log position occasionally for debugging
  if (Math.random() < 0.01) { // 1% chance per frame
    console.log(`Snake position: (${state.snakePosition.x.toFixed(2)}, ${state.snakePosition.y.toFixed(2)}), direction: ${state.snakeDirection.toFixed(1)}°`);
  }
}

// Start the game loop
setInterval(updateSnake, 16); // ~60 FPS
