// 2026-10-31: machine room → dusk as a CRT going off like an old tube, cut on its dark glass to
// the desk's laptop waking the same way (it lived in pv/cubicle/ui.js; screen.js took an `off`
// second, cubicle.js woke dusk's glass through it). Replaced by the user's design: the whole game
// shrinks into a window on the dusk laptop's desktop (pv/cut/join.py).
// A screen switching off like an old tube: k 1 the picture, the picture squeezed to a bright
// line, the line shrinking to a dot, k 0 black. Run backward it is the screen waking.
export function tube(ctx, src, k) {
  const w = src.width, h = src.height, cy = h / 2;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  if (k <= 0) return;
  if (k > 0.45) {
    const s = (k - 0.45) / 0.55;
    const hh = Math.max(2, Math.round(h * s * s));
    const y = Math.round(cy - hh / 2);
    ctx.drawImage(src, 0, 0, w, h, 0, y, w, hh);
    // it burns brighter the thinner it gets
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(230,240,255,${((1 - s) * 0.9).toFixed(3)})`;
    ctx.fillRect(0, y, w, hh);
    ctx.globalCompositeOperation = 'source-over';
  } else {
    const s = Math.max(0, (k - 0.12) / 0.33);
    const lw = Math.max(4, Math.round(w * s ** 1.5));
    ctx.fillStyle = k > 0.12 ? '#eef4ff' : `rgba(238,244,255,${(k / 0.12).toFixed(3)})`;
    ctx.fillRect(Math.round(w / 2 - lw / 2), Math.round(cy - 1), lw, 2);
  }
}
