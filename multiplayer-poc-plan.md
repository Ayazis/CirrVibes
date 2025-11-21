## Multiplayer POC Plan (Firebase)

Goals:
- Lightweight online multiplayer prototype without running custom servers.
- Keep one client authoritative over simulation; others send inputs.
- Use Firebase as signaling/state fan-out while keeping code changes contained.

Architecture:
- Authority: the room host runs the fixed-step loop and writes state. Guests only send inputs.
- Transport: Firebase Realtime Database (simpler for low-latency listeners) with one small Firestore/RTDB doc path per room.
- Sync cadence: inputs are written per intent (key down/up) with sequence numbers; host applies them next tick and publishes coarse state snapshots at 8–15 Hz.

Data model (per room):
- `rooms/{roomId}/meta`: hostId, createdAt, status (`waiting|running|ended`), maxPlayers.
- `rooms/{roomId}/players/{playerId}`: name, color, controls, joinedAt, isHost, presence heartbeat.
- `rooms/{roomId}/inputs/{playerId}`: `{ seq, ts, turningLeft, turningRight }` updated whenever intent changes.
- `rooms/{roomId}/state`: `{ frame, players: [{id,x,y,direction,isAlive,score}], lastUpdate }` written by host on a throttle.
- Presence: `onDisconnect` clears `players/{playerId}` and `inputs/{playerId}`; optional `rooms/{roomId}/meta/status=ended` when host leaves.

Client responsibilities:
- Host flow: create roomId, write meta+player, start listening to `inputs/*`, run loop, and publish `state`. Allow forced reset by setting a flag in `meta`.
- Guest flow: join roomId, write to `players/{id}`, mirror local inputs to `inputs/{id}`, and render from remote `state`. Lock local simulation; only interpolate positions from host.
- Input handling: debounce to reduce writes (only when intent changes) and include monotonically increasing `seq` numbers.
- Rendering: host uses existing game state; guests run a render-only mode that reads `state` and updates player meshes/positions without local physics.

Implementation steps (suggested order):
1) Add `src/firebaseClient.js` that initializes Firebase (config from `firebase shizl.md`) and exports helpers for db refs/listeners.
2) Add a small `RoomClient` helper to wrap joins, presence, and input writes; expose hooks for host/guest roles.
3) Add a lightweight UI overlay: create/join room by ID, copy/share link, show connection state.
4) Host integration: wrap the existing `updateSnake` loop so it consumes queued inputs from Firebase and publishes throttled `state` payloads.
5) Guest integration: add render-only path that listens to `state`, updates player transforms, and ignores local input except sending intents.
6) Resilience: implement `onDisconnect` cleanup and basic validation (ignore stale `seq` or old timestamps).
7) Dev/test: start with single browser tab as host, second as guest; log Firebase traffic to ensure cadence and payload sizes stay small.

Security/testing notes for POC:
- Keep rules permissive during POC but scoped to `rooms/*`; add `maxPlayers` check client-side to avoid unbounded writes.
- Consider switching to Firestore later if structured queries are needed; Realtime DB is enough for the first pass.
- If you need offline testing, consider the Firebase Emulator Suite before production traffic.
