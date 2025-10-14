// Logic for drawing the scene - Achtung die Kurve style (instanced segment quad expansion)
import { mat4 } from './mat4.js';

export const drawScene = (gl, canvas) => {
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  if (!window.gameState) {
    function generateRandomStartingPosition() {
      const viewSize = 10;
      const aspect = canvas.width / canvas.height;
      const horizontalBoundary = viewSize * aspect;
      const verticalBoundary = viewSize;
      const safeMargin = 1;
      const x = (Math.random() - 0.5) * 2 * (horizontalBoundary - safeMargin);
      const y = (Math.random() - 0.5) * 2 * (verticalBoundary - safeMargin);
      const direction = Math.random() * 360;
      return { x, y, direction };
    }
const maxPlayers = 8;
window.gameState = {};
for (let i = 1; i <= maxPlayers; i++) {
  const start = generateRandomStartingPosition();
  window.gameState[`player${i}`] = {
    snakePosition: { x: start.x, y: start.y },
    snakeDirection: start.direction,
    trail: window.Trail ? new window.Trail(1000, start.x, start.y) : [{ x: start.x, y: start.y }],
    isAlive: true,
    color: [Math.random(), Math.random(), Math.random(), 1.0] // Random color for each player
  };
}
  }

  // Buffer setup
  const segmentBuffer = gl.createBuffer();

  // Vertex shader for quad expansion (each segment = 4 vertices, 2 triangles)
  const vertexShaderSource = `
    attribute vec2 start;
    attribute vec2 end;
    attribute float corner; // 0, 1, 2, 3 for quad corners
    uniform float trailWidth;
    uniform vec4 baseColor;
    uniform mat4 modelViewMatrix;
    uniform mat4 projectionMatrix;
    void main() {
      vec2 dir = normalize(end - start);
      vec2 perp = vec2(-dir.y, dir.x) * trailWidth;
      vec2 pos;
      if (corner == 0.0) pos = start - perp;
      else if (corner == 1.0) pos = start + perp;
      else if (corner == 2.0) pos = end + perp;
      else pos = end - perp;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 0.0, 1.0);
    }
  `;
  const fragmentShaderSource = `
    precision mediump float;
    uniform vec4 baseColor;
    void main() {
      gl_FragColor = baseColor;
    }
  `;

  // Shader/program setup
  const vertexShader = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vertexShader, vertexShaderSource);
  gl.compileShader(vertexShader);
  if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {}

  const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fragmentShader, fragmentShaderSource);
  gl.compileShader(fragmentShader);
  if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {}

  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {}

  gl.useProgram(program);

  const startLocation = gl.getAttribLocation(program, 'start');
  const endLocation = gl.getAttribLocation(program, 'end');
  const cornerLocation = gl.getAttribLocation(program, 'corner');
  const trailWidthLocation = gl.getUniformLocation(program, 'trailWidth');
  const baseColorLocation = gl.getUniformLocation(program, 'baseColor');
  const modelViewMatrixLocation = gl.getUniformLocation(program, 'modelViewMatrix');
  const projectionMatrixLocation = gl.getUniformLocation(program, 'projectionMatrix');

  const modelViewMatrix = mat4.create();
  const projectionMatrix = mat4.create();

  const viewSize = 10;
  const applyMatrices = () => {
    const aspect = canvas.width / canvas.height;
    const horizontalBoundary = viewSize * aspect;
    const verticalBoundary = viewSize;
    mat4.identity(modelViewMatrix);
    mat4.ortho(
      projectionMatrix,
      -horizontalBoundary,
      horizontalBoundary,
      -verticalBoundary,
      verticalBoundary,
      -1,
      1
    );
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniformMatrix4fv(modelViewMatrixLocation, false, modelViewMatrix);
    gl.uniformMatrix4fv(projectionMatrixLocation, false, projectionMatrix);
  };

  applyMatrices();

  window.addEventListener('resize', () => {
    gl.canvas.width = window.innerWidth * 0.8;
    gl.canvas.height = window.innerHeight * 0.8;
    applyMatrices();
  });

  function animate() {
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    applyMatrices();

    const state = window.gameState;
    if (!state) {
      requestAnimationFrame(animate);
      return;
    }

    // Build quad buffer: for each segment, 4 vertices (start/end/corner)
    function extractQuads(trail) {
      const quads = [];
      if (!trail || typeof trail.get !== 'function' || typeof trail.length !== 'number') return quads;
      for (let i = 1; i < trail.length; i++) {
        const prev = trail.get(i - 1);
        const curr = trail.get(i);
        if (!prev || !curr || prev.x === undefined || prev.y === undefined || curr.x === undefined || curr.y === undefined) continue;
        // Build two triangles per segment (6 vertices: 0-1-2, 0-2-3)
        quads.push(prev.x, prev.y, curr.x, curr.y, 0);
        quads.push(prev.x, prev.y, curr.x, curr.y, 1);
        quads.push(prev.x, prev.y, curr.x, curr.y, 2);
        quads.push(prev.x, prev.y, curr.x, curr.y, 0);
        quads.push(prev.x, prev.y, curr.x, curr.y, 2);
        quads.push(prev.x, prev.y, curr.x, curr.y, 3);
      }
      return quads;
    }

Object.keys(state).forEach(playerKey => {
  const player = state[playerKey];
  const playerQuads = extractQuads(player.trail);
  if (playerQuads.length > 0) {
    const quadArray = new Float32Array(playerQuads);
    gl.bindBuffer(gl.ARRAY_BUFFER, segmentBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, quadArray, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(startLocation);
    gl.vertexAttribPointer(startLocation, 2, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(endLocation);
    gl.vertexAttribPointer(endLocation, 2, gl.FLOAT, false, 20, 8);
    gl.enableVertexAttribArray(cornerLocation);
    gl.vertexAttribPointer(cornerLocation, 1, gl.FLOAT, false, 20, 16);
    gl.uniform1f(trailWidthLocation, 0.05);
    gl.uniform4fv(baseColorLocation, player.color);
    gl.drawArrays(gl.TRIANGLES, 0, quadArray.length / 5);
  }
});

    requestAnimationFrame(animate);
  }

  animate();
};
