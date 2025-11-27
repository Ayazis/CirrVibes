// Game initialization logic
import { setupCanvas } from "./gameCanvas.js";
import { drawScene } from "./drawScene.js";
import { drawScene2d } from "./drawScene2d.js";

export function isTouchDevice() {
  if (typeof window === "undefined") return { isTouch: false };
  const coarsePointer = window.matchMedia
    ? window.matchMedia("(pointer: coarse)").matches
    : false;
  const touchEvents = "ontouchstart" in window;
  return {
    isTouch: Boolean(coarsePointer || touchEvents),
  };
}

function setRendererIndicator(label) {
  const el = document.getElementById("rendererDisplay");
  if (el) el.textContent = `Renderer: ${label}`;
  window.currentRenderer = label;
}

export const initGame = () => {
  const canvas = setupCanvas("gameCanvas");
  if (isTouchDevice().isTouch) {
    //fallback to Canvas2D (CPU)
    const ctx2d = create2dContext(canvas);
    if (!ctx2d) {
      reportRendererFailure(
        "Graphics renderer unavailable. Enable WebGL or Canvas 2D acceleration in your browser."
      );
      return;
    }
    drawScene2d(ctx2d, canvas);
    setRendererIndicator("Canvas2D");
    return;
  }
  // try setup using WebGL (GPU)
  const gl = createWebglContext(canvas);
  if (gl) {
    drawScene(gl, canvas);
    setRendererIndicator("WebGL");
  }
};

function create2dContext(canvas) {
  if (!canvas) return null;
  const attempts = [
    { alpha: false, desynchronized: true },
    { alpha: false },
    {},
  ];
  for (let i = 0; i < attempts.length; i += 1) {
    try {
      const ctx = canvas.getContext("2d", attempts[i]);
      if (ctx) return ctx;
    } catch (err) {
      console.warn("[initGame] 2D context attempt failed", err);
    }
  }
  return null;
}

function reportRendererFailure(message) {
  setRendererIndicator("Unavailable");
  const roster = document.querySelector(".controls-info");
  if (roster) {
    let banner = document.getElementById("rendererFailureNotice");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "rendererFailureNotice";
      banner.style.marginTop = "8px";
      banner.style.padding = "8px";
      banner.style.border = "1px solid rgba(255,255,255,0.25)";
      banner.style.borderRadius = "6px";
      banner.style.background = "rgba(255,0,0,0.15)";
      banner.style.color = "#fff";
      banner.style.fontSize = "13px";
      banner.style.maxWidth = "420px";
      banner.style.marginLeft = "auto";
      banner.style.marginRight = "auto";
      roster.appendChild(banner);
    }
    banner.textContent = message;
  }
  console.error(message);
}

function createWebglContext(canvas) {
  if (!canvas) return null;
  const preferredAttrs = {
    alpha: false,
    antialias: true,
    preserveDrawingBuffer: false,
  };
  try {
    return (
      canvas.getContext("webgl", preferredAttrs) ||
      canvas.getContext("experimental-webgl", preferredAttrs) ||
      canvas.getContext("webgl")
    );
  } catch (err) {
    console.warn("[initGame] WebGL context creation failed", err);
    return null;
  }
}
