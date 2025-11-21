// Host/guest helper for Firebase-backed multiplayer POC.
import { initFirebase, roomRef, listen, setValue, updateValue, writePresenceCleanup, nowTs, removeValue } from './firebaseClient.js';

function randomId(prefix = 'p') {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export class RoomClient {
  constructor({ roomId, playerId = randomId(), playerInfo = {}, isHost = false } = {}) {
    if (!roomId) throw new Error('roomId required');
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
    const playerPayload = {
      id: this.playerId,
      name: this.playerInfo.name || this.playerId,
      color: this.playerInfo.color || '#ffffff',
      controls: this.playerInfo.controls || '',
      joinedAt: now,
      isHost: this.isHost,
      lastSeen: now
    };

    if (this.isHost) {
      const metaRef = roomRef(this.roomId, 'meta');
      await updateValue(metaRef, {
        hostId: this.playerId,
        createdAt: now,
        status: 'waiting',
        maxPlayers: 4
      });
    }

    const playerRef = roomRef(this.roomId, `players/${this.playerId}`);
    await setValue(playerRef, playerPayload);
    writePresenceCleanup(this.roomId, this.playerId);
    this._synced = true;
  }

  listenInputs(cb) {
    if (!this.isHost) throw new Error('Only host listens to inputs');
    const unsub = listen(roomRef(this.roomId, 'inputs'), (val) => cb(val || {}));
    this._listeners.push(unsub);
    return unsub;
  }

  listenState(cb) {
    const unsub = listen(roomRef(this.roomId, 'state'), (val) => cb(val || {}));
    this._listeners.push(unsub);
    return unsub;
  }

  listenPlayers(cb) {
    const unsub = listen(roomRef(this.roomId, 'players'), (val) => cb(val || {}));
    this._listeners.push(unsub);
    return unsub;
  }

  listenMeta(cb) {
    const unsub = listen(roomRef(this.roomId, 'meta'), (val) => cb(val || {}));
    this._listeners.push(unsub);
    return unsub;
  }

  async sendInput(intent) {
    if (!this._synced) await this.joinRoom();
    const payload = {
      seq: intent.seq,
      ts: intent.ts || Date.now(),
      turningLeft: !!intent.turningLeft,
      turningRight: !!intent.turningRight
    };
    const ref = roomRef(this.roomId, `inputs/${this.playerId}`);
    return updateValue(ref, payload);
  }

  async publishState(state) {
    if (!this.isHost) throw new Error('Only host publishes state');
    const ref = roomRef(this.roomId, 'state');
    const payload = { ...state, lastUpdate: nowTs() };
    return setValue(ref, payload);
  }

  async updateMeta(patch) {
    const ref = roomRef(this.roomId, 'meta');
    return updateValue(ref, patch);
  }

  async leaveRoom() {
    try {
      await removeValue(roomRef(this.roomId, `players/${this.playerId}`));
      await removeValue(roomRef(this.roomId, `inputs/${this.playerId}`));
    } catch (e) {
      // best effort
    }
    this._listeners.forEach((u) => { try { u(); } catch (e) {} });
    this._listeners = [];
  }
}

export function createRoomId() {
  return randomId('room');
}
