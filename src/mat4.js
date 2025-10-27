// Utility functions for matrix operations
const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const pool = [];

export const mat4 = {
  create: () => {
    const out = pool.length ? pool.pop() : new Float32Array(16);
    out.set(IDENTITY);
    return out;
  },
  release: (mat) => {
    if (mat instanceof Float32Array && mat.length === 16) {
      pool.push(mat);
    }
  },
  identity: (out) => {
    out.set(IDENTITY);
    return out;
  },
  ortho: (out, left, right, bottom, top, near, far) => {
    const lr = 1 / (left - right);
    const bt = 1 / (bottom - top);
    const nf = 1 / (near - far);
    out[0] = -2 * lr;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = -2 * bt;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = 2 * nf;
    out[11] = 0;
    out[12] = (left + right) * lr;
    out[13] = (top + bottom) * bt;
    out[14] = (far + near) * nf;
    out[15] = 1;
    return out;
  },
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
