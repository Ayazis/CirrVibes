# Refactor TODO

## Prep

- Create base modules: `src/constants.js` (VIEW*SIZE, TRAIL*\*), `src/math.js` (distance helpers).
- Extract pure data structures: `src/trail.js`, `src/occupancyGrid.js` (use constants).
- Move view helpers: `src/viewUtils.js` for aspect/bounds/random start; `src/persistence.js` for localStorage reads/writes.

## UI separation

- `src/ui/overlays.js`: player config overlay, winner/draw overlays (style injection centralized).
- `src/ui/controlsInfo.js`: render/update controls panel from players array.
- Optionally move overlay styles into `src/ui/overlays.css` and import/inject once.

## Input

- `src/input.js`: `buildInputMappings`, mouse state, attach/detach keyboard/mouse listeners; expose hooks for game loop.

## Game logic

- `src/collision.js`: grid/segment collision wrappers using math helpers and constants.
- `src/gameState.js`: player creation, hex-to-rgb helper, `createInitialGameState`.
- `src/gameLoop.js`: `updatePlayer`, `updateSnake`, reset/forceReset, fixed-timestep loop; consume collision/grid/trail/view utils/constants.

## Entry/bootstrap

- Slim `script.js` (or new `index.js`) that imports initGame, builds state, wires input/UI, starts loop, and assigns required globals in one place.
- Update `index.html` script tag to point to the new entry if renamed.

## Validation

- Smoke test in browser after each extraction (overlays, controls UI, input, collisions, reset).
- Add/unit test small pieces where easy (Trail, OccupancyGrid, distance helpers).
- Verify localStorage persistence for `playerConfig` and `firstStartDone` remains unchanged.
