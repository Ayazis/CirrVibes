// LocalStorage utilities for player config and first-start flag.
export function loadPlayerConfig() {
  try {
    return JSON.parse(localStorage.getItem('playerConfig') || 'null');
  } catch (e) {
    return null;
  }
}

export function savePlayerConfig(players) {
  try {
    localStorage.setItem('playerConfig', JSON.stringify(players));
  } catch (e) {
    // ignore write failures
  }
}

export function loadFirstStartDone() {
  try {
    return localStorage.getItem('firstStartDone');
  } catch (e) {
    return null;
  }
}

export function saveFirstStartDone() {
  try {
    localStorage.setItem('firstStartDone', 'true');
  } catch (e) {
    // ignore write failures
  }
}
