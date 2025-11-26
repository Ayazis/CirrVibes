import { RoomClient, createRoomId as createFirebaseRoomId } from '../roomClient.js';

export function createFirebaseSession(initialCallbacks = {}) {
  let client = null;
  let role = null; // 'host' | 'guest' | null
  let callbacks = { ...initialCallbacks };

  function setCallbacks(next = {}) {
    callbacks = { ...callbacks, ...next };
  }

  function invoke(name, payload) {
    const fn = callbacks[name];
    if (typeof fn === 'function') fn(payload);
  }

  function attachListeners() {
    if (!client) return;
    client.listenPlayers((players) => invoke('onPlayersUpdate', players));
    client.listenMeta((meta) => invoke('onMetaUpdate', meta));
    if (role === 'host') {
      client.listenInputs((inputs) => invoke('onInputIntent', inputs));
    } else if (role === 'guest') {
      client.listenState((state) => invoke('onStateUpdate', state));
    }
  }

  async function connect(roomId, playerInfo, isHost) {
    role = isHost ? 'host' : 'guest';
    client = new RoomClient({ roomId, playerInfo, isHost });
    try {
      await client.joinRoom();
      attachListeners();
      return client;
    } catch (e) {
      client = null;
      role = null;
      throw e;
    }
  }

  async function disconnect() {
    if (!client) return;
    try {
      await client.leaveRoom();
    } catch (e) {}
    client = null;
    role = null;
  }

  return {
    connectHost: (roomId, playerInfo) => connect(roomId, playerInfo, true),
    connectGuest: (roomId, playerInfo) => connect(roomId, playerInfo, false),
    disconnect,
    setCallbacks,
    setReady: (ready) => client?.setReady(ready),
    updateProfile: (profile) => client?.updateSelf(profile),
    updateMeta: (meta) => client?.updateMeta(meta),
    publishState: (payload) => client?.publishState(payload),
    sendInput: (payload) => client?.sendInput(payload),
    isConnected: () => !!client,
    getPlayerId: () => client?.playerId || null,
    getRole: () => role,
    generateRoomId: () => createFirebaseRoomId()
  };
}
