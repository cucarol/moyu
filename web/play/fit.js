// The pixel font is only sharp at whole multiples of its 12px grid in device pixels,
// so the type sizes follow the display scaling, and the window: about 22px at a
// 1333x733 window, smaller in a small window, larger on a big screen. A small window on
// a 1x display (one played beside work) goes down to the grid itself, 12px, so the HUD
// leaves it its scene. Call once; it follows resizes from then on.
function fit() {
  const dpr = window.devicePixelRatio || 1;
  const s = Math.min(1.5, Math.max(0.55, Math.min(innerWidth / 1333, innerHeight / 733)));
  // never under 12 CSS px, and never under two grids where a display's scaling is fractional
  const m = Math.max(Math.ceil(dpr - 0.01), Math.round((22 * s * dpr) / 12));
  const root = document.documentElement.style;
  root.setProperty('--t', `${(12 * m) / dpr}px`);
  root.setProperty('--t-small', `${(12 * Math.max(1, m - 1)) / dpr}px`);
  root.setProperty('--t-big', `${(12 * m * 2) / dpr}px`);
  // what you read on the table (tags, tips, the aim targets): never under two grids of
  // device pixels, however small the window, so it stays legible beside the scene
  root.setProperty('--t-read', `${(12 * Math.max(2, m - 1)) / dpr}px`);
  // the tags that stay on the table: the same, except in a small window on a 1x display,
  // where two grids would crowd the cards and chips, so one
  root.setProperty('--t-tag', `${(12 * (m >= 2 ? Math.max(2, m - 1) : 1)) / dpr}px`);
  root.setProperty('--px', `${Math.max(1, Math.round(m / 1.5)) / dpr}px`);
  // margins and gaps scale with the type, so small windows keep their scene
  root.setProperty('--gap', `${Math.round((12 * m) / dpr * 0.7)}px`);
  // item icons: 16px art at a whole number of device pixels per art pixel
  root.setProperty('--icon', `${(16 * Math.max(1, Math.round(2 * s * dpr))) / dpr}px`);
}

export function fitType() {
  fit();
  window.addEventListener('resize', fit);
}
