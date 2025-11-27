// Circular-buffer trail storage for snake positions.
export class Trail {
  constructor(capacity = 1024, startX = 0, startY = 0) {
    this._cap = Math.max(1, capacity);
    this._data = new Float32Array(this._cap * 2);
    this._start = 0;
    this._count = 0;
    if (typeof startX === "number" && typeof startY === "number") {
      this.push(startX, startY);
    }
  }

  _grow() {
    const newCap = this._cap * 2;
    const newData = new Float32Array(newCap * 2);
    for (let i = 0; i < this._count; i++) {
      const idx = (this._start + i) % this._cap;
      const oldPos = idx * 2;
      const newPos = i * 2;
      newData[newPos] = this._data[oldPos];
      newData[newPos + 1] = this._data[oldPos + 1];
    }
    this._data = newData;
    this._cap = newCap;
    this._start = 0;
  }

  push(x, y) {
    if (this._count >= this._cap) {
      this._grow();
    }
    const idx = (this._start + this._count) % this._cap;
    const p = idx * 2;
    this._data[p] = x;
    this._data[p + 1] = y;
    this._count++;
  }

  forEach(cb) {
    for (let i = 0; i < this._count; i++) {
      const idx = (this._start + i) % this._cap;
      const p = idx * 2;
      cb(this._data[p], this._data[p + 1], i);
    }
  }

  get(i, out) {
    if (i < 0 || i >= this._count) return undefined;
    const idx = (this._start + i) % this._cap;
    const p = idx * 2;
    const target = out ?? { x: 0, y: 0 };
    target.x = this._data[p];
    target.y = this._data[p + 1];
    return target;
  }

  peekLast(out) {
    if (this._count === 0) return undefined;
    return this.get(this._count - 1, out);
  }

  clear() {
    this._start = 0;
    this._count = 0;
  }

  get length() {
    return this._count;
  }
}
