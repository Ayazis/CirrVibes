// Input handling and control mapping.
const controlsMap = new Map();
let mousePlayerIndex = null;
const mouseState = {
  isPressed: false,
  leftButton: false,
  rightButton: false
};

export function buildInputMappings(players) {
  controlsMap.clear();
  mousePlayerIndex = null;
  const playersArr = players || [];
  playersArr.forEach((p, idx) => {
    const cfg = (p.controls || '').toLowerCase();
    if (cfg.includes('arrow')) {
      controlsMap.set('arrowleft', { playerIndex: idx, side: 'left' });
      controlsMap.set('arrowright', { playerIndex: idx, side: 'right' });
      controlsMap.set('arrowleft', { playerIndex: idx, side: 'left' });
      controlsMap.set('arrowright', { playerIndex: idx, side: 'right' });
    } else if (cfg.includes('mouse')) {
      mousePlayerIndex = idx;
    } else if (cfg.includes('a / d') || (cfg.includes('a') && cfg.includes('d'))) {
      controlsMap.set('a', { playerIndex: idx, side: 'left' });
      controlsMap.set('d', { playerIndex: idx, side: 'right' });
      controlsMap.set('A', { playerIndex: idx, side: 'left' });
      controlsMap.set('D', { playerIndex: idx, side: 'right' });
    } else if (cfg.includes('num4') || cfg.includes('num6') || cfg.includes('numpad')) {
      controlsMap.set('numpad4', { playerIndex: idx, side: 'left' });
      controlsMap.set('numpad6', { playerIndex: idx, side: 'right' });
      controlsMap.set('4', { playerIndex: idx, side: 'left' });
      controlsMap.set('6', { playerIndex: idx, side: 'right' });
    } else if (cfg.includes('j / l') || (cfg.includes('j') && cfg.includes('l'))) {
      controlsMap.set('j', { playerIndex: idx, side: 'left' });
      controlsMap.set('l', { playerIndex: idx, side: 'right' });
      controlsMap.set('J', { playerIndex: idx, side: 'left' });
      controlsMap.set('L', { playerIndex: idx, side: 'right' });
    }
  });
  return { controlsMap, mousePlayerIndex };
}

export function attachInputHandlers(state) {
  if (!state || !state.players) return () => {};
  buildInputMappings(state.players);

  const keydown = (event) => {
    const keyId = (event.key || '').toLowerCase();
    const codeId = (event.code || '').toLowerCase();
    const mapped = controlsMap.get(keyId) || controlsMap.get(codeId);
    if (mapped) {
      try { event.preventDefault(); } catch (e) {}
      const player = state.players[mapped.playerIndex];
      if (!player || !player.isAlive) return;
      if (mapped.side === 'left') player.isTurningLeft = true;
      else player.isTurningRight = true;
    }
  };

  const keyup = (event) => {
    const keyId = (event.key || '').toLowerCase();
    const codeId = (event.code || '').toLowerCase();
    const mapped = controlsMap.get(keyId) || controlsMap.get(codeId);
    if (mapped) {
      try { event.preventDefault(); } catch (e) {}
      const player = state.players[mapped.playerIndex];
      if (!player) return;
      if (mapped.side === 'left') player.isTurningLeft = false;
      else player.isTurningRight = false;
    }
  };

  const mousedown = (event) => {
    if (mousePlayerIndex === null) return;
    const player = state.players[mousePlayerIndex];
    if (!player || !player.isAlive) return;

    mouseState.isPressed = true;

    if (event.button === 0) { // Left mouse button
      mouseState.leftButton = true;
      player.isTurningLeft = true;
    } else if (event.button === 2) { // Right mouse button
      mouseState.rightButton = true;
      player.isTurningRight = true;
    }

    event.preventDefault();
  };

  const mouseup = (event) => {
    if (mousePlayerIndex === null) return;
    const player = state.players[mousePlayerIndex];
    if (!player) return;

    if (event.button === 0) {
      mouseState.leftButton = false;
      player.isTurningLeft = false;
    } else if (event.button === 2) {
      mouseState.rightButton = false;
      player.isTurningRight = false;
    }

    if (!mouseState.leftButton && !mouseState.rightButton) mouseState.isPressed = false;
  };

  const contextmenu = (event) => {
    event.preventDefault();
  };

  document.addEventListener('keydown', keydown);
  document.addEventListener('keyup', keyup);
  document.addEventListener('mousedown', mousedown);
  document.addEventListener('mouseup', mouseup);
  document.addEventListener('contextmenu', contextmenu);

  return () => {
    document.removeEventListener('keydown', keydown);
    document.removeEventListener('keyup', keyup);
    document.removeEventListener('mousedown', mousedown);
    document.removeEventListener('mouseup', mouseup);
    document.removeEventListener('contextmenu', contextmenu);
  };
}
