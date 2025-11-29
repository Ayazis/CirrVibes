// Host/guest helper for Firebase-backed multiplayer POC.
import {
  initFirebase,
  roomRef,
  listen,
  setValue,
  updateValue,
  writePresenceCleanup,
  nowTs,
  removeValue,
  getValue,
} from "./firebaseClient.js";
import { PLAYER_COLORS } from "./multiplayer/playerColors.js";

function randomId(prefix = "p") {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

async function determineColor(roomId, isHost) {
  if (isHost) return PLAYER_COLORS[0];
  try {
    const players = await getValue(roomRef(roomId, "players"));
    const count =
      players && typeof players === "object" ? Object.keys(players).length : 0;
    const idx = Math.min(count, PLAYER_COLORS.length - 1);
    return PLAYER_COLORS[idx] || PLAYER_COLORS[PLAYER_COLORS.length - 1];
  } catch (e) {
    console.warn("[roomClient] color lookup failed", e);
  }
  return PLAYER_COLORS[0];
}

export class RoomClient {
  constructor({
    roomId,
    playerId = randomId(),
    playerInfo = {},
    isHost = false,
  } = {}) {
    if (!roomId) throw new Error("roomId required");
    this.roomId = roomId;
    this.playerId = playerId;
    this.playerInfo = playerInfo;
    this.isHost = isHost;
    this._listeners = [];
    this._synced = false;

    initFirebase();
  }

  async joinRoom() {
    const now = Date.now();
    const assignedColor = await determineColor(this.roomId, this.isHost);
    this.playerInfo.color = assignedColor;
    const playerPayload = {
      id: this.playerId,
      name: this.playerInfo.name || this.playerId,
      color: assignedColor,
      controls: this.playerInfo.controls || "",
      joinedAt: now,
      isHost: this.isHost,
      lastSeen: now,
      ready: false,
    };

    if (this.isHost) {
      const metaRef = roomRef(this.roomId, "meta");
      await updateValue(metaRef, {
        hostId: this.playerId,
        createdAt: now,
        status: "waiting",
        maxPlayers: 4,
      });
    }

    const playerRef = roomRef(this.roomId, `players/${this.playerId}`);
    await setValue(playerRef, playerPayload);
    writePresenceCleanup(this.roomId, this.playerId);
    this._synced = true;
  }

  listenInputs(cb) {
    const unsub = listen(roomRef(this.roomId, "inputs"), (val) =>
      cb(val || {}),
    );
    this._listeners.push(unsub);
    return unsub;
  }

  listenTrails(cb) {
    const unsub = listen(roomRef(this.roomId, "trails"), (val) =>
      cb(val || {}),
    );
    this._listeners.push(unsub);
    return unsub;
  }

  listenState(cb) {
    const unsub = listen(roomRef(this.roomId, "state"), (val) => cb(val || {}));
    this._listeners.push(unsub);
    return unsub;
  }

  listenPlayers(cb) {
    const unsub = listen(roomRef(this.roomId, "players"), (val) =>
      cb(val || {}),
    );
    this._listeners.push(unsub);
    return unsub;
  }

  listenMeta(cb) {
    const unsub = listen(roomRef(this.roomId, "meta"), (val) => cb(val || {}));
    this._listeners.push(unsub);
    return unsub;
  }

  async sendInput(intent) {
    if (!this._synced) await this.joinRoom();
    const payload = {
      seq: intent.seq,
      ts: intent.ts || Date.now(),
      turningLeft: !!intent.turningLeft,
      turningRight: !!intent.turningRight,
    };
    const ref = roomRef(this.roomId, `inputs/${this.playerId}`);
    return updateValue(ref, payload);
  }

  async publishState(state) {
    if (!this.isHost) throw new Error("Only host publishes state");
    const ref = roomRef(this.roomId, "state");
    const payload = { ...state, lastUpdate: nowTs() };
    return setValue(ref, payload);
  }

  async sendTrailSnapshot(payload) {
    if (!payload) return;
    if (!this._synced) await this.joinRoom();
    const ref = roomRef(this.roomId, `trails/${this.playerId}`);
    return setValue(ref, {
      ...payload,
      ts: payload.ts || Date.now(),
      seq: payload.seq || 0,
    });
  }

  async updateMeta(patch) {
    const ref = roomRef(this.roomId, "meta");
    return updateValue(ref, patch);
  }

  async updateSelf(patch) {
    if (!patch) return;
    if (!this._synced) await this.joinRoom();
    const ref = roomRef(this.roomId, `players/${this.playerId}`);
    return updateValue(ref, patch);
  }

  async setReady(isReady) {
    return this.updateSelf({ ready: !!isReady, readyAt: Date.now() });
  }

  async leaveRoom() {
    try {
      await removeValue(roomRef(this.roomId, `players/${this.playerId}`));
      await removeValue(roomRef(this.roomId, `inputs/${this.playerId}`));
      await removeValue(roomRef(this.roomId, `trails/${this.playerId}`));
    } catch (e) {
      // best effort
    }
    this._listeners.forEach((u) => {
      try {
        u();
      } catch (e) {}
    });
    this._listeners = [];
  }
}

export function createRoomId() {
  return randomId("room");
}
