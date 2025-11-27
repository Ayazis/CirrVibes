// Input handling and control mapping.
const controlsMap = new Map();
let mousePlayerIndex = null;
const mouseState = {
  isPressed: false,
  leftButton: false,
  rightButton: false,
};

function bindTouchControls(state, onInputChange) {
  if (typeof document === "undefined" || typeof window === "undefined")
    return null;
  if (!window.gameCapabilities?.isTouch) return null;
  const controlsEl = document.getElementById("touchControls");
  if (!controlsEl) return null;
  const buttons = Array.from(controlsEl.querySelectorAll("[data-dir]"));
  if (!buttons.length) return null;
  controlsEl.setAttribute("aria-hidden", "false");
  const playerIndex = 0;

  const setTurnState = (dir, isActive) => {
    const player = state.players?.[playerIndex];
    if (!player || !player.isAlive) return;
    if (dir === "left") player.isTurningLeft = isActive;
    else if (dir === "right") player.isTurningRight = isActive;
    if (onInputChange)
      onInputChange(playerIndex, {
        isTurningLeft: player.isTurningLeft,
        isTurningRight: player.isTurningRight,
      });
  };

  const pointerDown = (event) => {
    event.preventDefault();
    const btn = event.currentTarget;
    const dir = btn?.dataset?.dir;
    if (!dir) return;
    btn.classList.add("touch-active");
    setTurnState(dir, true);
  };

  const pointerUp = (event) => {
    event.preventDefault();
    const btn = event.currentTarget;
    const dir = btn?.dataset?.dir;
    if (!dir) return;
    btn.classList.remove("touch-active");
    setTurnState(dir, false);
  };

  buttons.forEach((btn) => {
    btn.addEventListener("pointerdown", pointerDown);
    btn.addEventListener("pointerup", pointerUp);
    btn.addEventListener("pointerleave", pointerUp);
    btn.addEventListener("pointercancel", pointerUp);
  });

  return () => {
    buttons.forEach((btn) => {
      btn.classList.remove("touch-active");
      btn.removeEventListener("pointerdown", pointerDown);
      btn.removeEventListener("pointerup", pointerUp);
      btn.removeEventListener("pointerleave", pointerUp);
      btn.removeEventListener("pointercancel", pointerUp);
    });
    setTurnState("left", false);
    setTurnState("right", false);
  };
}

export function buildInputMappings(players) {
  controlsMap.clear();
  mousePlayerIndex = null;
  const playersArr = players || [];
  playersArr.forEach((p, idx) => {
    if (!p) return;
    const cfg = (p.controls || "").toLowerCase();
    if (cfg.includes("arrow")) {
      controlsMap.set("arrowleft", { playerIndex: idx, side: "left" });
      controlsMap.set("arrowright", { playerIndex: idx, side: "right" });
    } else if (cfg.includes("mouse")) {
      mousePlayerIndex = idx;
    } else if (
      cfg.includes("w / s") ||
      (cfg.includes("w") && cfg.includes("s"))
    ) {
      controlsMap.set("w", { playerIndex: idx, side: "left" });
      controlsMap.set("s", { playerIndex: idx, side: "right" });
    } else if (
      cfg.includes("a / d") ||
      (cfg.includes("a") && cfg.includes("d"))
    ) {
      controlsMap.set("a", { playerIndex: idx, side: "left" });
      controlsMap.set("d", { playerIndex: idx, side: "right" });
    } else if (
      cfg.includes("num4") ||
      cfg.includes("num6") ||
      cfg.includes("numpad")
    ) {
      controlsMap.set("numpad4", { playerIndex: idx, side: "left" });
      controlsMap.set("numpad6", { playerIndex: idx, side: "right" });
    } else if (
      cfg.includes("j / l") ||
      (cfg.includes("j") && cfg.includes("l"))
    ) {
      controlsMap.set("j", { playerIndex: idx, side: "left" });
      controlsMap.set("l", { playerIndex: idx, side: "right" });
    }
  });
  return { controlsMap, mousePlayerIndex };
}

