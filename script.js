import { initGame } from './src/initGame.js';

// Function to generate random starting positions and angles for snakes
function generateRandomStartingPosition() {
  const viewSize = 10;
  const canvas = document.getElementById('gameCanvas');
  const aspect = canvas ? canvas.width / canvas.height : 16/9; // Default aspect ratio if canvas not ready
  const horizontalBoundary = viewSize * aspect;
  const verticalBoundary = viewSize;
  
  // Generate random position within safe bounds (not too close to edges)
  const safeMargin = 1; // Keep snakes away from edges
  const x = (Math.random() - 0.5) * 2 * (horizontalBoundary - safeMargin);
  const y = (Math.random() - 0.5) * 2 * (verticalBoundary - safeMargin);
  
  // Generate random direction (0-360 degrees)
  const direction = Math.random() * 360;
  
  return { x, y, direction };
}

initGame();

// Generate random starting positions for both players
const player1Start = generateRandomStartingPosition();
const player2Start = generateRandomStartingPosition();

// Snake game state with two players
window.gameState = {
  gameOverLogged: false, // Flag to prevent multiple game over messages
  player1: {
    snakePosition: { x: player1Start.x, y: player1Start.y }, // Random starting position
    snakeDirection: player1Start.direction, // Random starting direction
    snakeSpeed: 0.02, // Movement speed
    turnSpeed: 3, // Degrees per frame when turning
    isAlive: true,
    trail: [{ x: player1Start.x, y: player1Start.y }], // Trail points for collision detection
    isTurningLeft: false,
    isTurningRight: false,
    color: [1.0, 0.2, 0.2, 1.0] // Red color
  },
  player2: {
    snakePosition: { x: player2Start.x, y: player2Start.y }, // Random starting position
    snakeDirection: player2Start.direction, // Random starting direction
    snakeSpeed: 0.02,
    turnSpeed: 3,
    isAlive: true,
    trail: [{ x: player2Start.x, y: player2Start.y }],
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
  // Reset game with 'R' key - only if all players are dead
  if (event.key === 'r' || event.key === 'R') {
    if (!window.gameState.player1.isAlive && !window.gameState.player2.isAlive) {
      resetGame();
    }
    return;
  }
  
  if (!window.gameState.player1.isAlive) return;
  
  if (event.key === controls.player1.left && !window.gameState.player1.isTurningLeft) {
    window.gameState.player1.isTurningLeft = true;
  } else if (event.key === controls.player1.right && !window.gameState.player1.isTurningRight) {
    window.gameState.player1.isTurningRight = true;
  }
});

// Handle key release events (stop turning) - Player 1
document.addEventListener('keyup', (event) => {
  if (event.key === controls.player1.left) {
    window.gameState.player1.isTurningLeft = false;
  } else if (event.key === controls.player1.right) {
    window.gameState.player1.isTurningRight = false;
  }
});

// Mouse controls for Player 2
document.addEventListener('mousedown', (event) => {
  if (!window.gameState.player2.isAlive) return;
  
  mouseState.isPressed = true;
  
  if (event.button === 0) { // Left mouse button
    mouseState.leftButton = true;
    window.gameState.player2.isTurningLeft = true;
  } else if (event.button === 2) { // Right mouse button
    mouseState.rightButton = true;
    window.gameState.player2.isTurningRight = true;
  }
  
  event.preventDefault(); // Prevent context menu on right click
});

