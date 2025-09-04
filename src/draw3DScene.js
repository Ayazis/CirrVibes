// Logic for drawing the 3D scene - Achtung die Curve style
import { mat4 } from './mat4.js';

export const draw3DScene = (gl, canvas) => {
  // Clear the canvas
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Enable depth testing
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  
  // Enable alpha blending for transparency effects
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  // Initialize game state if not exists
  if (!window.gameState) {
    window.gameState = {
      player1: {
        snakePosition: { x: -2, y: 0 },
        snakeDirection: 0,
        trail: [{ x: -2, y: 0 }],
        isAlive: true,
        color: [1.0, 0.2, 0.2, 1.0]
      },
      player2: {
        snakePosition: { x: 2, y: 0 },
        snakeDirection: 180,
        trail: [{ x: 2, y: 0 }],
        isAlive: true,
        color: [0.2, 0.2, 1.0, 1.0]
      }
    };
  }

  // Buffer setup
  const vertexBuffer = gl.createBuffer();
  const colorBuffer = gl.createBuffer();

  // Shader sources
  const vertexShaderSource = `
    attribute vec3 position;
    attribute vec4 color;
    varying vec4 vColor;
    uniform mat4 modelViewMatrix;
    uniform mat4 projectionMatrix;
    void main() {
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      vColor = color;
    }
  `;
  const fragmentShaderSource = `
    precision mediump float;
    varying vec4 vColor;
    void main() {
      gl_FragColor = vColor;
    }
  `;

  // Shader/program setup
  const vertexShader = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vertexShader, vertexShaderSource);
  gl.compileShader(vertexShader);
  
  // Check vertex shader compilation
  if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
    // Shader compilation failed
  }

  const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fragmentShader, fragmentShaderSource);
  gl.compileShader(fragmentShader);
  
  // Check fragment shader compilation
  if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
    // Shader compilation failed
  }

  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  
  // Check program linking
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    // Program linking failed
  }
  
  gl.useProgram(program);

  const positionLocation = gl.getAttribLocation(program, 'position');
  const colorLocation = gl.getAttribLocation(program, 'color');
  const modelViewMatrixLocation = gl.getUniformLocation(program, 'modelViewMatrix');
  const projectionMatrixLocation = gl.getUniformLocation(program, 'projectionMatrix');

  function animate() {
    // Clear the canvas for each frame
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const state = window.gameState;
    if (!state) {
      requestAnimationFrame(animate);
      return;
    }

    // Create trail geometry from trail points for both players
    const trailWidth = 0.05;
    const vertices = [];
    const colors = [];
    
    // Helper function to render a player's trail and head
    function renderPlayer(player) {
      // Generate trail segments (only if we have at least 2 points)
      if (player.trail && player.trail.length >= 2) {
        for (let i = 0; i < player.trail.length - 1; i++) {
          const current = player.trail[i];
          const next = player.trail[i + 1];
          
          // Calculate perpendicular direction for trail width
          const dx = next.x - current.x;
          const dy = next.y - current.y;
          const length = Math.sqrt(dx * dx + dy * dy);
          
          if (length === 0) continue;
          
          const perpX = (-dy / length) * trailWidth;
          const perpY = (dx / length) * trailWidth;
          
          // Create quad for this trail segment
          // Triangle 1
          vertices.push(
            current.x - perpX, current.y - perpY, 0,
            current.x + perpX, current.y + perpY, 0,
            next.x - perpX, next.y - perpY, 0
          );
          
          // Triangle 2
          vertices.push(
            current.x + perpX, current.y + perpY, 0,
            next.x + perpX, next.y + perpY, 0,
            next.x - perpX, next.y - perpY, 0
          );
          
          // Color based on position in trail (newer = brighter) and player color
          const intensity = (i / player.trail.length) * 0.6 + 0.4;
          const alpha = player.isAlive ? player.color[3] : player.color[3] * 0.5; // Make dead snakes semi-transparent
          const trailColor = [
            player.color[0] * intensity,
            player.color[1] * intensity,
            player.color[2] * intensity,
            alpha
          ];
          
          // Add colors for both triangles (6 vertices)
          for (let j = 0; j < 6; j++) {
            colors.push(...trailColor);
          }
        }
      }
      
      // Draw player head (current position)
      const headSize = 0.08;
      const headX = player.snakePosition.x;
      const headY = player.snakePosition.y;
      
      // Head quad
      vertices.push(
        headX - headSize, headY - headSize, 0.01,
        headX + headSize, headY - headSize, 0.01,
        headX - headSize, headY + headSize, 0.01,
        
        headX + headSize, headY - headSize, 0.01,
        headX + headSize, headY + headSize, 0.01,
        headX - headSize, headY + headSize, 0.01
      );
      
      // Head color (use player's color, make dead snakes semi-transparent)
      const headColor = [
        player.color[0],
        player.color[1], 
        player.color[2],
        player.isAlive ? player.color[3] : player.color[3] * 0.5
      ];
      for (let j = 0; j < 6; j++) {
        colors.push(...headColor);
      }
    }
    
    // Function to render boundary walls
    function renderBoundaries() {
      const aspect = canvas.width / canvas.height;
      const viewSize = 10;
      const horizontalBoundary = viewSize * aspect;
      const verticalBoundary = viewSize;
      const wallThickness = 0.1;
      const wallColor = [0.5, 0.5, 0.5, 1.0]; // Gray color
      
      // Top wall
      vertices.push(
        -horizontalBoundary, verticalBoundary - wallThickness, 0,
        horizontalBoundary, verticalBoundary - wallThickness, 0,
        -horizontalBoundary, verticalBoundary, 0,
        
        horizontalBoundary, verticalBoundary - wallThickness, 0,
        horizontalBoundary, verticalBoundary, 0,
        -horizontalBoundary, verticalBoundary, 0
      );
      
      // Bottom wall
      vertices.push(
        -horizontalBoundary, -verticalBoundary, 0,
        horizontalBoundary, -verticalBoundary, 0,
        -horizontalBoundary, -verticalBoundary + wallThickness, 0,
        
        horizontalBoundary, -verticalBoundary, 0,
        horizontalBoundary, -verticalBoundary + wallThickness, 0,
        -horizontalBoundary, -verticalBoundary + wallThickness, 0
      );
      
      // Left wall
      vertices.push(
        -horizontalBoundary, -verticalBoundary, 0,
        -horizontalBoundary + wallThickness, -verticalBoundary, 0,
        -horizontalBoundary, verticalBoundary, 0,
        
        -horizontalBoundary + wallThickness, -verticalBoundary, 0,
        -horizontalBoundary + wallThickness, verticalBoundary, 0,
        -horizontalBoundary, verticalBoundary, 0
      );
      
      // Right wall
      vertices.push(
        horizontalBoundary - wallThickness, -verticalBoundary, 0,
        horizontalBoundary, -verticalBoundary, 0,
        horizontalBoundary - wallThickness, verticalBoundary, 0,
        
        horizontalBoundary, -verticalBoundary, 0,
        horizontalBoundary, verticalBoundary, 0,
        horizontalBoundary - wallThickness, verticalBoundary, 0
      );
      
      // Add colors for all wall vertices (24 vertices total = 4 walls * 6 vertices per wall)
      for (let i = 0; i < 24; i++) {
        colors.push(...wallColor);
      }
    }
    
    // Render both players (alive or dead - dead snakes remain visible)
    if (state.player1) {
      renderPlayer(state.player1);
    }
    if (state.player2) {
      renderPlayer(state.player2);
    }
    
    // Render boundary walls
    renderBoundaries();

    // Always render if we have any vertices (at minimum one player head)
    if (vertices.length === 0) {
      requestAnimationFrame(animate);
      return;
    }

    const verticesArray = new Float32Array(vertices);
    const colorsArray = new Float32Array(colors);

    // Set up matrices for 2D view
    const modelViewMatrix = mat4.create();
    const projectionMatrix = mat4.create();
    
    // Orthographic projection for 2D view - static camera showing entire playing field
    const aspect = canvas.width / canvas.height;
    const viewSize = 10; // Increased view size to show more of the playing field
    mat4.ortho(projectionMatrix, 
      -viewSize * aspect, viewSize * aspect,  // left, right
      -viewSize, viewSize,                    // bottom, top
      -1, 1                                   // near, far
    );
    
    // Keep the camera static at the origin - showing both players
    // mat4.translate(modelViewMatrix, modelViewMatrix, [-headX, -headY, 0]);

    gl.uniformMatrix4fv(modelViewMatrixLocation, false, modelViewMatrix);
    gl.uniformMatrix4fv(projectionMatrixLocation, false, projectionMatrix);

    // Bind and draw
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, verticesArray, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, colorsArray, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(colorLocation);
    gl.vertexAttribPointer(colorLocation, 4, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, verticesArray.length / 3);

    requestAnimationFrame(animate);
  }
  
  animate();
};
