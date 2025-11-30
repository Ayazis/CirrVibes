// Canvas2D fallback renderer for environments without WebGL support.
import { resizeCanvasToDisplaySize } from "./gameCanvas.js";
import { TRAIL_WIDTH } from "./constants.js";

function colorToCss(color) {
  if (typeof color === "string") return color;
  if (Array.isArray(color)) {
    const r = Math.round((color[0] ?? 1) * 255);
    const g = Math.round((color[1] ?? 1) * 255);
    const b = Math.round((color[2] ?? 1) * 255);
    const a = Math.min(1, Math.max(0, color[3] ?? 1));
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  return "#ffffff";
}

export function drawScene2d(ctx, canvas) {
  if (!ctx || !canvas) return;

  let needsViewUpdate = true;
  let lastDpr = window.devicePixelRatio || 1;

  const updateView = () => {
    if (!canvas.width || !canvas.height) return;
    const state = window.gameState;
    const viewSize = state?.viewSize ?? 10;
    const aspect = canvas.width / canvas.height;
    const horizontalBoundary = viewSize * aspect;
    const verticalBoundary = viewSize;

    if (state) {
      state.viewBounds = {
        minX: -horizontalBoundary,
        maxX: horizontalBoundary,
        minY: -verticalBoundary,
        maxY: verticalBoundary,
      };
      if (state.occupancyGrid) {
        state.occupancyGrid.updateBounds(
          state.viewBounds.minX,
          state.viewBounds.maxX,
          state.viewBounds.minY,
          state.viewBounds.maxY,
          state.players,
          state.frameCounter,
        );
      }
    }
  };

  window.addEventListener("resize", () => {
    needsViewUpdate = true;
  });

  const renderFrame = () => {
    if (resizeCanvasToDisplaySize(canvas)) {
      needsViewUpdate = true;
    }

    const currentDpr = window.devicePixelRatio || 1;
    if (currentDpr !== lastDpr) {
      lastDpr = currentDpr;
      needsViewUpdate = true;
    }

    if (needsViewUpdate) {
      updateView();
      needsViewUpdate = false;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const state = window.gameState;
    const players = state?.players;
    const bounds = state?.viewBounds;
    if (!players || players.length === 0 || !bounds) {
      requestAnimationFrame(renderFrame);
      return;
    }

    const worldWidth = bounds.maxX - bounds.minX || 1;
    const worldHeight = bounds.maxY - bounds.minY || 1;
    const pixelsPerUnit = Math.min(
      canvas.width / worldWidth,
      canvas.height / worldHeight,
    );
    const strokeWidth = Math.max(1, TRAIL_WIDTH * 2 * pixelsPerUnit);

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    players.forEach((player) => {
      const trail = player?.trail;
      if (!trail || typeof trail.length !== "number" || trail.length === 0)
        return;

      if (trail.length >= 2) {
        ctx.beginPath();
        let firstPoint = true;
        trail.forEach((x, y) => {
          if (isNaN(x)) {
            firstPoint = true;
            return;
          }
          const sx = ((x - bounds.minX) / worldWidth) * canvas.width;
          const sy = ((bounds.maxY - y) / worldHeight) * canvas.height;
          if (firstPoint) {
            ctx.moveTo(sx, sy);
            firstPoint = false;
          } else {
            ctx.lineTo(sx, sy);
          }
        });
        ctx.strokeStyle = colorToCss(player.color);
        ctx.lineWidth = strokeWidth;
        ctx.stroke();
      }

      // Draw start marker (temporary)
      if (trail.length > 0 && trail.length < 30) {
        const startX = trail.get ? trail.get(0).x : trail[0].x;
        const startY = trail.get ? trail.get(0).y : trail[0].y;

        if (typeof startX === 'number' && typeof startY === 'number') {
          const sx = ((startX - bounds.minX) / worldWidth) * canvas.width;
          const sy = ((bounds.maxY - startY) / worldHeight) * canvas.height;
          const markerSize = strokeWidth * 4;
          const alpha = 1 - (trail.length / 30);

          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.fillStyle = colorToCss(player.color);
          ctx.beginPath();
          ctx.arc(sx, sy, markerSize / 2, 0, Math.PI * 2);
          ctx.fill();

          // Draw player name
          if (player.name) {
            ctx.fillStyle = "#fff";
            ctx.font = "bold 12px Arial";
            ctx.textAlign = "center";
            ctx.textBaseline = "bottom";
            ctx.shadowColor = "rgba(0,0,0,0.8)";
            ctx.shadowBlur = 4;
            ctx.fillText(player.name, sx, sy - markerSize / 2 - 4);
          }

          ctx.restore();
        }
      }

      // Draw head (current position)
      if (player.isAlive) {
        const hx = ((player.snakePosition.x - bounds.minX) / worldWidth) * canvas.width;
        const hy = ((bounds.maxY - player.snakePosition.y) / worldHeight) * canvas.height;
        ctx.fillStyle = colorToCss(player.color);
        ctx.beginPath();
        ctx.arc(hx, hy, strokeWidth / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    ctx.restore();
    requestAnimationFrame(renderFrame);
  };

  requestAnimationFrame(renderFrame);
}