document.addEventListener('mouseup', (event) => {
  if (event.button === 0) { // Left mouse button
    mouseState.leftButton = false;
    window.gameState.player2.isTurningLeft = false;
  } else if (event.button === 2) { // Right mouse button
    mouseState.rightButton = false;
    window.gameState.player2.isTurningRight = false;
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
  
  // Check if both players are dead for game over
  if (!state.player1.isAlive && !state.player2.isAlive) {
    // Just log the game over state, no auto-reset
    if (!state.gameOverLogged) {
      state.gameOverLogged = true;
    }
  }
}

// Reset game function (can be called manually or automatically)
function resetGame() {
  const state = window.gameState;
  
  // Only allow reset if all players are dead
  if (state.player1.isAlive || state.player2.isAlive) {
    return false;
  }
  
  // Generate new random starting positions for both players
  const player1Start = generateRandomStartingPosition();
  const player2Start = generateRandomStartingPosition();
  
  // Reset game state flags
  state.gameOverLogged = false;
  
  // Reset player 1 with random position and direction
  state.player1.snakePosition = { x: player1Start.x, y: player1Start.y };
  state.player1.snakeDirection = player1Start.direction;
  state.player1.isAlive = true;
  state.player1.trail = [{ x: player1Start.x, y: player1Start.y }];
  state.player1.isTurningLeft = false;
  state.player1.isTurningRight = false;
  
  // Reset player 2 with random position and direction
  state.player2.snakePosition = { x: player2Start.x, y: player2Start.y };
  state.player2.snakeDirection = player2Start.direction;
  state.player2.isAlive = true;
  state.player2.trail = [{ x: player2Start.x, y: player2Start.y }];
  state.player2.isTurningLeft = false;
  state.player2.isTurningRight = false;
  
  return true;
}

// Expose reset function globally for manual reset
window.resetGame = resetGame;

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
  
  // Calculate new position
  const newX = player.snakePosition.x + deltaX;
  const newY = player.snakePosition.y + deltaY;
  
  // Check for boundary collisions (game area bounds)
  // These should match the orthographic projection bounds in drawScene.js
  const viewSize = 10; // Must match the viewSize in drawScene.js
  const canvas = document.getElementById('gameCanvas');
  const aspect = canvas.width / canvas.height;
  const horizontalBoundary = viewSize * aspect;
  const verticalBoundary = viewSize;
  
  if (Math.abs(newX) > horizontalBoundary || Math.abs(newY) > verticalBoundary) {
    player.isAlive = false;
    return;
  }
  
  // Check for trail collisions
  if (checkTrailCollision(newX, newY, player)) {
    player.isAlive = false;
    return;
  }
  
  // Update position
  player.snakePosition.x = newX;
  player.snakePosition.y = newY;
  
  // Add current position to trail (for collision detection and rendering)
  player.trail.push({ x: player.snakePosition.x, y: player.snakePosition.y });
  
  // Limit trail length to prevent memory issues (keep last 1000 points)
  if (player.trail.length > 1000) {
    player.trail.shift();
  }
}

// Check if a position collides with any trail
function checkTrailCollision(x, y, currentPlayer) {
  const collisionRadius = 0.06; // Slightly larger than trail width (0.05) for better collision detection
  const state = window.gameState;
  
  // Check collision with player1's trail
  if (state.player1.trail && checkTrailSegmentCollision(x, y, state.player1.trail, collisionRadius, currentPlayer === state.player1)) {
    return true;
  }
  
  // Check collision with player2's trail
  if (state.player2.trail && checkTrailSegmentCollision(x, y, state.player2.trail, collisionRadius, currentPlayer === state.player2)) {
    return true;
  }
  
  return false;
}

// Check collision with a specific trail
function checkTrailSegmentCollision(x, y, trail, radius, isOwnTrail) {
  if (!trail || trail.length < 2) return false;
  
  // Skip recent trail points for own trail to prevent immediate self-collision
  const skipPoints = isOwnTrail ? 10 : 0;
  const startIndex = Math.max(0, trail.length - skipPoints);
  
  for (let i = 0; i < startIndex - 1; i++) {
    const p1 = trail[i];
    const p2 = trail[i + 1];
    
    // Check distance from point to line segment
    const distance = distanceToLineSegment(x, y, p1.x, p1.y, p2.x, p2.y);
    
    if (distance < radius) {
      return true;
    }
  }
  
  return false;
}

// Calculate distance from point to line segment
function distanceToLineSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  
  if (length === 0) {
    // Line segment is actually a point
    return Math.sqrt((px - x1) * (px - x1) + (py - y1) * (py - y1));
  }
  
  // Calculate the parameter t that represents where the closest point on the line segment is
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (length * length)));
  
  // Calculate the closest point on the line segment
  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;
  
  // Return distance from point to closest point on line segment
  return Math.sqrt((px - closestX) * (px - closestX) + (py - closestY) * (py - closestY));
}

// Start the game loop
setInterval(updateSnake, 16); // ~60 FPS
