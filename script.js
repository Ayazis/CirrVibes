// Basic setup for the game canvas
const canvas = document.getElementById('gameCanvas');
const mat4 = {
  create: () => new Float32Array(16).fill(0).map((_, i) => (i % 5 === 0 ? 1 : 0)),
  perspective: (out, fovy, aspect, near, far) => {
    const f = 1.0 / Math.tan(fovy / 2);
    out[0] = f / aspect;
    out[5] = f;
    out[10] = (far + near) / (near - far);
    out[11] = -1;
    out[14] = (2 * far * near) / (near - far);
    out[15] = 0;
    return out;
  },
  translate: (out, a, v) => {
    out[12] = a[12] + v[0];
    out[13] = a[13] + v[1];
    out[14] = a[14] + v[2];
    return out;
  },
  rotate: (out, a, rad, axis) => {
    const [x, y, z] = axis;
    const len = Math.hypot(x, y, z);
    const s = Math.sin(rad);
    const c = Math.cos(rad);
    const t = 1 - c;

    if (len === 0) return null;

    const nx = x / len, ny = y / len, nz = z / len;

    out[0] = c + t * nx * nx;
    out[1] = t * nx * ny - s * nz;
    out[2] = t * nx * nz + s * ny;

    out[4] = t * nx * ny + s * nz;
    out[5] = c + t * ny * ny;
    out[6] = t * ny * nz - s * nx;

    out[8] = t * nx * nz - s * ny;
    out[9] = t * ny * nz + s * nx;
    out[10] = c + t * nz * nz;

    return out;
  },
};
const gl = canvas.getContext('webgl');

// Set canvas dimensions
canvas.width = window.innerWidth * 0.8;
canvas.height = window.innerHeight * 0.8;

// Placeholder for game initialization
function initGame() {
  console.log('Game initialized');
  draw3DScene();
}

// Draw the 3D scene
function draw3DScene() {
  // Clear the canvas
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Enable depth testing
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);

  // Define vertices for a 3D cube
  const vertices = new Float32Array([
    -0.5, -0.5, -0.5,
     0.5, -0.5, -0.5,
     0.5,  0.5, -0.5,
    -0.5,  0.5, -0.5,
    -0.5, -0.5,  0.5,
     0.5, -0.5,  0.5,
     0.5,  0.5,  0.5,
    -0.5,  0.5,  0.5,
  ]);

  const indices = new Uint16Array([
    0, 1, 2, 0, 2, 3, // Front face
    4, 5, 6, 4, 6, 7, // Back face
    0, 1, 5, 0, 5, 4, // Bottom face
    2, 3, 7, 2, 7, 6, // Top face
    0, 3, 7, 0, 7, 4, // Left face
    1, 2, 6, 1, 6, 5, // Right face
  ]);

  const vertexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

  const vertexShaderSource = `
    attribute vec3 position;
    uniform mat4 modelViewMatrix;
    uniform mat4 projectionMatrix;
    void main() {
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const fragmentShaderSource = `
    void main() {
      gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
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
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);

  const modelViewMatrix = mat4.create();
  const projectionMatrix = mat4.create();
  mat4.perspective(projectionMatrix, Math.PI / 4, canvas.width / canvas.height, 0.1, 100.0);
  mat4.translate(modelViewMatrix, modelViewMatrix, [0.0, 0.0, -2.0]);

  const modelViewMatrixLocation = gl.getUniformLocation(program, 'modelViewMatrix');
  const projectionMatrixLocation = gl.getUniformLocation(program, 'projectionMatrix');
  gl.uniformMatrix4fv(modelViewMatrixLocation, false, modelViewMatrix);
  gl.uniformMatrix4fv(projectionMatrixLocation, false, projectionMatrix);

  gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);

  // Add a rotating animation to demonstrate 3D rendering
  let angle = 0;
  function animate() {
    angle += 0.01;
  mat4.rotate(modelViewMatrix, modelViewMatrix, angle, [0.5, 1.0, 0.0]);
    gl.uniformMatrix4fv(modelViewMatrixLocation, false, modelViewMatrix);

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);

    requestAnimationFrame(animate);
  }
  animate();
}

// Start the game
initGame();