export function attachInputHandlers(options) {
  const isStateWithPlayers = options && Array.isArray(options.players);
  const state = isStateWithPlayers ? options : null;
  const onInputChange = isStateWithPlayers ? options.onInputChange : null;
  if (!state || !state.players) return () => {};
  buildInputMappings(state.players);

  const isTypingTarget = (el) => {
    if (!el) return false;
    const tag = (el.tagName || "").toLowerCase();
    return tag === "input" || tag === "textarea" || el.isContentEditable;
  };

  const keydown = (event) => {
    if (isTypingTarget(event.target)) return;
    const keyId = (event.key || "").toLowerCase();
    const codeId = (event.code || "").toLowerCase();
    const mapped = controlsMap.get(keyId) || controlsMap.get(codeId);
    if (mapped) {
      try {
        event.preventDefault();
      } catch (e) {}
      const player = state.players[mapped.playerIndex];
      if (!player || !player.isAlive) return;
      if (mapped.side === "left") player.isTurningLeft = true;
      else player.isTurningRight = true;
      if (onInputChange)
        onInputChange(mapped.playerIndex, {
          isTurningLeft: player.isTurningLeft,
          isTurningRight: player.isTurningRight,
        });
    }
  };

  const keyup = (event) => {
    if (isTypingTarget(event.target)) return;
    const keyId = (event.key || "").toLowerCase();
    const codeId = (event.code || "").toLowerCase();
    const mapped = controlsMap.get(keyId) || controlsMap.get(codeId);
    if (mapped) {
      try {
        event.preventDefault();
      } catch (e) {}
      const player = state.players[mapped.playerIndex];
      if (!player) return;
      if (mapped.side === "left") player.isTurningLeft = false;
      else player.isTurningRight = false;
      if (onInputChange)
        onInputChange(mapped.playerIndex, {
          isTurningLeft: player.isTurningLeft,
          isTurningRight: player.isTurningRight,
        });
    }
  };

  const mousedown = (event) => {
    if (isTypingTarget(event.target)) return;
    if (mousePlayerIndex === null) return;
    const player = state.players[mousePlayerIndex];
    if (!player || !player.isAlive) return;

    mouseState.isPressed = true;

    if (event.button === 0) {
      // Left mouse button
      mouseState.leftButton = true;
      player.isTurningLeft = true;
    } else if (event.button === 2) {
      // Right mouse button
      mouseState.rightButton = true;
      player.isTurningRight = true;
    }
    if (onInputChange)
      onInputChange(mousePlayerIndex, {
        isTurningLeft: player.isTurningLeft,
        isTurningRight: player.isTurningRight,
      });

    event.preventDefault();
  };

  const mouseup = (event) => {
    if (isTypingTarget(event.target)) return;
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

    if (!mouseState.leftButton && !mouseState.rightButton)
      mouseState.isPressed = false;
    if (onInputChange)
      onInputChange(mousePlayerIndex, {
        isTurningLeft: player.isTurningLeft,
        isTurningRight: player.isTurningRight,
      });
  };

  const isGameSurface = (target) => {
    if (!target) return false;
    const el = target.nodeType === 1 ? target : target.parentElement;
    if (!el) return false;
    if (el.id === "gameCanvas") return true;
    if (typeof el.closest === "function") {
      return Boolean(el.closest("#gameCanvas"));
    }
    return false;
  };

  const contextmenu = (event) => {
    if (mousePlayerIndex === null) return;
    if (!isGameSurface(event.target)) return;
    event.preventDefault();
  };

  document.addEventListener("keydown", keydown);
  document.addEventListener("keyup", keyup);
  document.addEventListener("mousedown", mousedown);
  document.addEventListener("mouseup", mouseup);
  document.addEventListener("contextmenu", contextmenu);
  const detachTouch = bindTouchControls(state, onInputChange);

  return () => {
    document.removeEventListener("keydown", keydown);
    document.removeEventListener("keyup", keyup);
    document.removeEventListener("mousedown", mousedown);
    document.removeEventListener("mouseup", mouseup);
    document.removeEventListener("contextmenu", contextmenu);
    if (detachTouch) {
      try {
        detachTouch();
      } catch (e) {}
    }
  };
}
