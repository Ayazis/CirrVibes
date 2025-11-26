export const PLAYER_COLORS = [
  '#ffffff',
  '#ff6b6b',
  '#ffd93d',
  '#6bf178',
  '#4d96ff',
  '#ff92e0',
  '#f77f00',
  '#5ef1ff',
  '#b19dff',
  '#ffb347'
];

export function normalizeColorHex(color) {
  if (!color && color !== 0) return null;
  if (Array.isArray(color)) return null;
  const str = String(color).trim().toLowerCase();
  if (!str) return null;
  return str.startsWith('#') ? str : `#${str}`;
}

export function getAvailableColor(preferred, usedSet = new Set()) {
  const normalizedPreferred = normalizeColorHex(preferred);
  if (normalizedPreferred && !usedSet.has(normalizedPreferred)) {
    return normalizedPreferred;
  }
  for (const color of PLAYER_COLORS) {
    const normalized = normalizeColorHex(color);
    if (normalized && !usedSet.has(normalized)) {
      return normalized;
    }
  }
  return normalizedPreferred || PLAYER_COLORS[0];
}
