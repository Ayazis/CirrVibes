// Logic for drawing the scene - Achtung die Kurve style (instanced segment quad expansion)
import { mat4 } from './mat4.js';
import { resizeCanvasToDisplaySize } from './gameCanvas.js';

const TRAIL_WIDTH = 0.05;
const VERTS_PER_SEGMENT = 6;
const FLOATS_PER_VERTEX = 5;
const FLOATS_PER_SEGMENT = VERTS_PER_SEGMENT * FLOATS_PER_VERTEX;
const CORNER_SEQUENCE = new Float32Array([0, 1, 2, 0, 2, 3]);

export const drawScene = (gl, canvas) => {
  if (!gl || !canvas) return;

  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  const segmentBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, segmentBuffer);

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

  const compileShader = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  };

  const vertexShader = compileShader(gl.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
  if (!vertexShader || !fragmentShader) return;

  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return;
  }
  gl.useProgram(program);

  const startLocation = gl.getAttribLocation(program, 'start');
  const endLocation = gl.getAttribLocation(program, 'end');
  const cornerLocation = gl.getAttribLocation(program, 'corner');
  const trailWidthLocation = gl.getUniformLocation(program, 'trailWidth');
  const baseColorLocation = gl.getUniformLocation(program, 'baseColor');
  const modelViewMatrixLocation = gl.getUniformLocation(program, 'modelViewMatrix');
  const projectionMatrixLocation = gl.getUniformLocation(program, 'projectionMatrix');

  gl.enableVertexAttribArray(startLocation);
  gl.enableVertexAttribArray(endLocation);
  gl.enableVertexAttribArray(cornerLocation);
  gl.vertexAttribPointer(startLocation, 2, gl.FLOAT, false, FLOATS_PER_VERTEX * 4, 0);
  gl.vertexAttribPointer(endLocation, 2, gl.FLOAT, false, FLOATS_PER_VERTEX * 4, 8);
  gl.vertexAttribPointer(cornerLocation, 1, gl.FLOAT, false, FLOATS_PER_VERTEX * 4, 16);

  let modelViewMatrix = mat4.create();
  let projectionMatrix = mat4.create();

  let quadScratch = new Float32Array(FLOATS_PER_SEGMENT * 16);
  let bufferCapacityChanged = true;
  let needsViewUpdate = true;
  let lastDpr = window.devicePixelRatio || 1;

  const prevPoint = { x: 0, y: 0 };
  const currPoint = { x: 0, y: 0 };

  const ensureScratchCapacity = (requiredFloats) => {
    if (requiredFloats <= quadScratch.length) return;
    let newLength = quadScratch.length || FLOATS_PER_SEGMENT;
    while (newLength < requiredFloats) newLength *= 2;
    quadScratch = new Float32Array(newLength);
    bufferCapacityChanged = true;
  };

  const writeSegment = (offset, ax, ay, bx, by) => {
    for (let i = 0; i < CORNER_SEQUENCE.length; i++) {
      quadScratch[offset++] = ax;
      quadScratch[offset++] = ay;
      quadScratch[offset++] = bx;
      quadScratch[offset++] = by;
      quadScratch[offset++] = CORNER_SEQUENCE[i];
    }
    return offset;
  };

  const buildTrailVertices = (trail) => {
    if (!trail || typeof trail.length !== 'number' || trail.length < 2) return 0;
    const segmentCount = trail.length - 1;
    const requiredFloats = segmentCount * FLOATS_PER_SEGMENT;
    ensureScratchCapacity(requiredFloats);

    let offset = 0;
    if (typeof trail.get === 'function') {
      for (let i = 1; i < trail.length; i++) {
        const prev = trail.get(i - 1, prevPoint);
        const curr = trail.get(i, currPoint);
        if (!prev || !curr) continue;
        offset = writeSegment(offset, prev.x, prev.y, curr.x, curr.y);
      }
    } else if (Array.isArray(trail)) {
      for (let i = 1; i < trail.length; i++) {
        const prev = trail[i - 1];
        const curr = trail[i];
        if (!prev || !curr || typeof prev.x !== 'number' || typeof curr.x !== 'number') continue;
        offset = writeSegment(offset, prev.x, prev.y, curr.x, curr.y);
      }
    }
    return offset;
  };

  const updateView = () => {
    if (!canvas.width || !canvas.height) return;
    gl.viewport(0, 0, canvas.width, canvas.height);

    if (!modelViewMatrix) modelViewMatrix = mat4.create();
    if (!projectionMatrix) projectionMatrix = mat4.create();
    mat4.identity(modelViewMatrix);

    const state = window.gameState;
    const viewSize = state?.viewSize ?? 10;
    const aspect = canvas.width / canvas.height;
    const horizontalBoundary = viewSize * aspect;
    const verticalBoundary = viewSize;

    mat4.ortho(
      projectionMatrix,
      -horizontalBoundary,
      horizontalBoundary,
      -verticalBoundary,
      verticalBoundary,
      -1,
      1
    );

    gl.uniformMatrix4fv(modelViewMatrixLocation, false, modelViewMatrix);
    gl.uniformMatrix4fv(projectionMatrixLocation, false, projectionMatrix);

    if (state) {
      state.viewBounds = {
        minX: -horizontalBoundary,
        maxX: horizontalBoundary,
        minY: -verticalBoundary,
        maxY: verticalBoundary
      };
      if (state.occupancyGrid) {
        state.occupancyGrid.updateBounds(
          state.viewBounds.minX,
          state.viewBounds.maxX,
          state.viewBounds.minY,
          state.viewBounds.maxY,
          state.players,
          state.frameCounter
        );
      }
    }
  };

  window.addEventListener('resize', () => {
    needsViewUpdate = true;
  });

  const renderFrame = () => {
    if (resizeCanvasToDisplaySize(canvas)) {
      needsViewUpdate = true;
    }

    const currentDpr = window.devicePixelRatio || 1;
    if (currentDpr !== lastDpr) {
      lastDpr = currentDpr;
      needsViewUpdate = true;
    }

    if (needsViewUpdate) {
      updateView();
      needsViewUpdate = false;
    }

    gl.clear(gl.COLOR_BUFFER_BIT);

    const state = window.gameState;
    const players = state?.players;
    if (!players || players.length === 0) {
      requestAnimationFrame(renderFrame);
      return;
    }

    gl.uniform1f(trailWidthLocation, TRAIL_WIDTH);

    for (let i = 0; i < players.length; i++) {
      const player = players[i];
      const usedFloats = buildTrailVertices(player.trail);
      if (usedFloats === 0) continue;

      if (bufferCapacityChanged) {
        gl.bufferData(gl.ARRAY_BUFFER, quadScratch.byteLength, gl.DYNAMIC_DRAW);
        bufferCapacityChanged = false;
      }

      gl.bufferSubData(gl.ARRAY_BUFFER, 0, quadScratch.subarray(0, usedFloats));
      gl.uniform4fv(baseColorLocation, player.color);
      gl.drawArrays(gl.TRIANGLES, 0, usedFloats / FLOATS_PER_VERTEX);
    }

    requestAnimationFrame(renderFrame);
  };

  requestAnimationFrame(renderFrame);
};
