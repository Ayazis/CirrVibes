export function rgbaFromHex(hex) {
  let h = (hex || "").replace("#", "");
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  const r = parseInt(h.slice(0, 2) || "ff", 16) / 255;
  const g = parseInt(h.slice(2, 4) || "ff", 16) / 255;
  const b = parseInt(h.slice(4, 6) || "ff", 16) / 255;
  return [r, g, b, 1];
}

export function cssFromColor(arrOrHex) {
  if (typeof arrOrHex === "string") return arrOrHex;
  if (Array.isArray(arrOrHex)) {
    const [r, g, b] = arrOrHex;
    return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
  }
  return "#cccccc";
}

export function normalizeColorPayload(color) {
  if (!color) return rgbaFromHex("#ffffff");
  return Array.isArray(color) ? color : rgbaFromHex(color);
}
