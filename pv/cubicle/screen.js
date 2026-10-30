// The session (story.js) on a game scene's screen, for a director script: the machine room's
// CRT, the raft's laptop. Drawn into the glass as a texture, so in the room it is lit, hazed and
// dithered like the rest of it, its texels kept square up close, and never laid over as a copy:
// at a cut the desk's laptop shows the same texture through the same post pass. Clawd is away,
// at the table. The time is the part's own, from the script's first beat (the director's t0).
//   screens: { crt: sessionScreen('machine', { H: 288 }) }
//   cam: cutShot('crt', 288)   the cut's frame on this screen (ui.js CUT)
// A glass taller than CUT_H shows the picture CUT_H tall hung from its bottom, the band over it
// dark, so every screen shows the same picture at the cut. glitch: [from, to] seconds over which
// the picture tears, splits and coarsens into the room's own 48x36 tube; the script then takes the
// screen off ({ screen: { name, off: true } }) and the room's picture is back.
import { film } from '/web/play/director/camera.js';
import { createUI, W, CUT, CUT_H } from './ui.js';
import { createSession } from './story.js';

const TUBE = [48, 36]; // the room's own CRT picture (roulette.js crt)

export function sessionScreen(part, { H = CUT_H, glitch = null } = {}) {
  let ui = null, session = null, low = null;
  const top = H - Math.min(H, CUT_H);
  return {
    size: [W, H],
    crisp: false,
    pixel: true,
    scan: false,
    draw(ctx, { lang }) {
      if (!ui) {
        ui = createUI({ L: (zh, en) => (lang === 'en' ? en : zh), H: Math.min(H, CUT_H) });
        session = createSession(ui, (zh, en) => (lang === 'en' ? en : zh));
        ui.state.clawd = { rod: 'down', hidden: true };
      }
      const D = window.__director;
      const t = D?.t0 != null ? (film.now() - D.t0) / 1000 : 0;
      ui.draw(session.at(part, t));
      ctx.fillStyle = '#0f0f0e';
      ctx.fillRect(0, 0, W, top);
      ctx.drawImage(ui.tex.image, 0, top);
      if (glitch && t > glitch[0]) tear(ctx, H, Math.min(1, (t - glitch[0]) / (glitch[1] - glitch[0])), t, (low ??= lowRes()));
    },
  };
}

// k 0..1: bands of rows slide sideways, the red and blue pull apart, and over the last third the
// picture coarsens to the tube's 48x36 cells, tinted its green
function tear(ctx, H, k, t, low) {
  const src = ctx.getImageData(0, 0, W, H);
  const out = ctx.createImageData(W, H);
  const s = src.data, o = out.data;
  // a frame's bands from the time, so a render repeats exactly
  const seed = Math.floor(t * 24);
  const hash = (n) => ((Math.sin(n * 12.9898 + seed * 78.233) * 43758.5453) % 1 + 1) % 1;
  const split = Math.round(k * 9);
  for (let y = 0; y < H; y++) {
    const band = Math.floor(y / (6 + hash(Math.floor(y / 23)) * 18));
    const shift = hash(band) < 0.25 + k * 0.5 ? Math.round((hash(band + 99) - 0.5) * 80 * k) : 0;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const at = (dx) => (y * W + Math.min(W - 1, Math.max(0, x + shift + dx))) * 4;
      o[i] = s[at(split)];
      o[i + 1] = s[at(0) + 1];
      o[i + 2] = s[at(-split) + 2];
      o[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  const c = Math.max(0, (k - 0.66) / 0.34);
  if (c > 0) {
    low.ctx.imageSmoothingEnabled = true;
    low.ctx.drawImage(ctx.canvas, 0, 0, ...TUBE);
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = c;
    ctx.drawImage(low.canvas, 0, 0, W, H);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = '#5fe0c0';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
}

function lowRes() {
  const canvas = document.createElement('canvas');
  [canvas.width, canvas.height] = TUBE;
  return { canvas, ctx: canvas.getContext('2d', { willReadFrequently: true }) };
}

// the camera square on to the cut's texel, the glass H texels tall (camera.js screen shots)
export const cutShot = (screen, H) => ({ screen, fit: H / CUT.rows, aim: [CUT.x / W, (H - CUT.up) / H], fov: 30 });
