// Logic for drawing the 3D scene - Achtung die Curve style
import { mat4 } from './mat4.js';

export const draw3DScene = (gl, canvas) => {
  // Clear the canvas
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Enable depth testing
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);

  // Initialize game state if not exists
  if (!window.gameState) {
    window.gameState = {
      snakePosition: { x: 0, y: 0 },
      snakeDirection: 0,
      trail: [{ x: 0, y: 0 }],
      isAlive: true
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

  const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fragmentShader, fragmentShaderSource);
  gl.compileShader(fragmentShader);

  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
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
    if (!state || !state.trail || state.trail.length < 2) {
      requestAnimationFrame(animate);
      return;
    }

    // Create trail geometry from trail points
    const trailWidth = 0.05;
    const vertices = [];
    const colors = [];
    
    // Generate trail segments
    for (let i = 0; i < state.trail.length - 1; i++) {
      const current = state.trail[i];
      const next = state.trail[i + 1];
      
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
      
      // Color based on position in trail (newer = brighter)
      const intensity = (i / state.trail.length) * 0.8 + 0.2;
      const color = [intensity, intensity, intensity, 1.0];
      
      // Add colors for both triangles (6 vertices)
      for (let j = 0; j < 6; j++) {
        colors.push(...color);
      }
    }
    
    // Draw snake head (current position)
    const headSize = 0.08;
    const headX = state.snakePosition.x;
    const headY = state.snakePosition.y;
    
    // Head quad
    vertices.push(
      headX - headSize, headY - headSize, 0.01,
      headX + headSize, headY - headSize, 0.01,
      headX - headSize, headY + headSize, 0.01,
      
      headX + headSize, headY - headSize, 0.01,
      headX + headSize, headY + headSize, 0.01,
      headX - headSize, headY + headSize, 0.01
    );
    
    // Head color (bright red)
    const headColor = [1.0, 0.2, 0.2, 1.0];
    for (let j = 0; j < 6; j++) {
      colors.push(...headColor);
    }

    if (vertices.length === 0) {
      requestAnimationFrame(animate);
      return;
    }

    const verticesArray = new Float32Array(vertices);
    const colorsArray = new Float32Array(colors);

    // Set up matrices for 2D view
    const modelViewMatrix = mat4.create();
    const projectionMatrix = mat4.create();
    
    // Orthographic projection for 2D view
    const aspect = canvas.width / canvas.height;
    const viewSize = 3;
    mat4.ortho(projectionMatrix, 
      -viewSize * aspect, viewSize * aspect,  // left, right
      -viewSize, viewSize,                    // bottom, top
      -1, 1                                   // near, far
    );
    
    // Center the view on the snake
    mat4.translate(modelViewMatrix, modelViewMatrix, [-headX, -headY, 0]);

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
