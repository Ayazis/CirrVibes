// Logic for drawing the 3D scene
import { mat4 } from './mat4.js';

export const draw3DScene = (gl, canvas) => {
  // Clear the canvas
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Enable depth testing
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);

  // Cube geometry (player)
  const faceVertices = [
    // Front face (red)
    [-0.5, -0.5,  0.5],
     [0.5, -0.5,  0.5],
     [0.5,  0.5,  0.5],
    [-0.5, -0.5,  0.5],
     [0.5,  0.5,  0.5],
    [-0.5,  0.5,  0.5],

    // Back face (green)
    [-0.5, -0.5, -0.5],
    [-0.5,  0.5, -0.5],
     [0.5,  0.5, -0.5],
    [-0.5, -0.5, -0.5],
     [0.5,  0.5, -0.5],
     [0.5, -0.5, -0.5],

    // Top face (yellow)
    [-0.5,  0.5, -0.5],
    [-0.5,  0.5,  0.5],
     [0.5,  0.5,  0.5],
    [-0.5,  0.5, -0.5],
     [0.5,  0.5,  0.5],
     [0.5,  0.5, -0.5],

    // Bottom face (blue)
    [-0.5, -0.5, -0.5],
     [0.5, -0.5, -0.5],
     [0.5, -0.5,  0.5],
    [-0.5, -0.5, -0.5],
     [0.5, -0.5,  0.5],
    [-0.5, -0.5,  0.5],

    // Right face (cyan)
     [0.5, -0.5, -0.5],
     [0.5,  0.5, -0.5],
     [0.5,  0.5,  0.5],
     [0.5, -0.5, -0.5],
     [0.5,  0.5,  0.5],
     [0.5, -0.5,  0.5],

    // Left face (magenta)
    [-0.5, -0.5, -0.5],
    [-0.5, -0.5,  0.5],
    [-0.5,  0.5,  0.5],
    [-0.5, -0.5, -0.5],
    [-0.5,  0.5,  0.5],
    [-0.5,  0.5, -0.5],
  ];
  const vertices = new Float32Array(faceVertices.flat());

  // Per-face colors (same color for all 6 vertices of each face)
  const faceColors = [
    [1.0, 0.0, 0.0, 1.0], // Front: Red
    [0.0, 1.0, 0.0, 1.0], // Back: Green
    [1.0, 1.0, 0.0, 1.0], // Top: Yellow
    [0.0, 0.0, 1.0, 1.0], // Bottom: Blue
    [0.0, 1.0, 1.0, 1.0], // Right: Cyan
    [1.0, 0.0, 1.0, 1.0], // Left: Magenta
  ];
  const colors = [];
  for (let f = 0; f < 6; ++f) {
    for (let v = 0; v < 6; ++v) {
      colors.push(...faceColors[f]);
    }
  }
  const colorArray = new Float32Array(colors);

  // Trail state
  let trailLength = 0.5;
  let trailSpeed = 0.01;
  let trailPos = [0, 0, 0];
  let trailDir = [1, 0, 0];

  // Vertex/Color buffer setup
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

  // Animation state
  let angle = 0;
  function animate() {
    angle += 0.01;
    trailLength += trailSpeed;
    // The start point is static at x=0, only the end grows forward
    // Wobble left/right (y axis) as it grows (x axis)
    const scale = 0.24; // 24% of original size (100% - 76%)
    const halfHeight = 0.2 * scale;
    const halfWidth = 0.2 * scale;
    const x0 = 0;
    const x1 = trailLength;
    const wobble = Math.sin(trailLength * 2) * 1.5;
    // Vertices for a stretched cube (trail)
    const trailVertices = [
      // Front face (white)
      [x0, -halfHeight + wobble,  halfWidth],
      [x1, -halfHeight + wobble,  halfWidth],
      [x1,  halfHeight + wobble,  halfWidth],
      [x0, -halfHeight + wobble,  halfWidth],
      [x1,  halfHeight + wobble,  halfWidth],
      [x0,  halfHeight + wobble,  halfWidth],

      // Back face (gray)
      [x0, -halfHeight + wobble, -halfWidth],
      [x0,  halfHeight + wobble, -halfWidth],
      [x1,  halfHeight + wobble, -halfWidth],
      [x0, -halfHeight + wobble, -halfWidth],
      [x1,  halfHeight + wobble, -halfWidth],
      [x1, -halfHeight + wobble, -halfWidth],

      // Top face (light gray)
      [x0,  halfHeight + wobble, -halfWidth],
      [x0,  halfHeight + wobble,  halfWidth],
      [x1,  halfHeight + wobble,  halfWidth],
      [x0,  halfHeight + wobble, -halfWidth],
      [x1,  halfHeight + wobble,  halfWidth],
      [x1,  halfHeight + wobble, -halfWidth],

      // Bottom face (dark gray)
      [x0, -halfHeight + wobble, -halfWidth],
      [x1, -halfHeight + wobble, -halfWidth],
      [x1, -halfHeight + wobble,  halfWidth],
      [x0, -halfHeight + wobble, -halfWidth],
      [x1, -halfHeight + wobble,  halfWidth],
      [x0, -halfHeight + wobble,  halfWidth],

      // Right face (blue)
      [x1, -halfHeight + wobble, -halfWidth],
      [x1,  halfHeight + wobble, -halfWidth],
      [x1,  halfHeight + wobble,  halfWidth],
      [x1, -halfHeight + wobble, -halfWidth],
      [x1,  halfHeight + wobble,  halfWidth],
      [x1, -halfHeight + wobble,  halfWidth],

      // Left face (red)
      [x0, -halfHeight + wobble, -halfWidth],
      [x0, -halfHeight + wobble,  halfWidth],
      [x0,  halfHeight + wobble,  halfWidth],
      [x0, -halfHeight + wobble, -halfWidth],
      [x0,  halfHeight + wobble,  halfWidth],
      [x0,  halfHeight + wobble, -halfWidth],
    ];
    const trailVerticesFlat = new Float32Array(trailVertices.flat());

    // Trail colors
    const trailFaceColors = [
      [1.0, 1.0, 1.0, 1.0], // Front: White
      [0.5, 0.5, 0.5, 1.0], // Back: Gray
      [0.8, 0.8, 0.8, 1.0], // Top: Light gray
      [0.2, 0.2, 0.2, 1.0], // Bottom: Dark gray
      [0.0, 0.0, 1.0, 1.0], // Right: Blue
      [1.0, 0.0, 0.0, 1.0], // Left: Red
    ];
    const trailColors = [];
    for (let f = 0; f < 6; ++f) {
      for (let v = 0; v < 6; ++v) {
        trailColors.push(...trailFaceColors[f]);
      }
    }
    const trailColorArray = new Float32Array(trailColors);

    // Model/view/projection for trail
    const trailModelViewMatrix = mat4.create();
    const trailProjectionMatrix = mat4.create();
    mat4.perspective(trailProjectionMatrix, Math.PI / 4, canvas.width / canvas.height, 0.1, 100.0);
    mat4.translate(trailModelViewMatrix, trailModelViewMatrix, [0, 0, -8.0]);
    // Rotate around the x-axis (longest axis)
    mat4.rotate(trailModelViewMatrix, trailModelViewMatrix, angle, [1, 0, 0]);

    gl.uniformMatrix4fv(modelViewMatrixLocation, false, trailModelViewMatrix);
    gl.uniformMatrix4fv(projectionMatrixLocation, false, trailProjectionMatrix);

    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, trailVerticesFlat, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, trailColorArray, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(colorLocation);
    gl.vertexAttribPointer(colorLocation, 4, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, trailVerticesFlat.length / 3);

    requestAnimationFrame(animate);
  }
  animate();
};
