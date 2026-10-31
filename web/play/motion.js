// Comfort: whether the view sways (the raft rocking under us). Off when the system asks for
// reduced motion, until changed in ⚙; remembered. The sea moves either way.
const KEY = 'moyu.motion';
const reduced = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
export const motion = { sway: !reduced };
try {
  const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
  if (typeof saved?.sway === 'boolean') motion.sway = saved.sway;
} catch {}

export function setSway(on) {
  motion.sway = !!on;
  try {
    localStorage.setItem(KEY, JSON.stringify(motion));
  } catch {}
}
