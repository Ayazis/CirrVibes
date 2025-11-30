
export function showCountdownOverlay(seconds, onComplete) {
  let overlay = document.getElementById("countdownOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "countdownOverlay";
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.pointerEvents = "none";
    overlay.style.zIndex = "9000";
    overlay.style.fontSize = "60px";
    overlay.style.fontWeight = "900";
    overlay.style.color = "#fff";
    overlay.style.textShadow = "0 0 20px rgba(0,0,0,0.8)";
    overlay.style.fontFamily = "Arial, sans-serif";
    document.body.appendChild(overlay);
  }

  let count = seconds;
  overlay.textContent = count;
  overlay.style.opacity = "1";
  overlay.style.transform = "scale(1)";

  const interval = setInterval(() => {
    count--;
    if (count > 0) {
      overlay.textContent = count;
      // Simple pulse animation reset
      overlay.style.transform = "scale(1.2)";
      requestAnimationFrame(() => {
        overlay.style.transform = "scale(1)";
      });
    } else if (count === 0) {
      overlay.textContent = "GO!";
      if (onComplete) onComplete();
    } else {
      clearInterval(interval);
      overlay.style.opacity = "0";
      setTimeout(() => {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 500);
    }
  }, 1000);
}

export function showPlayerNameLabels(players, durationMs = 3000) {
  const containerId = "playerLabelsContainer";
  let container = document.getElementById(containerId);
  if (container) container.remove();

  container = document.createElement("div");
  container.id = containerId;
  container.style.position = "absolute";
  container.style.top = "0";
  container.style.left = "0";
  container.style.width = "100%";
  container.style.height = "100%";
  container.style.pointerEvents = "none";
  container.style.zIndex = "8000";
  document.body.appendChild(container);

  // We need to sync with the game canvas position/size to place labels correctly
  // This is tricky because the canvas scales. 
  // A simpler approach for "start position" labels is to just center them on screen if we knew where they were relative to the viewport.
  // But we have world coordinates. We need to project them.
  // Since we don't have easy access to the projection matrix here without duplicating logic,
  // let's try a simpler approach: Just show a list of "Who is who" at the start?
  // No, the user asked for "add the player names" implying spatial context.
  
  // Let's use a simple HTML overlay that gets updated for a few frames or just once if they are static at start.
  // But the camera/view might change.
  // Actually, `drawScene.js` and `drawScene2d.js` know the projection.
  // Maybe we can just draw the names in `drawScene2d.js`?
  // Yes, `drawScene2d.js` has the context and coordinates.
  // For WebGL, it's harder.
  
  // Let's stick to the "Countdown" part here and handle names in the renderers if possible, 
  // or use a global event to update label positions.
  
  // Actually, for the "start" phase, the camera is usually static or centered.
  // Let's try to implement the names in the renderers as it's most robust.
}
