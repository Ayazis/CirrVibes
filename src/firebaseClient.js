// Firebase initialization and lightweight helpers for the multiplayer POC.
// Uses Firebase v10 modular CDN builds to avoid a bundler.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js';
import {
  getDatabase,
  ref,
  update,
  set,
  onValue,
  onDisconnect,
  serverTimestamp,
  remove,
  get
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-database.js';

// Config copied from firebase shizl.md
const firebaseConfig = {
  apiKey: 'AIzaSyB7f9RcMozPvmEQ3jTwEFGGmiZvJu5Dnk4',
  authDomain: 'line-evader.firebaseapp.com',
  projectId: 'line-evader',
  storageBucket: 'line-evader.firebasestorage.app',
  messagingSenderId: '899235546740',
  appId: '1:899235546740:web:4fb98f8de564958b263321',
  databaseURL: 'https://line-evader-default-rtdb.europe-west1.firebasedatabase.app'
};

let appInstance = null;
let dbInstance = null;

export function initFirebase() {
  if (!appInstance) {
    appInstance = initializeApp(firebaseConfig);
  }
  if (!dbInstance) {
    dbInstance = getDatabase(appInstance);
  }
  return { app: appInstance, db: dbInstance };
}

export function getDb() {
  if (!dbInstance) initFirebase();
  return dbInstance;
}

export function roomRef(roomId, path = '') {
  if (!roomId) throw new Error('roomId is required');
  const cleaned = path ? `${roomId}/${path}` : roomId;
  return ref(getDb(), `rooms/${cleaned}`);
}

export function writePresenceCleanup(roomId, playerId) {
  try {
    const playerRef = roomRef(roomId, `players/${playerId}`);
    const inputRef = roomRef(roomId, `inputs/${playerId}`);
    onDisconnect(playerRef).remove();
    onDisconnect(inputRef).remove();
  } catch (e) {
    // ignore presence cleanup errors for now
  }
}

export function setValue(refToSet, value) {
  return set(refToSet, value);
}

export function updateValue(refToUpdate, value) {
  return update(refToUpdate, value);
}

export function listen(refToListen, cb) {
  return onValue(refToListen, (snapshot) => cb(snapshot.val()));
}

export function removeValue(refToRemove) {
  return remove(refToRemove);
}

export function getValue(refToGet) {
  return get(refToGet).then((snapshot) => snapshot.val());
}

export function nowTs() {
  return serverTimestamp();
}
