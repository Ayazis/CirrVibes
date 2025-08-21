// Logic for drawing the 3D scene
import { mat4 } from './mat4.js';

export const draw3DScene = (gl, canvas) => {
  // Clear the canvas
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Enable depth testing
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);

  // Define unique vertices for each face (no sharing, so each face is a solid color)
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

  const vertexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

  const colorBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, colorArray, gl.STATIC_DRAW);

  // No index buffer needed, we use gl.drawArrays

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
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);

  const colorLocation = gl.getAttribLocation(program, 'color');
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.enableVertexAttribArray(colorLocation);
  gl.vertexAttribPointer(colorLocation, 4, gl.FLOAT, false, 0, 0);

  const modelViewMatrix = mat4.create();
  const projectionMatrix = mat4.create();
  mat4.perspective(projectionMatrix, Math.PI / 4, canvas.width / canvas.height, 0.1, 100.0);
  mat4.translate(modelViewMatrix, modelViewMatrix, [0.0, 0.0, -2.0]);

  const modelViewMatrixLocation = gl.getUniformLocation(program, 'modelViewMatrix');
  const projectionMatrixLocation = gl.getUniformLocation(program, 'projectionMatrix');
  gl.uniformMatrix4fv(modelViewMatrixLocation, false, modelViewMatrix);
  gl.uniformMatrix4fv(projectionMatrixLocation, false, projectionMatrix);

  gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 3);

  // Add a rotating animation to demonstrate 3D rendering
  let angle = 0;
  function animate() {
    angle += 0.01;
    mat4.rotate(modelViewMatrix, modelViewMatrix, angle, [0.5, 1.0, 0.0]);
    gl.uniformMatrix4fv(modelViewMatrixLocation, false, modelViewMatrix);

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 3);

    requestAnimationFrame(animate);
  }
  animate();
};
