import { initGame } from './src/initGame.js';

initGame();

// Snake game state with two players
window.gameState = {
  player1: {
    snakePosition: { x: -2, y: 0 }, // Start on the left
    snakeDirection: 0, // Direction in degrees (0 = right, 90 = up, 180 = left, 270 = down)
    snakeSpeed: 0.02, // Movement speed
    turnSpeed: 3, // Degrees per frame when turning
    isAlive: true,
    trail: [{ x: -2, y: 0 }], // Trail points for collision detection
    isTurningLeft: false,
    isTurningRight: false,
    color: [1.0, 0.2, 0.2, 1.0] // Red color
  },
  player2: {
    snakePosition: { x: 2, y: 0 }, // Start on the right
    snakeDirection: 180, // Start facing left
    snakeSpeed: 0.02,
    turnSpeed: 3,
    isAlive: true,
    trail: [{ x: 2, y: 0 }],
    isTurningLeft: false,
    isTurningRight: false,
    color: [0.2, 0.2, 1.0, 1.0] // Blue color
  }
};

// Add controls for both players
const controls = {
  player1: {
    left: 'ArrowLeft',
    right: 'ArrowRight',
  },
  // Player 2 will use mouse controls (implemented below)
};

// Mouse state for player 2
let mouseState = {
  isPressed: false,
  leftButton: false,
  rightButton: false,
  x: 0,
  y: 0
};

// Handle key press events (start turning) - Player 1
document.addEventListener('keydown', (event) => {
  if (!window.gameState.player1.isAlive) return;
  
  if (event.key === controls.player1.left && !window.gameState.player1.isTurningLeft) {
    window.gameState.player1.isTurningLeft = true;
    console.log('Player 1 started turning left');
  } else if (event.key === controls.player1.right && !window.gameState.player1.isTurningRight) {
    window.gameState.player1.isTurningRight = true;
    console.log('Player 1 started turning right');
  }
});

// Handle key release events (stop turning) - Player 1
document.addEventListener('keyup', (event) => {
  if (event.key === controls.player1.left) {
    window.gameState.player1.isTurningLeft = false;
    console.log('Player 1 stopped turning left');
  } else if (event.key === controls.player1.right) {
    window.gameState.player1.isTurningRight = false;
    console.log('Player 1 stopped turning right');
  }
});

// Mouse controls for Player 2
document.addEventListener('mousedown', (event) => {
  if (!window.gameState.player2.isAlive) return;
  
  mouseState.isPressed = true;
  
  if (event.button === 0) { // Left mouse button
    mouseState.leftButton = true;
    window.gameState.player2.isTurningLeft = true;
    console.log('Player 2 started turning left (left mouse)');
  } else if (event.button === 2) { // Right mouse button
    mouseState.rightButton = true;
    window.gameState.player2.isTurningRight = true;
    console.log('Player 2 started turning right (right mouse)');
  }
  
  event.preventDefault(); // Prevent context menu on right click
});

document.addEventListener('mouseup', (event) => {
  if (event.button === 0) { // Left mouse button
    mouseState.leftButton = false;
    window.gameState.player2.isTurningLeft = false;
    console.log('Player 2 stopped turning left');
  } else if (event.button === 2) { // Right mouse button
    mouseState.rightButton = false;
    window.gameState.player2.isTurningRight = false;
    console.log('Player 2 stopped turning right');
  }
  
  if (!mouseState.leftButton && !mouseState.rightButton) {
    mouseState.isPressed = false;
  }
});

// Prevent context menu on right click
document.addEventListener('contextmenu', (event) => {
  event.preventDefault();
});

// Game loop for continuous movement and turning
function updateSnake() {
  const state = window.gameState;
  
  // Update both players
  updatePlayer(state.player1);
  updatePlayer(state.player2);
}

function updatePlayer(player) {
  if (!player.isAlive) return;
  
  // Apply turning
  if (player.isTurningLeft) {
    player.snakeDirection += player.turnSpeed; // Changed from -= to +=
  }
  if (player.isTurningRight) {
    player.snakeDirection -= player.turnSpeed; // Changed from += to -=
  }
  
  // Normalize direction to 0-360 range
  player.snakeDirection = ((player.snakeDirection % 360) + 360) % 360;
  
  // Convert direction to radians for movement calculation
  const directionRad = (player.snakeDirection * Math.PI) / 180;
  
  // Calculate movement
  const deltaX = Math.cos(directionRad) * player.snakeSpeed;
  const deltaY = Math.sin(directionRad) * player.snakeSpeed;
  
  // Update position
  player.snakePosition.x += deltaX;
  player.snakePosition.y += deltaY;
  
  // Add current position to trail (for collision detection and rendering)
  player.trail.push({ x: player.snakePosition.x, y: player.snakePosition.y });
  
  // Limit trail length to prevent memory issues (keep last 1000 points)
  if (player.trail.length > 1000) {
    player.trail.shift();
  }
}

// Start the game loop
setInterval(updateSnake, 16); // ~60 FPS
