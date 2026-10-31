// Commit-reveal sealing. A table draws all randomness from one secret seed:
// its sha256 is published when the table opens, the seed itself when it ends,
// so anyone can re-derive every card and check nothing changed mid-game.
import { createHash, createHmac, randomBytes } from 'node:crypto';

export function newSeed() {
  return randomBytes(32).toString('hex');
}

export function commitOf(seed) {
  return createHash('sha256').update(seed).digest('hex');
}

// Deterministic uint32 stream: HMAC-SHA256(seed, counter), 8 words per block.
function* uint32Stream(seed) {
  for (let counter = 0; ; counter++) {
    const block = createHmac('sha256', Buffer.from(seed, 'hex')).update(String(counter)).digest();
    for (let i = 0; i < 32; i += 4) yield block.readUInt32BE(i);
  }
}

// Uniform ints in [0, n) from the stream, by rejection sampling.
function intFrom(rng, n) {
  const limit = Math.floor(0x100000000 / n) * n;
  let r;
  do r = rng.next().value; while (r >= limit);
  return r % n;
}

// Fisher-Yates with rejection sampling, so every order is equally likely.
export function sealedShuffle(items, seed) {
  const out = items.slice();
  const rng = uint32Stream(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = intFrom(rng, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// A labelled draw from the table seed: each label gets its own stream, so a draw
// doesn't depend on how many others came before it.
export function sealedInts(seed, label) {
  const rng = uint32Stream(commitOf(`${seed}:${label}`));
  return (n) => intFrom(rng, n);
}

// Two logs tell the same game when they hold the same events in the same order and
// agree on every field both have. A field only one side has is ignored, so a field the
// code adds or drops later (one for display, say) doesn't fail games logged before it,
// while every seat's move and every drawn outcome is still checked.
export function sameLog(a, b) {
  return a.length === b.length && a.every((e, i) => agree(e, b[i]));
}

function agree(x, y) {
  if (Array.isArray(x) || Array.isArray(y)) return Array.isArray(x) && Array.isArray(y) && x.length === y.length && x.every((v, i) => agree(v, y[i]));
  if (x && y && typeof x === 'object' && typeof y === 'object') return Object.keys(x).every((k) => !(k in y) || agree(x[k], y[k]));
  return x === y;
}
