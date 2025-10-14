# Performance TODOs — CirrVibes

This file lists prioritized, actionable performance and memory optimizations for the snake/trail rendering and collision logic. Each item includes why it helps, rough effort level, estimated impact, and a short test/validation plan.

## Goal
- Reduce per-frame allocations and GC pressure
- Lower CPU time in collision checks and geometry building
- Keep gameplay identical (visuals & collisions) while improving throughput

---

## Priority A — High impact, low-to-medium effort

1) Replace array `shift()` with a ring buffer for trails
   - Why: `Array.shift()` is O(n) when removing the oldest element and causes reindexing/allocations. A ring buffer gives O(1) append and overwrite of old entries.
   - Files: `script.js`, `src/drawScene.js` (trail reads/writes)
   - Effort: small — implement a minimal circular buffer API: `push(x,y)`, `forEach(callback)`, `length`, and `clear()`.
   - Estimated impact: large reduction in CPU & GC once trails hit the cap (1000).
   - Test: verify trail length behavior, visual continuity of trails after wrap, and collision behavior unchanged.

2) Store trail points in typed arrays (Float32Array) instead of JS objects
   - Why: Each `{x,y}` JS object is heavy and GC-intensive. Packing coordinates in Float32Array drastically reduces heap churn and memory.
   - Files: `script.js`, `src/drawScene.js` (trail iteration & rendering)
   - Effort: medium — integrate with ring buffer or use single Float32Array per trail with head/tail indices.
   - Estimated impact: reduces heap usage for trail storage by multiplex and reduces GC.
   - Test: heap snapshot before/after, visual compare, ensure collision math uses float accessors.

3) Use squared-distance math (avoid Math.sqrt) in collision tests
   - Why: `Math.sqrt` is relatively costly; comparing squared distances avoids it.
   - Files: `script.js` (`distanceToLineSegment`, `checkTrailSegmentCollision`)
   - Effort: trivial — rewrite distance math using squared distances and early rejects.
   - Estimated impact: moderate CPU reduction in collision-heavy scenarios.
   - Test: run unit checks comparing old and new results numerically; compare gameplay behavior.

---

## Priority B — Medium impact, medium effort

4) Preallocate vertex and color typed arrays and reuse each frame
   - Why: Converting large JS arrays to Float32Array each frame allocates big ephemeral typed arrays. Preallocate a max-size Float32Array and write into it to avoid allocations.
   - Files: `src/drawScene.js`
   - Effort: medium — precompute a maximum size based on `maxTrailPoints` and write directly into arrays using an index pointer.
   - Estimated impact: large reduction in per-frame ephemeral allocations (hundreds of KB per frame saved).
   - Test: measure allocation rate before/after in DevTools Allocation instrumentation.

5) Use `gl.DYNAMIC_DRAW` and `gl.bufferSubData` instead of `gl.STATIC_DRAW` per-frame uploads
   - Why: `STATIC_DRAW` suggests immutable buffers; using dynamic draws plus subdata reduces internal driver churn and is semantically correct for per-frame updates.
   - Files: `src/drawScene.js`
   - Effort: small — change usage hint and call `gl.bufferSubData` with the slice you updated.
   - Estimated impact: medium; better GPU-driver performance and fewer implicit reallocations.
   - Test: verify rendering identical; look for fewer driver allocations in profiling if available.

6) Compute per-segment perpendicular once (on new segment) and reuse for rendering
   - Why: Currently dx/dy/length/perp are recomputed every frame even for unchanged segments. Store normal vectors when adding trail points.
   - Files: `script.js` (on push), `src/drawScene.js` (use stored normals)
   - Effort: medium — store two floats per segment for perpX/perpY when the segment is created.
   - Estimated impact: reduces CPU in rendering loop.
   - Test: visual compare and CPU trace.

---

## Priority C — Larger changes / advanced

7) Spatial hashing / grid for collision checks
   - Why: Limits collision tests to nearby segments rather than all segments (O(k) instead of O(S)). Large benefit when trails are long.
   - Files: `script.js` (collision detection), may touch `src/drawScene.js` if storing indices
   - Effort: medium-to-large — implement uniform grid keyed by integer cell coords; when adding segments insert into grid lists; when checking head, only test segments in nearby cells.
   - Estimated impact: large for long trails; minimal for short trails.
   - Test: correctness vs brute-force, CPU profiling.

8) Use indexed geometry / triangle strips or GPU instancing for segments
   - Why: Reduces vertex duplication and CPU-side triangle assembly; shifting some work to the GPU improves throughput.
   - Files: `src/drawScene.js`, shaders
   - Effort: large — requires changing how geometry is assembled and shader inputs.
   - Estimated impact: large for rendering-heavy scenes.
   - Test: visual parity, perf profiling.

---

## Implementation notes / compatibility
- Keep the public `window.gameState` shape stable where possible; encapsulate internal trail storage in a small wrapper object so `drawScene` and collision code can migrate smoothly.
- Start with Priority A and 3 (ring buffer + typed trails + squared distance) — these combine for the largest, lowest-risk win.

## Quick tests to add
1. Unit test for point-to-segment squared distance vs original implementation (small JS test in repo or console snippet).
2. Smoke test: replay a recorded input sequence to assert same death frame between old and new implementations.
3. DevTools recording: record allocations & CPU before and after changes for a 30s play session.

## Rollout plan
1. Implement A1 (ring buffer) and A3 (squared distances). Run smoke tests.
2. Convert trails to Float32Array (A2). Run heap snapshot & perf tests.
3. Implement B4/B5 (prealloc typed arrays + DYNAMIC_DRAW). Measure improvements.
4. Consider spatial hashing (C7) if collision time remains a hotspot.

---

If you want, I can start implementing the Priority A items now (ring buffer + squared-distance fix). Tell me to proceed and I will apply patches and run quick validation checks.
