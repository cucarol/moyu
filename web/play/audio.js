// The table's sound, synthesized with Web Audio, but for the music tracks, whose voices
// play either here or from loops of their own notes rendered on Surge XT (sounds/bgm/),
// voice by voice as sounds/bgm/choice.js says; with no loops to be had, all of them play
// here. No samples or recordings, nothing to license.
// A game picks its vibe (the bed of ambience and music under everything), calls sfx(name)
// at the moments its events play out, and hands each new view to setMood() so the bed can
// follow the game (tension, the turn cue). HUD buttons, the table hover and your own chat
// sound by themselves from DOM listeners here, so the HUD code needs no hooks.
// Nothing sounds before the first click or key (autoplay rules). Mute and volume live in
// the ⚙ window (openSettings) and are remembered in localStorage.
import { t } from './i18n.js';
import BGM_CHOICE from './sounds/bgm/choice.js';
import { babble, hasPinyin, loadPinyin as loadPinyinFrom, readLine, VOICES } from './dididudu.js';

const PREFS = 'moyu.audio';
const prefs = { volume: 0.6, muted: false, voice: 0.8, voiceMuted: false, ambience: 1, radio: false, bgm: 'scene' };
try {
  Object.assign(prefs, JSON.parse(localStorage.getItem(PREFS) ?? '{}'));
} catch {}
document.documentElement.dataset.muted = prefs.muted ? '1' : '';
function savePrefs() {
  try {
    localStorage.setItem(PREFS, JSON.stringify(prefs));
  } catch {}
}
const level = () => (prefs.muted ? 0 : prefs.volume ** 2 * 1.5);
const ambienceLevel = () => prefs.ambience ** 2;
const voiceLevel = () => (prefs.voiceMuted ? 0 : prefs.voice ** 2 * 1.4);

// ---- the graph ---------------------------------------------------------------------

function noiseBuffer(ctx, secs = 3) {
  const b = ctx.createBuffer(1, ctx.sampleRate * secs, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

// A small hard room: darkened noise with a fast decay, a little different per ear.
function impulse(ctx, secs = 1.3) {
  const n = Math.floor(ctx.sampleRate * secs);
  const b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let y = 0;
    for (let i = 0; i < n; i++) {
      y += 0.3 * (Math.random() * 2 - 1 - y);
      d[i] = y * (1 - i / n) ** 3.2;
    }
  }
  return b;
}

// An env is everything a sound needs to play into one context: the live page builds one,
// the sound board (sounds/index.html) builds others on offline contexts to measure them.
export function makeEnv(ctx, dest) {
  const out = ctx.createGain();
  out.connect(dest);
  const verbIn = ctx.createGain();
  const verb = ctx.createConvolver();
  verb.buffer = impulse(ctx);
  verbIn.connect(verb).connect(dest);
  // the bed goes through a duck (a shot pushes it down) and a muffle (being hit)
  const bedBus = ctx.createGain();
  const muffle = ctx.createBiquadFilter();
  muffle.type = 'lowpass';
  muffle.frequency.value = 20000;
  const hide = ctx.createGain(); // the bed fades out while the tab is hidden
  bedBus.connect(muffle).connect(hide).connect(dest);
  // ambs, musics and slots: the beds' ambience and music buses and their music (⚙); places: where the
  // scene's sound sources are (placeSound), and placers follow them when they move
  // running: whether the sound is out now (an offline render always is: see renderSound)
  const running = () => ctx.state === 'running';
  return { ctx, out, verb: verbIn, bedBus, duck: bedBus.gain, muffle: muffle.frequency, hide: hide.gain, noise: noiseBuffer(ctx), bed: null, ambs: new Set(), musics: new Set(), places: {}, placers: new Set(), slots: new Set(), running };
}

function envelope(param, t, a, peak, dur) {
  // silent until t: a new gain starts at 1, and a noise source starting a sample before
  // its envelope came through at full scale, a loud click (heard as a steady crackle)
  param.value = 0;
  param.setValueAtTime(0.0001, t);
  param.exponentialRampToValueAtTime(peak, t + a);
  param.exponentialRampToValueAtTime(0.0001, t + a + dur);
}
function wet(E, node, amount) {
  if (!amount) return;
  const s = E.ctx.createGain();
  s.gain.value = amount;
  node.connect(s).connect(E.verb);
}
function lowpass(E, f, to) {
  const l = E.ctx.createBiquadFilter();
  l.type = 'lowpass';
  l.frequency.value = f;
  l.connect(to);
  return l;
}

// One oscillator voice gliding from f to f1, with an optional lowpass and reverb send.
function tone(E, t, { type = 'sine', f, f1 = f, dur = 0.1, gain = 0.1, a = 0.003, lp = 0, verb = 0, to = E.out }) {
  const { ctx } = E;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f1 !== f) o.frequency.exponentialRampToValueAtTime(f1, t + a + dur);
  const g = ctx.createGain();
  envelope(g.gain, t, a, gain, dur);
  o.connect(g).connect(lp ? lowpass(E, lp, to) : to);
  wet(E, g, verb);
  o.start(t);
  o.stop(t + a + dur + 0.05);
  return g;
}

// A burst of filtered noise; the filter's frequency glides from f to f1.
function hiss(E, t, { type = 'bandpass', f = 1000, f1 = f, q = 1, dur = 0.1, gain = 0.1, a = 0.002, verb = 0, to = E.out, from = Math.random() * 2 }) {
  const { ctx } = E;
  const src = ctx.createBufferSource();
  src.buffer = E.noise;
  src.loop = true;
  const flt = ctx.createBiquadFilter();
  flt.type = type;
  flt.Q.value = q;
  flt.frequency.setValueAtTime(f, t);
  if (f1 !== f) flt.frequency.exponentialRampToValueAtTime(f1, t + a + dur);
  const g = ctx.createGain();
  envelope(g.gain, t, a, gain, dur);
  src.connect(flt).connect(g).connect(to);
  wet(E, g, verb);
  src.start(t, from);
  src.stop(t + a + dur + 0.05);
  return g;
}

function shaper(E, drive = 3) {
  const ws = E.ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(((i / 1023) * 2 - 1) * drive) / Math.tanh(drive);
  ws.curve = curve;
  ws.connect(E.out);
  wet(E, ws, 0.5);
  return ws;
}

const rand = (a, b) => a + Math.random() * (b - a);
// the same env, k times louder: for balancing a whole sound against the rest
function louder(E, k) {
  const g = E.ctx.createGain();
  g.gain.value = k;
  g.connect(E.out);
  return { ...E, out: g };
}
// wraps a sound so it plays k times louder
const boost = (k, fn) => (E, t, o) => fn(louder(E, k), t, o);
function duck(E, t, depth, back) {
  E.duck.cancelScheduledValues(t);
  E.duck.setTargetAtTime(depth, t, 0.01);
  E.duck.setTargetAtTime(1, t + 0.15, back / 3);
}

// ---- pieces sounds are built from --------------------------------------------------

// a brass shell on metal
function clink(E, t, k = 1) {
  const r = rand(0.95, 1.05);
  for (const [f, d, g] of [[2380, 0.18, 0.05], [3810, 0.12, 0.035], [5230, 0.08, 0.025], [1290, 0.06, 0.03]]) {
    tone(E, t, { f: f * r, dur: d, gain: g * k, a: 0.001, verb: 0.15 });
  }
  hiss(E, t, { type: 'highpass', f: 5000, dur: 0.012, gain: 0.08 * k });
}
// a shell seated in the tube
function chk(E, t, k = 1) {
  hiss(E, t, { f: 1500, q: 2.5, dur: 0.04, gain: 0.35 * k });
  tone(E, t, { f: 180, f1: 70, dur: 0.06, gain: 0.25 * k });
  tone(E, t, { type: 'square', f: 420, dur: 0.015, gain: 0.03 * k });
}
// the pump: back, then forward
function rack(E, t) {
  hiss(E, t, { f: 900, f1: 600, q: 1.2, dur: 0.07, gain: 0.3 });
  tone(E, t, { f: 140, f1: 90, dur: 0.06, gain: 0.2 });
  hiss(E, t + 0.15, { f: 2000, q: 2, dur: 0.05, gain: 0.4 });
  tone(E, t + 0.15, { f: 260, f1: 110, dur: 0.05, gain: 0.3 });
  clink(E, t + 0.16, 0.3);
}
// rack alarm, in time with the red LEDs
function alarm(E, t, n) {
  for (let i = 0; i < n; i++) tone(E, t + i * 0.16, { type: 'square', f: i % 2 ? 660 : 880, dur: 0.11, gain: 0.04, lp: 2500 });
}
// the screen's static: chopped noise and a mains buzz, fading
function staticBurst(E, t, dur, gain) {
  const { ctx } = E;
  const src = ctx.createBufferSource();
  src.buffer = E.noise;
  src.loop = true;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 500;
  const g = ctx.createGain();
  const buzz = ctx.createOscillator();
  buzz.type = 'sawtooth';
  buzz.frequency.value = 100;
  const bg = ctx.createGain();
  for (let s = 0; s < dur; s += 0.018) {
    const k = (1 - s / dur) ** 1.5;
    g.gain.setValueAtTime(gain * k * (Math.random() < 0.3 ? 1 : rand(0.15, 0.55)), t + s);
    bg.gain.setValueAtTime(gain * 0.3 * k * (Math.random() < 0.5 ? 1 : 0), t + s);
  }
  g.gain.setValueAtTime(0, t + dur);
  bg.gain.setValueAtTime(0, t + dur);
  src.connect(hp).connect(g).connect(E.out);
  buzz.connect(bg).connect(lowpass(E, 1400, E.out));
  src.start(t, Math.random());
  src.stop(t + dur + 0.05);
  buzz.start(t);
  buzz.stop(t + dur + 0.05);
}
function glitch(E, t, n, gain = 0.05) {
  for (let i = 0; i < n; i++) tone(E, t + i * 0.022, { type: 'square', f: rand(150, 3000), dur: 0.016, gain, a: 0.001 });
}
const arp = (E, t, notes, step, o) => notes.forEach((f, i) => tone(E, t + i * step, { f, ...o }));

// ---- what each item sounds like: one family (the same activation chirp), each its own tail

const ITEM_SFX = {
  cot(E, t) {
    arp(E, t, [523.25, 659.25, 783.99, 987.77, 1318.5], 0.07, { dur: 0.25, gain: 0.07, verb: 0.4 });
    for (let i = 0; i < 6; i++) hiss(E, t + rand(0, 0.35), { type: 'highpass', f: 4000, dur: 0.008, gain: 0.05 });
  },
  compact(E, t) {
    hiss(E, t, { f: 3000, f1: 250, q: 3, dur: 0.35, gain: 0.25 });
    tone(E, t, { type: 'sawtooth', f: 700, f1: 90, dur: 0.3, gain: 0.08, lp: 1200 });
    tone(E, t + 0.3, { f: 90, f1: 50, dur: 0.1, gain: 0.25 });
  },
  inject(E, t) {
    glitch(E, t, 10, 0.06);
    tone(E, t, { type: 'sawtooth', f: 98, dur: 0.3, gain: 0.06, lp: 800 });
    tone(E, t + 0.24, { type: 'square', f: 1200, f1: 300, dur: 0.12, gain: 0.04 });
  },
  temp(E, t) {
    tone(E, t, { f: 220, f1: 1760, dur: 0.6, gain: 0.09, a: 0.02 });
    tone(E, t, { type: 'sawtooth', f: 110, f1: 880, dur: 0.6, gain: 0.03, lp: 2000 });
    hiss(E, t, { type: 'highpass', f: 3000, dur: 0.15, a: 0.5, gain: 0.08 });
  },
  limit(E, t) {
    for (const dt of [0, 0.16]) {
      tone(E, t + dt, { type: 'square', f: 233, dur: 0.11, gain: 0.07, lp: 1500 });
      tone(E, t + dt, { type: 'square', f: 175, dur: 0.11, gain: 0.04, lp: 1500 });
    }
  },
  cache(E, t) {
    tone(E, t, { type: 'square', f: 987.77, dur: 0.07, gain: 0.05, lp: 4000 });
    tone(E, t + 0.07, { type: 'square', f: 1318.5, dur: 0.3, gain: 0.05, lp: 4000 });
    arp(E, t + 0.12, [1567.98, 2093, 2637], 0.05, { dur: 0.4, gain: 0.03, verb: 0.5 });
    tone(E, t, { f: 220, f1: 440, dur: 0.5, gain: 0.06, a: 0.05 });
  },
  // 幻觉 (a match's): a shimmer that climbs and splits in two, each half a little off-key
  mirage(E, t) {
    [659.25, 783.99, 987.77, 1318.5].forEach((f, i) => {
      tone(E, t + i * 0.07, { type: 'triangle', f, dur: 0.4, gain: 0.045, verb: 0.7 });
      tone(E, t + i * 0.07, { type: 'triangle', f: f * 1.06, dur: 0.4, gain: 0.025, verb: 0.7 });
    });
    for (let i = 0; i < 8; i++) tone(E, t + 0.3 + rand(0, 0.4), { f: rand(2400, 4200), dur: 0.05, gain: 0.02, verb: 0.6 });
  },
  // a lock springs
  jailbreak(E, t) {
    tone(E, t, { type: 'square', f: 180, f1: 120, dur: 0.06, gain: 0.08, lp: 1500 });
    hiss(E, t + 0.06, { type: 'highpass', f: 2500, dur: 0.04, gain: 0.12 });
    tone(E, t + 0.1, { f: 587.33, f1: 1174.66, dur: 0.25, gain: 0.06, verb: 0.4 });
    glitch(E, t + 0.12, 5, 0.04);
  },
};

// ---- every sound by name -----------------------------------------------------------
// Times inside are offsets from the call, matched to the table's animations where a
// sound lands on one (a shell dropping onto the table, a tile landing).

export const SFX = {
  // HUD
  hover: (E, t) => tone(E, t, { type: 'square', f: 1760, dur: 0.025, gain: 0.02, lp: 5000 }),
  point: (E, t) => tone(E, t, { type: 'triangle', f: 1180, dur: 0.04, gain: 0.05 }),
  click(E, t) {
    tone(E, t, { type: 'square', f: 1320, f1: 880, dur: 0.05, gain: 0.045, lp: 5000 });
    tone(E, t + 0.035, { type: 'square', f: 1760, dur: 0.03, gain: 0.025, lp: 5000 });
  },
  tick: (E, t) => tone(E, t, { type: 'triangle', f: 1000, dur: 0.06, gain: 0.1 }),
  send(E, t) {
    tone(E, t, { type: 'square', f: 660, dur: 0.04, gain: 0.04, lp: 3000 });
    tone(E, t + 0.05, { type: 'square', f: 990, dur: 0.05, gain: 0.04, lp: 3000 });
  },
  chat: boost(1.4, (E, t) => {
    tone(E, t, { f: 1046.5, dur: 0.09, gain: 0.12, verb: 0.3 });
    tone(E, t + 0.08, { f: 1568, dur: 0.16, gain: 0.1, verb: 0.3 });
  }),
  emote: boost(1.3, (E, t) => {
    tone(E, t, { f: 320, f1: 960, dur: 0.1, gain: 0.14 });
    tone(E, t + 0.1, { f: 960, f1: 1400, dur: 0.08, gain: 0.08 });
  }),
  throw: (E, t) => hiss(E, t, { f: 600, f1: 2800, q: 1.5, dur: 0.15, a: 0.15, gain: 0.18 }),
  turn: boost(1.4, (E, t) => {
    // your move: two soft tones, low then high, that read from another window
    tone(E, t, { type: 'triangle', f: 587.33, dur: 0.18, gain: 0.08, verb: 0.4 });
    tone(E, t + 0.16, { type: 'triangle', f: 880, dur: 0.3, gain: 0.08, verb: 0.4 });
  }),

  // a load
  round(E, t) {
    E.bed?.react('up', t);
    tone(E, t, { f: 55, dur: 1.6, gain: 0.25, a: 0.08 });
    tone(E, t, { type: 'sawtooth', f: 110, dur: 1.2, gain: 0.06, a: 0.05, lp: 500 });
    tone(E, t + 0.05, { f: 1760, dur: 0.9, gain: 0.05, verb: 0.6 });
    tone(E, t + 0.05, { f: 2640, dur: 0.6, gain: 0.02, verb: 0.6 });
  },
  lay(E, t, { count = 1, gap = 0.09 } = {}) {
    for (let i = 0; i < count; i++) clink(E, t + 0.22 + i * gap, 0.8);
  },
  load(E, t, { count = 1, gap = 0.11 } = {}) {
    for (let i = 0; i < count; i++) chk(E, t + 0.24 + i * gap);
    rack(E, t + 0.4 + count * gap);
  },
  deal(E, t, { slot = 0 } = {}) {
    const land = t + 0.26;
    tone(E, land, { f: 200, f1: 80, dur: 0.07, gain: 0.25 });
    hiss(E, land, { f: 2500, dur: 0.02, gain: 0.1 });
    tone(E, land + 0.02, { type: 'square', f: [784, 880, 988, 1175][slot % 4], dur: 0.05, gain: 0.03, lp: 4000 });
  },

  // items
  use: boost(2, (E, t, { item } = {}) => {
    arp(E, t, [1200, 1800, 2400], 0.025, { type: 'square', dur: 0.022, gain: 0.035, lp: 4000 });
    ITEM_SFX[item]?.(E, t + 0.1);
  }),

  // the gun
  aim(E, t) {
    hiss(E, t, { type: 'lowpass', f: 700, dur: 0.15, a: 0.2, gain: 0.12 });
    rack(E, t + 0.42);
  },
  blank(E, t) {
    // a blank: a dry click, then the room holds its breath
    hiss(E, t, { type: 'highpass', f: 2500, dur: 0.012, gain: 0.5 });
    tone(E, t, { type: 'triangle', f: 2900, f1: 2600, dur: 0.05, gain: 0.12, a: 0.001 });
    tone(E, t, { f: 320, dur: 0.03, gain: 0.15 });
    hiss(E, t + 0.012, { f: 1200, q: 4, dur: 0.04, gain: 0.1 });
    duck(E, t, 0.35, 1.5);
  },
  shot(E, t) {
    const ws = shaper(E);
    tone(E, t, { f: 160, f1: 36, dur: 0.45, gain: 0.9, a: 0.001, to: ws });
    tone(E, t, { type: 'square', f: 80, f1: 40, dur: 0.2, gain: 0.2, a: 0.001, to: ws });
    hiss(E, t, { type: 'lowpass', f: 7000, f1: 250, dur: 0.6, gain: 0.9, a: 0.001, to: ws });
    hiss(E, t, { type: 'highpass', f: 2500, dur: 0.04, gain: 0.5, a: 0.001 });
    duck(E, t, 0.15, 1.6);
  },
  hit(E, t, { who = 'you' } = {}) {
    const you = who === 'you';
    staticBurst(E, t, you ? 0.9 : 0.6, you ? 0.22 : 0.15);
    alarm(E, t + 0.1, 6);
    E.bed?.react('spin', t);
    if (you) {
      E.muffle.cancelScheduledValues(t);
      E.muffle.setValueAtTime(300, t);
      E.muffle.setTargetAtTime(20000, t + 0.6, 0.8);
      tone(E, t, { f: 70, f1: 45, dur: 0.3, gain: 0.4 });
      tone(E, t + 0.05, { f: 3900, dur: 2.4, gain: 0.025, a: 0.05 }); // the ears ring
    } else {
      tone(E, t, { type: 'sawtooth', f: 900, f1: 70, dur: 0.45, gain: 0.08, lp: 3000 });
      tone(E, t, { type: 'square', f: 450, f1: 35, dur: 0.45, gain: 0.04, lp: 2000 });
      glitch(E, t + 0.3, 6, 0.04);
    }
  },
  refused(E, t) {
    // the shot bounces off a refusal
    hiss(E, t, { type: 'highpass', f: 3000, dur: 0.03, gain: 0.3 });
    tone(E, t, { type: 'triangle', f: 1950, dur: 0.5, gain: 0.1, a: 0.001, verb: 0.4 });
    tone(E, t, { type: 'triangle', f: 2930, dur: 0.35, gain: 0.05, a: 0.001 });
    tone(E, t + 0.2, { type: 'square', f: 698, dur: 0.12, gain: 0.05, lp: 2000 });
    tone(E, t + 0.35, { type: 'square', f: 523, dur: 0.22, gain: 0.05, lp: 2000 });
  },
  spend(E, t) {
    // the spent shell lands and bounces
    clink(E, t + 0.38, 0.9);
    clink(E, t + 0.5, 0.45);
    clink(E, t + 0.57, 0.2);
  },
  // an item out of a 幻觉 shimmers into being, as it lands
  conjure(E, t) {
    tone(E, t + 0.05, { type: 'triangle', f: 1567.98, f1: 1760, dur: 0.35, gain: 0.04, verb: 0.7 });
    tone(E, t + 0.05, { type: 'triangle', f: 1661.22, f1: 1864.66, dur: 0.35, gain: 0.025, verb: 0.7 });
    hiss(E, t, { type: 'highpass', f: 5000, dur: 0.3, a: 0.2, gain: 0.04 });
  },
  // a 幻觉 item used: it was never there. A call that goes nowhere: a chirp, a glitch, then
  // a flat low 404 tone that just stops
  fake(E, t) {
    arp(E, t, [1200, 1800], 0.025, { type: 'square', dur: 0.022, gain: 0.035, lp: 4000 });
    glitch(E, t + 0.08, 9, 0.05);
    tone(E, t + 0.3, { type: 'square', f: 196, dur: 0.16, gain: 0.05, lp: 1200 });
    tone(E, t + 0.48, { type: 'square', f: 147, dur: 0.3, gain: 0.05, lp: 1000 });
    hiss(E, t + 0.3, { f: 3000, f1: 200, q: 2, dur: 0.4, gain: 0.06 });
  },
  skip(E, t) {
    // 429: throttled, a clock slowing down
    for (const dt of [0, 0.2, 0.45, 0.75]) tone(E, t + dt, { type: 'square', f: 1400, dur: 0.02, gain: 0.05, lp: 3000 });
    tone(E, t, { type: 'square', f: 117, dur: 0.5, gain: 0.06, lp: 600 });
  },

  // the end
  win: boost(2, (E, t) => {
    arp(E, t, [587.33, 739.99, 880, 1174.66, 1479.98], 0.11, { type: 'square', dur: 0.35, gain: 0.045, lp: 3000, verb: 0.4 });
    for (const f of [293.66, 440, 554.37, 739.99]) tone(E, t + 0.5, { type: 'triangle', f, dur: 2, a: 0.3, gain: 0.04, verb: 0.5 });
  }),
  lose(E, t) {
    // 额度用完，下线: everything powers down, the bed sinks
    E.bed?.react('down', t);
    tone(E, t, { type: 'sawtooth', f: 440, f1: 55, dur: 1.6, gain: 0.08, lp: 1500 });
    tone(E, t, { f: 220, f1: 27, dur: 1.8, gain: 0.2 });
    hiss(E, t, { f: 2000, f1: 200, dur: 1.5, gain: 0.05 });
    tone(E, t + 1.4, { f: 6000, f1: 120, dur: 0.12, gain: 0.08 }); // the CRT goes off
  },
  over: boost(1.5, (E, t) => {
    tone(E, t, { type: 'triangle', f: 659.25, dur: 0.3, gain: 0.07, verb: 0.4 });
    tone(E, t + 0.2, { type: 'triangle', f: 523.25, dur: 0.6, gain: 0.07, verb: 0.4 });
  }),
  quit: boost(1.5, (E, t) => tone(E, t, { f: 660, f1: 220, dur: 0.4, gain: 0.06 })),
  // a round of the match: a short rising phrase for yours, a falling one for theirs
  roundWin: boost(1.6, (E, t) => {
    E.bed?.react('up', t);
    arp(E, t, [587.33, 739.99, 880, 1174.66], 0.09, { type: 'square', dur: 0.25, gain: 0.04, lp: 3000, verb: 0.4 });
    tone(E, t + 0.36, { type: 'triangle', f: 1174.66, dur: 0.9, gain: 0.04, verb: 0.5 });
  }),
  roundLose(E, t) {
    E.bed?.react('spin', t);
    arp(E, t, [659.25, 523.25, 440, 349.23], 0.12, { type: 'square', dur: 0.24, gain: 0.04, lp: 2000, verb: 0.3 });
    tone(E, t + 0.45, { f: 110, f1: 70, dur: 0.6, gain: 0.12 });
  },
};

// A vibe's ambience (the room, not the music) goes through one of these, so the ⚙
// 环境音 slider can turn it down apart from the music.
function ambGain(E, to) {
  const g = E.ctx.createGain();
  g.gain.value = ambienceLevel();
  g.connect(to);
  E.ambs.add(g);
  return g;
}

// A vibe's music goes through one of these: straight into the bed as it always has, or,
// with ⚙ music from the radio on, out of a small speaker in the scene (E.places.radio):
// band-limited and a little driven, with a touch of the space around it. musicBus(E, to)
// gives { in, verb, E } to play the music into (E's out and verb are the bus's) and stop().
// makeupGain evens the radio's level with the music played straight, which depends on
// how much of the music lies outside the speaker's band and on the drive, which lifts a
// quiet signal about 2.5 times: each track measures its own (scripts/sound/listen.mjs
// with radio on and off).
const RADIO_AT = -0.45; // the radio's pan when the scene hasn't placed it
function musicBus(E, to, makeupGain = RADIO_MAKEUP) {
  const { ctx } = E;
  const input = ctx.createGain();
  const verb = ctx.createGain();
  const dry = ctx.createGain();
  const dryVerb = ctx.createGain();
  input.connect(dry).connect(to);
  verb.connect(dryVerb).connect(E.verb);
  // the radio: the music with its own reverb and a breath of static, into a little
  // speaker: no lows, no highs, a honk in the middle, a little drive
  const radio = ctx.createGain();
  input.connect(radio);
  verb.connect(radio);
  const crackle = ctx.createBufferSource();
  crackle.buffer = E.noise;
  crackle.loop = true;
  const hissG = ctx.createGain();
  hissG.gain.value = 0.004;
  crackle.connect(hissG).connect(radio);
  crackle.start(0, Math.random() * 2);
  const filt = (type, f, q, gain = 0) => {
    const b = ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    b.gain.value = gain;
    return b;
  };
  const drive = ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(((i / 1023) * 2 - 1) * 2.5) / Math.tanh(2.5);
  drive.curve = curve;
  const makeup = ctx.createGain();
  makeup.gain.value = makeupGain;
  const pan = ctx.createStereoPanner();
  pan.pan.value = E.places.radio?.pan ?? RADIO_AT;
  radio.connect(filt('highpass', 330, 0.8)).connect(filt('peaking', 1600, 0.9, 5)).connect(filt('lowpass', 3300, 1)).connect(drive).connect(makeup).connect(pan).connect(to);
  // the space around it
  const room = ctx.createGain();
  room.gain.value = 0.12;
  makeup.connect(room).connect(E.verb);
  const m = { dry, dryVerb, radio, room };
  routeMusic(m, ctx, 0);
  E.musics.add(m);
  const place = (places) => pan.pan.setTargetAtTime(places.radio?.pan ?? RADIO_AT, ctx.currentTime, 0.3);
  E.placers.add(place);
  return {
    in: input,
    verb,
    E: { ...E, out: input, verb },
    stop() {
      E.musics.delete(m);
      E.placers.delete(place);
      crackle.stop();
    },
  };
}
// the radio's level for the lounge trio, whose bass mostly falls outside the speaker
const RADIO_MAKEUP = 1.3;
function routeMusic(m, ctx, tc = 0.25) {
  const on = prefs.radio ? 1 : 0;
  const t = ctx.currentTime;
  for (const [g, v] of [[m.dry, 1 - on], [m.dryVerb, 1 - on], [m.radio, on], [m.room, on * 0.12]]) {
    if (tc) g.gain.setTargetAtTime(v, t, tc);
    else g.gain.value = v;
  }
}

// ---- vibes: the bed under each game ------------------------------------------------
// A vibe is a scene's bed: its ambience, and its music in a musicSlot (the scene's own
// track or the one picked in ⚙). It builds into E.bedBus and returns { react(kind, t),
// mood(view), stop() }. react kinds: 'spin' (fans up after a hit), 'down' (lost, the room
// sinks), 'up' (a new load).

const BED = 0.8; // the machine room's level under the effects

// Small builders for a long-running bed: oscillators it stops later, filters, gains.
function kit(E) {
  const { ctx } = E;
  const oscs = [];
  return {
    oscs,
    osc(type, f, gain, to) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = gain;
      o.connect(g).connect(to);
      o.start();
      oscs.push(o);
      return o;
    },
    filter(type, f, q, to) {
      const b = ctx.createBiquadFilter();
      b.type = type;
      b.frequency.value = f;
      b.Q.value = q;
      b.connect(to);
      return b;
    },
    gainTo(g, to) {
      const n = ctx.createGain();
      n.gain.value = g;
      n.connect(to);
      return n;
    },
  };
}

// The Wired: the machine room's music, a slow lofi beat late at night in the Wired. The
// dark drone hums under it all (two detuned saws a note, its left and right breathing
// apart), a dusty electric piano drifts down Dm9, Cm9, Bbmaj9 and back up to Cm9 on a
// wobbly tape, a round bass, a soft kick and a snapped rim with lazy swung hats; now and
// then a ping from the Wired on the chord's notes, sometimes calling twice or three times,
// or a moment of a modem talking, echoing left and right. Tension
// brings a heartbeat on the beat, ghost hats, a bass pulse in eighths and the drone
// opening up. (The room's own sounds, its hum and the strain of its racks, are the
// ambience's: roulette() below.)
// A track plays only the voices plays(layer, voice) allows (for listening to one alone).
const ALL = () => true;
const WIRED_BPM = 68;
const WIRED_LEVEL = 0.8;
const WIRED_RADIO = 0.53; // its radio makeup (musicBus), level with it played straight
const WIRED = [
  // two bars each: the drone's chord (Hz) and the keys' (MIDI)
  { drone: [73.42, 110, 174.61, 261.63], keys: [53, 57, 60, 64] }, // Dm9
  { drone: [65.41, 98, 155.56, 233.08], keys: [51, 55, 58, 62] }, // Cm9
  { drone: [58.27, 87.31, 146.83, 220], keys: [50, 53, 57, 60] }, // Bbmaj9
  { drone: [65.41, 98, 155.56, 233.08], keys: [51, 55, 58, 62] }, // Cm9
].map((c) => ({ ...c, keys: c.keys.map((m) => 440 * 2 ** ((m - 69) / 12)) }));
// each chord's notes up high, for the pings
const WIRED_PINGS = [
  [1174.66, 1396.91, 1760, 2093, 2637.02],
  [1046.5, 1244.51, 1567.98, 1864.66, 2349.32],
  [1174.66, 1396.91, 1760, 1864.66, 2093],
  [1046.5, 1244.51, 1567.98, 1864.66, 2349.32],
];
// a modem's two tones (the 300-baud pairs, and the 1200's)
const WIRED_MODEM = [[1070, 1270], [2025, 2225], [1200, 2200]];
function wired(E, to, plays = ALL) {
  const { ctx } = E;
  const { oscs, osc, filter, gainTo } = kit(E);
  const timers = [];
  const running = () => E.running();
  const mus = musicBus(E, gainTo(WIRED_LEVEL, to), WIRED_RADIO);
  const music = mus.in;
  const M = mus.E;
  const panTo = (p, to) => {
    const n = ctx.createStereoPanner();
    n.pan.value = p;
    n.connect(to);
    return n;
  };

  // the tape the keys, bass and drums play on: a little wow and flutter, the highs rolled
  // off (tension lets a little more through)
  const tape = ctx.createDelay(0.1);
  tape.delayTime.value = 0.02;
  tape.connect(music);
  for (const [rate, depth] of [[0.37, 0.0016], [2.9, 0.00012]]) osc('sine', rate, depth, tape.delayTime);
  const tapeLP = lowpass(E, 2800, tape);
  const T = { ...M, out: tapeLP };
  const TH = { ...M, out: lowpass(E, 9000, tape) }; // (the hats and the rim's snap: brighter)

  // the echo: left, then right, darker each time round
  const echo = ctx.createGain();
  const back = gainTo(0.5, music);
  const [dl, dr] = [-0.7, 0.7].map((p) => {
    const d = ctx.createDelay(2);
    d.delayTime.value = 0.43;
    d.connect(panTo(p, back));
    return d;
  });
  echo.connect(dl);
  dl.connect(filter('lowpass', 1800, 0.7, gainTo(0.5, dr)));
  dr.connect(filter('lowpass', 1800, 0.7, gainTo(0.5, dl)));

  // the drone: two detuned saws per note, one each side, low and closed, each side's
  // lowpass breathing at its own pace; it moves with the chords
  const drone = plays('bed', 'drone');
  const opens = plays('tense', 'drone');
  const droneG = gainTo(drone ? 0.12 : 0, music);
  droneG.connect(echo);
  const sides = [-0.6, 0.6].map((p) => filter('lowpass', drone ? 420 : 1120, 2, panTo(p, droneG)));
  const voices = drone || opens ? WIRED[0].drone.flatMap((f) => sides.map((side, k) => {
    const o = osc('sawtooth', f, 0.05, side);
    o.detune.value = k ? 7 : -7;
    return o;
  })) : [];
  if (voices.length) sides.forEach((side, k) => osc('sine', [0.043, 0.031][k], 1, gainTo(180, side.frequency)));

  // the beat
  const beat = 60 / WIRED_BPM;
  const swing = 0.58; // where the off-beat eighth falls, in beats
  let tension = 0;
  let chord = 0;
  let next = 0;
  let n = 0;
  timers.push(setInterval(() => {
    const now = ctx.currentTime;
    if (!running()) return;
    if (next < now) next = now + 0.1;
    while (next < now + 0.2) {
      playBeat(next, n);
      next += beat;
      n++;
    }
  }, 25));
  const kick = (t, k = 1) => tone(T, t, { f: 105, f1: 40, dur: 0.26, gain: 0.17 * k, a: 0.003 });
  const rim = (t, k = 1) => {
    hiss(TH, t, { f: 2100, q: 0.9, dur: 0.12, a: 0.002, gain: 0.12 * k, verb: 0.3 });
    hiss(T, t, { f: 800, q: 0.7, dur: 0.07, a: 0.002, gain: 0.05 * k });
    tone(T, t, { f: 190, f1: 150, dur: 0.05, gain: 0.06 * k, a: 0.002 });
  };
  const hat = (t, k = 1) => hiss(TH, t, { type: 'highpass', f: 7000, dur: 0.03, a: 0.001, gain: 0.05 * k });
  function playBeat(t, i) {
    const b = i % 4;
    const bar = Math.floor(i / 4);
    const c = WIRED[Math.floor(bar / 2) % WIRED.length];
    const off = t + swing * beat;
    if (b === 0 && bar % 2 === 0) {
      chord = Math.floor(bar / 2) % WIRED.length;
      voices.forEach((o, j) => o.frequency.setTargetAtTime(c.drone[j >> 1], t, 0.25));
    }
    // keys: the chord on one, strummed a hair; in the chord's second bar, now and then a
    // soft push on the and of three
    if (b === 0 && plays('bed', 'keys')) c.keys.forEach((f, j) => epiano(T, t + j * 0.02, f, { dur: beat * 3.6, gain: 0.027, verb: 0.35 }));
    if (b === 2 && bar % 2 && Math.random() < 0.5 && plays('bed', 'keys')) c.keys.slice(1).forEach((f, j) => epiano(T, off + j * 0.015, f, { dur: beat * 1.2, gain: 0.016, verb: 0.35 }));
    // bass: the root on one, again on the and of three
    if (plays('bed', 'bass')) {
      if (b === 0) tone(T, t, { type: 'triangle', f: c.drone[0], dur: beat * 1.4, gain: 0.11, a: 0.01, lp: 320 });
      if (b === 2) tone(T, off, { type: 'triangle', f: c.drone[0], dur: beat * 0.8, gain: 0.08, a: 0.01, lp: 320 });
    }
    // drums: kick on one and the and of two (now and then the and of three), rim on two
    // and four, a ghost before one now and then
    const kicks = plays('bed', 'kick');
    if (b === 0 && kicks) kick(t);
    if (b === 1 && kicks) kick(off, 0.65);
    if (b === 2 && Math.random() < 0.35 && kicks) kick(off, 0.5);
    if (plays('bed', 'rim')) {
      if (b % 2) rim(t);
      if (b === 3 && Math.random() < 0.3) rim(t + beat * 0.79, 0.3);
    }
    // hats: swung eighths; ghost sixteenths as it gets tense
    if (plays('bed', 'hat')) {
      hat(t, b % 2 ? 0.75 : 1);
      hat(off, 0.55);
    }
    if (tension > 0.4 && plays('tense', 'hat')) {
      hat(t + beat * 0.29, 0.35 * tension);
      hat(t + beat * 0.79, 0.35 * tension);
    }
    // tension: the heartbeat on one and three, on every beat past half; the pulse, the
    // root's octave in eighths, coming in past a third
    if (tension >= 0.05 && (b % 2 === 0 || tension > 0.5) && plays('tense', 'heart')) {
      tone(M, t, { f: 62, f1: 42, dur: 0.12, gain: 0.3 * tension });
      tone(M, t + 0.18, { f: 58, f1: 40, dur: 0.12, gain: 0.2 * tension });
    }
    const p = (tension - 0.3) / 0.7;
    if (p > 0 && plays('tense', 'pulse')) {
      const lp = 300 + tension * 500;
      tone(T, t, { type: 'sawtooth', f: c.drone[0] * 2, dur: 0.1, gain: 0.075 * p, a: 0.005, lp });
      tone(T, off, { type: 'sawtooth', f: c.drone[0] * 2, dur: 0.08, gain: 0.05 * p, a: 0.005, lp });
    }
  }

  // pings from the Wired, and a modem now and then
  const pings = gainTo(1, music);
  pings.connect(echo);
  function modem(t, to) {
    // its two tones, switching at random like data, a breath in and out
    const [lo, hi] = WIRED_MODEM[Math.floor(Math.random() * WIRED_MODEM.length)];
    const len = rand(0.15, 0.6);
    const o = ctx.createOscillator();
    o.type = 'square';
    for (let s = 0; s < len; s += 0.012) o.frequency.setValueAtTime(Math.random() < 0.5 ? lo : hi, t + s);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.004, t + 0.015);
    g.gain.setValueAtTime(0.004, t + len - 0.03);
    g.gain.linearRampToValueAtTime(0, t + len);
    o.connect(g).connect(filter('bandpass', 1700, 0.8, to));
    o.start(t);
    o.stop(t + len + 0.05);
  }
  (function ping() {
    timers.push(setTimeout(() => {
      if (running()) {
        const t = ctx.currentTime + 0.05;
        const at = panTo(rand(-0.6, 0.6), pings);
        const r = Math.random();
        if (r < 0.25) {
          if (plays('bed', 'chatter')) {
            if (Math.random() < 0.5) modem(t, at);
            else for (let i = 0; i < 7; i++) tone(M, t + i * 0.035, { type: 'square', f: rand(900, 2600), dur: 0.03, gain: 0.006, lp: 3500, to: at });
          }
        } else if (plays('bed', 'ping')) {
          const notes = WIRED_PINGS[chord];
          const f = notes[Math.floor(Math.random() * notes.length)];
          const type = Math.random() < 0.5 ? 'sine' : 'triangle';
          // a lone ping, or the same one calling again, softer
          const k = r < 0.4 ? 2 + Math.floor(Math.random() * 2) : 1;
          for (let i = 0; i < k; i++) tone(M, t + i * 0.2, { type, f, dur: i ? 0.5 : 1.2, gain: 0.02 * 0.6 ** i, a: 0.01, to: at });
        }
      }
      ping();
    }, rand(4000, 11000)));
  })();

  return {
    setTension(x) {
      if (x === tension) return;
      tension = x;
      const t = ctx.currentTime;
      tapeLP.frequency.setTargetAtTime(2800 + x * 1400, t, 2);
      if (drone && opens) {
        sides.forEach((side) => side.frequency.setTargetAtTime(420 + x * 700, t, 2));
        droneG.gain.setTargetAtTime(0.12 + x * 0.06, t, 2);
      } else if (opens) droneG.gain.setTargetAtTime(x * 0.06, t, 2);
    },
    stop() {
      timers.forEach((id) => (clearTimeout(id), clearInterval(id)));
      oscs.forEach((o) => o.stop());
      mus.stop();
    },
  };
}

// The machine room: mains hum and a bad lamp circuit, server fans breathing, a CRT's
// whine, under its music (the Wired, unless ⚙ picks another). Tension spins the fans up
// a little and strains the racks' power, a high whine; a hit spins the fans up hard.
function roulette(E) {
  const { ctx } = E;
  const out = ctx.createGain();
  out.gain.value = 0;
  out.gain.setTargetAtTime(1, ctx.currentTime, 1.5);
  out.connect(E.bedBus);
  const { oscs, osc, filter, gainTo } = kit(E);

  // the room (ambience): mains hum (50 Hz and up) and the buzz of the lamp's bad circuit
  const amb = ambGain(E, gainTo(BED, out));
  for (const [f, g] of [[50, 0.035], [100, 0.04], [150, 0.018], [200, 0.01]]) osc('sine', f, g, amb);
  osc('sawtooth', 50, 0.02, filter('bandpass', 360, 6, amb));

  // server fans: a rumble and moving air, breathing slowly; a faint blade tone
  const fans = gainTo(1, amb);
  const fanSrc = ctx.createBufferSource();
  fanSrc.buffer = E.noise;
  fanSrc.loop = true;
  const rumble = gainTo(0.22, fans);
  fanSrc.connect(filter('lowpass', 180, 0.7, rumble));
  const airG = gainTo(0.05, fans);
  const air = filter('bandpass', 900, 0.7, airG);
  fanSrc.connect(air);
  fanSrc.start();
  const breath = gainTo(0.25, fans.gain);
  osc('sine', 0.11, 1, breath);
  osc('sine', 117, 0.006, fans);

  // CRT whine, barely there
  osc('sine', 15625, 0.0035, amb);

  // with tension, the racks' power straining: a high whine of two close tones, beating
  // (until 2026-10-31 the Wired's "rub": a sound of the room, not of its music)
  const strain = gainTo(0, amb);
  osc('sine', 1864.66, 1, strain);
  osc('sine', 1975.53, 1, strain);

  const music = musicSlot(E, out, 'wired');
  let tension = 0;
  function setTension(x) {
    if (x === tension) return;
    tension = x;
    music.setTension(x);
    airG.gain.setTargetAtTime(0.05 + x * 0.05, ctx.currentTime, 2);
    strain.gain.setTargetAtTime(x * 0.007, ctx.currentTime, 1.5);
  }

  let wasYours = false;
  return {
    react(kind, t = ctx.currentTime) {
      if (kind === 'spin') {
        // a hit spins the fans up
        airG.gain.setTargetAtTime(0.22, t, 0.15);
        air.frequency.setTargetAtTime(2200, t, 0.15);
        airG.gain.setTargetAtTime(0.05 + tension * 0.05, t + 0.8, 1.2);
        air.frequency.setTargetAtTime(900, t + 0.8, 1.2);
      } else if (kind === 'down') out.gain.setTargetAtTime(0.2, t, 0.6);
      else if (kind === 'up') out.gain.setTargetAtTime(1, t, 0.8);
    },
    mood(v) {
      const playing = v.phase === 'playing';
      // the danger rises when anyone is down to their last 额度 or the gun to its last shells
      const low = playing ? Math.min(...v.seats.map((s) => s.hp)) : 9;
      const x = (low <= 1 ? 0.55 : low === 2 ? 0.25 : 0) + (!playing ? 0 : v.left === 1 ? 0.45 : v.left === 2 ? 0.2 : 0);
      setTension(Math.min(1, x));
      const yours = playing && v.turn === v.you;
      if (yours && !wasYours) sfx('turn');
      wasYours = yours;
    },
    stop() {
      music.stop();
      out.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
      E.ambs.delete(amb);
      setTimeout(() => {
        oscs.forEach((o) => o.stop());
        fanSrc.stop();
        out.disconnect();
      }, 2000);
    },
  };
}

// ---- 21 and Yacht: the game sounds -------------------------------------------------
// Unlike roulette's, every 21 and Yacht sound plays the moment it is called: the clients call
// each one beside the animation it belongs to.

// An electric piano: a two-operator FM voice, bright at the strike and mellowing.
function epiano(E, t, f, { dur = 1.2, gain = 0.06, verb = 0.3, to = E.out } = {}) {
  const { ctx } = E;
  const car = ctx.createOscillator();
  car.frequency.value = f;
  const mod = ctx.createOscillator();
  mod.frequency.value = f;
  const idx = ctx.createGain();
  idx.gain.setValueAtTime(f * 1.6, t);
  idx.gain.exponentialRampToValueAtTime(f * 0.15, t + Math.min(dur, 0.8));
  mod.connect(idx).connect(car.frequency);
  const g = ctx.createGain();
  envelope(g.gain, t, 0.004, gain, dur);
  car.connect(g).connect(to);
  wet(E, g, verb);
  // the tine's ping
  tone(E, t, { f: f * 7.1, dur: 0.08, gain: gain * 0.12, a: 0.001, to });
  for (const o of [car, mod]) {
    o.start(t);
    o.stop(t + dur + 0.1);
  }
}
const chordAt = (E, t, notes, o) => notes.forEach((f) => epiano(E, t, f, o));

// an upright bass note: a pluck with a little pitch drop, dark
function bass(E, t, f, { dur = 0.5, gain = 0.22, to = E.out } = {}) {
  tone(E, t, { type: 'triangle', f: f * 1.02, f1: f, dur, gain, a: 0.008, lp: 700, to });
  tone(E, t, { f: f * 2, dur: 0.06, gain: gain * 0.25, a: 0.002, to });
}

// a clay chip on a stack: short bright partials and a tick
function clack(E, t, k = 1) {
  const r = rand(0.9, 1.1);
  for (const [f, d, g] of [[3150, 0.03, 0.07], [4720, 0.022, 0.05], [6080, 0.015, 0.035], [1900, 0.02, 0.03]]) {
    tone(E, t, { f: f * r, dur: d, gain: g * k, a: 0.0005 });
  }
  hiss(E, t, { f: 5000, q: 1.5, dur: 0.008, gain: 0.12 * k });
}
// a die on felt or wood
function knock(E, t, k = 1, bright = 1) {
  const r = rand(0.85, 1.15);
  tone(E, t, { f: 1450 * r * bright, dur: 0.025, gain: 0.06 * k, a: 0.0005 });
  tone(E, t, { f: 2380 * r * bright, dur: 0.015, gain: 0.04 * k, a: 0.0005 });
  hiss(E, t, { f: 2500 * bright, q: 2, dur: 0.012, gain: 0.14 * k });
  tone(E, t, { f: 180 * r, f1: 110, dur: 0.03, gain: 0.08 * k });
}
// one paper card snapping
function snap(E, t, k = 1) {
  hiss(E, t, { type: 'highpass', f: 3500, dur: 0.01, gain: 0.25 * k, a: 0.0005 });
  hiss(E, t, { f: 1700, q: 1.2, dur: 0.03, gain: 0.12 * k });
}
// felt: something sliding over it
const slide = (E, t, dur, gain = 0.12, f = 1400) => hiss(E, t, { type: 'lowpass', f, f1: f * 0.6, dur, a: dur * 0.4, gain });
const brushCrash = (E, t, gain = 0.06) => hiss(E, t, { type: 'highpass', f: 5000, dur: 1.4, gain, a: 0.003, verb: 0.4 });

const CASINO_SFX = {
  // 21
  shuffle(E, t) {
    // a riffle: the two halves fall in, faster in the middle, then the bridge and a tap
    let at = t;
    for (let i = 0; i < 36; i++) {
      snap(E, at, 0.35 + Math.sin((i / 36) * Math.PI) * 0.4);
      at += 0.028 - Math.sin((i / 36) * Math.PI) * 0.016;
    }
    hiss(E, at, { f: 2200, q: 0.8, dur: 0.22, a: 0.05, gain: 0.1 });
    tone(E, at + 0.3, { f: 150, f1: 90, dur: 0.05, gain: 0.2 });
    hiss(E, at + 0.3, { type: 'lowpass', f: 900, dur: 0.03, gain: 0.2 });
  },
  card(E, t) {
    hiss(E, t, { f: 2600, f1: 1200, q: 0.9, dur: 0.07, a: 0.03, gain: 0.14 });
    tone(E, t + 0.09, { f: 160, f1: 90, dur: 0.03, gain: 0.1 });
    hiss(E, t + 0.09, { type: 'lowpass', f: 1500, dur: 0.02, gain: 0.08 });
  },
  flip(E, t) {
    snap(E, t, 1);
    hiss(E, t + 0.02, { f: 3000, f1: 1800, q: 1, dur: 0.05, gain: 0.05 });
  },
  chips(E, t, { amount = 50000 } = {}) {
    // 1k → 2 chips, 1M → 8: a slide over the felt, then the stack clacking in
    const n = Math.max(2, Math.min(9, Math.round(Math.log10(Math.max(1000, amount) / 1000) * 2 + 2)));
    slide(E, t, 0.12, 0.08);
    let at = t + 0.1;
    for (let i = 0; i < n; i++) {
      clack(E, at, i === n - 1 ? 1 : rand(0.5, 0.9));
      at += rand(0.025, 0.055);
    }
  },
  stand(E, t) {
    // two knuckle knocks on the felt
    for (const dt of [0, 0.14]) {
      tone(E, t + dt, { f: 120, f1: 70, dur: 0.06, gain: 0.3 });
      hiss(E, t + dt, { type: 'lowpass', f: 700, dur: 0.03, gain: 0.15 });
    }
  },
  fold(E, t) {
    // cards tossed face down, and a little shrug
    hiss(E, t, { f: 2000, f1: 900, q: 0.8, dur: 0.18, a: 0.06, gain: 0.14 });
    tone(E, t + 0.2, { f: 140, f1: 80, dur: 0.04, gain: 0.12 });
    epiano(E, t + 0.25, 392, { dur: 0.25, gain: 0.04 });
    epiano(E, t + 0.4, 329.63, { dur: 0.5, gain: 0.04 });
  },
  reveal(E, t) {
    snap(E, t, 1);
    snap(E, t + 0.11, 1);
    // a low chord hangs while the totals sink in
    chordAt(E, t, [103.83, 155.56, 196, 261.63], { dur: 1.6, gain: 0.04, verb: 0.5 });
  },
  natural(E, t) {
    [523.25, 659.25, 783.99, 987.77, 1174.66].forEach((f, i) => epiano(E, t + i * 0.06, f, { dur: 0.9, gain: 0.05, verb: 0.5 }));
    for (const f of [2093, 2637]) tone(E, t + 0.32, { f, dur: 1, gain: 0.03, verb: 0.6 });
    brushCrash(E, t + 0.3, 0.04);
  },
  bust(E, t, { who = 'you' } = {}) {
    if (who === 'you') {
      // a deflated two-note fall and a dull thud
      epiano(E, t, 349.23, { dur: 0.3, gain: 0.06 });
      epiano(E, t + 0.22, 277.18, { dur: 0.9, gain: 0.06 });
      tone(E, t + 0.22, { f: 90, f1: 55, dur: 0.25, gain: 0.25 });
    } else {
      // theirs: a bass slide down, a little gleeful
      tone(E, t, { type: 'triangle', f: 196, f1: 73.42, dur: 0.4, gain: 0.25, lp: 900 });
      epiano(E, t + 0.3, 587.33, { dur: 0.4, gain: 0.04 });
    }
  },
  push(E, t) {
    epiano(E, t, 523.25, { dur: 0.3, gain: 0.05 });
    epiano(E, t + 0.2, 523.25, { dur: 0.6, gain: 0.05 });
  },
  sweep(E, t, { toYou = false, pot = 0 } = {}) {
    slide(E, t, 0.5, 0.16);
    const n = Math.max(3, Math.min(12, Math.round(pot / 100000) + 3));
    let at = t + 0.35;
    for (let i = 0; i < n; i++) {
      clack(E, at, rand(0.4, 0.9));
      at += rand(0.02, 0.045);
    }
    if (toYou) chordAt(E, t + 0.4, [261.63, 329.63, 392, 493.88], { dur: 1.4, gain: 0.035, verb: 0.5 });
    if (toYou && pot >= 600000) CASINO_SFX.bigwin(E, at);
  },
  bigwin(E, t) {
    // bells running up and a brassy swell
    [1046.5, 1318.5, 1568, 2093, 2637, 3136].forEach((f, i) => tone(E, t + i * 0.07, { type: 'triangle', f, dur: 0.5, gain: 0.04, verb: 0.5 }));
    for (const f of [261.63, 329.63, 392, 523.25]) {
      tone(E, t + 0.1, { type: 'sawtooth', f, dur: 1.2, a: 0.12, gain: 0.025, lp: 2200, verb: 0.4 });
    }
    brushCrash(E, t + 0.1, 0.07);
  },

  // Yacht
  rattle(E, t, { dur = 0.6 } = {}) {
    // dice inside a leather cup: shakes about 7 times a second, muffled clacks in each
    const cup = lowpass(E, 2600, E.out);
    const inCup = { ...E, out: cup };
    for (let s = 0; s < dur; s += 0.14) {
      tone(E, t + s, { f: 110, f1: 80, dur: 0.05, gain: 0.12 });
      for (let i = 0; i < 4; i++) knock(inCup, t + s + rand(0, 0.12), rand(0.4, 1), 0.8);
    }
  },
  roll(E, t, { count = 5 } = {}) {
    // each die bounces three to five times, the bounces closing up and quieting
    for (let d = 0; d < count; d++) {
      let at = t + rand(0, 0.08);
      let gap = rand(0.09, 0.14);
      let k = 1;
      const n = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        knock(E, at, k);
        at += gap;
        gap *= 0.62;
        k *= 0.6;
      }
    }
    slide(E, t, 0.4, 0.06, 2000);
  },
  keep(E, t) {
    knock(E, t, 0.7);
    tone(E, t + 0.02, { type: 'triangle', f: 660, f1: 990, dur: 0.07, gain: 0.05 });
  },
  unkeep(E, t) {
    knock(E, t, 0.6);
    tone(E, t + 0.02, { type: 'triangle', f: 990, f1: 660, dur: 0.07, gain: 0.04 });
  },
  score(E, t, { points = 1 } = {}) {
    if (!points) {
      // a hard line through the box
      hiss(E, t, { f: 3500, f1: 2200, q: 2, dur: 0.28, a: 0.02, gain: 0.12 });
      epiano(E, t + 0.05, 220, { dur: 0.4, gain: 0.035 });
      return;
    }
    // pencil strokes, one per digit and a bit
    const strokes = String(points).length + 2;
    let at = t;
    for (let i = 0; i < strokes; i++) {
      const d = rand(0.05, 0.11);
      hiss(E, at, { f: rand(3500, 5200), q: 2.5, dur: d, a: 0.01, gain: 0.07 });
      at += d + rand(0.02, 0.05);
    }
    tone(E, at, { type: 'triangle', f: 880, dur: 0.12, gain: 0.04 });
  },
  yacht(E, t) {
    // a fanfare: brassy saws climbing to a held chord, bells, a crash
    const brass = (at, f, dur) => {
      tone(E, at, { type: 'sawtooth', f, dur, a: 0.03, gain: 0.04, lp: 2400, verb: 0.4 });
      tone(E, at, { type: 'sawtooth', f: f * 1.004, dur, a: 0.03, gain: 0.03, lp: 2400 });
    };
    [392, 523.25, 659.25].forEach((f, i) => brass(t + i * 0.12, f, 0.12));
    for (const f of [523.25, 659.25, 783.99, 1046.5]) brass(t + 0.38, f, 1.3);
    bass(E, t + 0.38, 130.81, { dur: 1.2, gain: 0.3 });
    [2093, 2637, 3136].forEach((f, i) => tone(E, t + 0.4 + i * 0.08, { f, dur: 1.2, gain: 0.03, verb: 0.6 }));
    brushCrash(E, t + 0.38, 0.08);
  },
  bonus(E, t) {
    chordAt(E, t, [349.23, 440, 523.25, 659.25], { dur: 0.6, gain: 0.04 });
    chordAt(E, t + 0.3, [392, 493.88, 587.33, 783.99], { dur: 1.2, gain: 0.04, verb: 0.5 });
    for (const [dt, f] of [[0.3, 1568], [0.42, 2093]]) tone(E, t + dt, { type: 'triangle', f, dur: 0.6, gain: 0.04, verb: 0.5 });
  },
};
// balanced against each other by their measured peaks (sounds/index.html)
for (const [name, k] of [['score', 2.5], ['push', 2], ['bigwin', 2], ['card', 1.6], ['keep', 1.6], ['unkeep', 1.6], ['natural', 1.6], ['roll', 1.5], ['fold', 1.5], ['bonus', 1.5]]) {
  CASINO_SFX[name] = boost(k, CASINO_SFX[name]);
}
Object.assign(SFX, CASINO_SFX);

// The game-end sounds in the casino's own voice. The live sfx() prefers a vibe's version.
const CASINO_END = {
  win(E, t) {
    chordAt(E, t, [293.66, 369.99, 440, 554.37, 659.25], { dur: 2, gain: 0.05, verb: 0.5 });
    [73.42, 92.5, 110, 146.83].forEach((f, i) => bass(E, t + i * 0.14, f, { dur: 0.3 }));
    brushCrash(E, t, 0.07);
    tone(E, t + 0.5, { f: 2349.3, dur: 1.4, gain: 0.03, verb: 0.6 });
  },
  lose(E, t) {
    E.bed?.react('down', t);
    chordAt(E, t, [349.23, 415.3, 523.25], { dur: 0.6, gain: 0.05 });
    chordAt(E, t + 0.5, [293.66, 349.23, 440], { dur: 0.6, gain: 0.05 });
    chordAt(E, t + 1, [233.08, 277.18, 349.23], { dur: 2, gain: 0.05, verb: 0.5 });
    bass(E, t + 1, 58.27, { dur: 1.5, gain: 0.3 });
  },
  over(E, t) {
    chordAt(E, t, [293.66, 392, 440, 587.33], { dur: 1.6, gain: 0.045, verb: 0.5 });
  },
};
export const VIBE_SFX = { blackjack: CASINO_END, yacht: CASINO_END };

// ---- the raft: where 21 and Yacht are played -----------------------------------------
// A log raft on open sea at dusk, with Lantern playing (TRACKS). The water laps at
// the raft's edges all round; now and then a far gull, a creak of wood or rope, the float
// plopping, the cat purring. Sparse and still. Each sound sits where the scene says its
// source is (E.places, from placeSound): the water at the edges, the float at the back
// right with the cat beside it.

// The music: a slow brushed lounge trio (electric piano, upright bass, brushes and a soft
// ride), looping four bars. Tension (a big pot, a close game late on)
// fills it in: the bass walks every beat, the ride and brushes busy up, a low pad comes in.
const CASINO_BED = 1;
const BPM = 66;
// ii-V-I-vi in D flat: Ebm9, Ab13, Dbmaj9, Bbm9 (voicings over the bass)
const LOUNGE = [
  { bass: [77.78, 116.54, 110], keys: [185, 233.08, 277.18, 349.23] },
  { bass: [103.83, 155.56, 73.42], keys: [185, 261.63, 349.23, 415.3] },
  { bass: [69.3, 103.83, 61.74], keys: [174.61, 207.65, 261.63, 311.13] },
  { bass: [58.27, 87.31, 82.41], keys: [138.59, 174.61, 207.65, 261.63] },
];

// Where the raft's sounds come from when the scene hasn't said (pans, -1 left to 1 right):
// the water at the left, right and near edges, the float at the back right.
const RAFT_AT = { water: [-0.75, 0.75, 0], float: 0.5 };

// a little slap of water on the logs: a soft filtered splash, often a bubble's blub
function lap(E, t, k = 1) {
  hiss(E, t, { f: rand(550, 900), f1: rand(260, 380), q: 1.1, dur: rand(0.12, 0.26), a: 0.012, gain: 0.05 * k, verb: 0.08 });
  if (Math.random() < 0.6) {
    const f = rand(230, 340);
    tone(E, t + rand(0.02, 0.08), { f, f1: f * rand(1.6, 2), dur: 0.05, gain: 0.022 * k, a: 0.004 });
  }
}
// wood or rope taking the strain: a low groan whose pitch wanders unevenly, muffled
function creak(E, t, k = 1) {
  const { ctx } = E;
  const dur = rand(0.45, 0.9);
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  const f = rand(90, 140);
  o.frequency.setValueAtTime(f, t);
  o.frequency.linearRampToValueAtTime(f * rand(0.8, 1.25), t + dur);
  // the grain catching and letting go: slow noise bending the pitch
  const src = ctx.createBufferSource();
  src.buffer = E.noise;
  src.loop = true;
  const slow = ctx.createBiquadFilter();
  slow.type = 'lowpass';
  slow.frequency.value = 18;
  const bend = ctx.createGain();
  bend.gain.value = f * 2;
  src.connect(slow).connect(bend).connect(o.frequency);
  const body = ctx.createBiquadFilter();
  body.type = 'bandpass';
  body.frequency.value = rand(350, 600);
  body.Q.value = 2.5;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.03 * k, t + dur * 0.35);
  g.gain.linearRampToValueAtTime(0, t + dur);
  o.connect(body).connect(lowpass(E, 1400, g));
  g.connect(E.out);
  wet(E, g, 0.15);
  for (const x of [o, src]) {
    x.start(t);
    x.stop(t + dur + 0.05);
  }
}
// the float bobbing: a small soft plop
function plop(E, t) {
  const f = rand(320, 460);
  tone(E, t, { f, f1: f * rand(1.8, 2.2), dur: 0.06, gain: 0.03, a: 0.004, verb: 0.15 });
  hiss(E, t, { f: 900, q: 1, dur: 0.06, a: 0.004, gain: 0.01 });
}
// the cat purring: a low burble pulsing about 25 times a second, breathing in and out
function purr(E, t, secs = 5) {
  const { ctx } = E;
  const src = ctx.createBufferSource();
  src.buffer = E.noise;
  src.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 360;
  lp.Q.value = 0.8;
  const pulse = ctx.createGain();
  pulse.gain.value = 0.5;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 25;
  const depth = ctx.createGain();
  depth.gain.value = 0.5;
  lfo.connect(depth).connect(pulse.gain);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  // in (a touch softer and slower), out
  let at = t;
  while (at < t + secs) {
    const inn = rand(0.7, 0.9);
    const out = rand(0.8, 1);
    lfo.frequency.setValueAtTime(rand(22, 24), at);
    g.gain.setTargetAtTime(0.045, at, 0.1);
    g.gain.setTargetAtTime(0.005, at + inn, 0.04);
    lfo.frequency.setValueAtTime(rand(25, 27), at + inn + 0.08);
    g.gain.setTargetAtTime(0.06, at + inn + 0.08, 0.1);
    g.gain.setTargetAtTime(0, at + inn + out, 0.06);
    at += inn + out + rand(0.15, 0.3);
  }
  src.connect(lp).connect(pulse).connect(g).connect(E.out);
  src.start(t, Math.random() * 2);
  lfo.start(t);
  for (const x of [src, lfo]) x.stop(at + 0.5);
}
Object.assign(SFX, { lap, creak, plop, purr });

// The sea around the raft, quiet under the music. Returns its running sources and a stop.
const RAFT_LEVEL = 2.2;
function raftSea(E, to, timers) {
  const { ctx } = E;
  const running = () => E.running();
  const layer = ctx.createGain();
  layer.gain.value = RAFT_LEVEL;
  layer.connect(to);
  const sources = [];
  const noise = () => {
    const n = ctx.createBufferSource();
    n.buffer = E.noise;
    n.loop = true;
    n.start(0, Math.random() * 2);
    sources.push(n);
    return n;
  };
  // panners that follow the scene's places
  const pans = [];
  const panner = (pick, fallback) => {
    const p = ctx.createStereoPanner();
    p.pan.value = pick(E.places) ?? fallback;
    p.connect(layer);
    pans.push({ p, pick, fallback });
    return p;
  };
  const place = (places) => pans.forEach(({ p, pick, fallback }) => p.pan.setTargetAtTime(pick(places) ?? fallback, ctx.currentTime, 0.3));
  E.placers.add(place);
  const every = (min, max, fn) => (function loop() {
    timers.push(setTimeout(() => {
      if (running()) fn(ctx.currentTime + 0.05);
      loop();
    }, rand(min, max)));
  })();

  // the open sea, far and wide: a low wash on either side, drifting
  for (const side of [-0.8, 0.8]) {
    const p = ctx.createStereoPanner();
    p.pan.value = side;
    p.connect(layer);
    const g = ctx.createGain();
    g.gain.value = 0.02;
    g.connect(p);
    noise().connect(lowpass(E, 220, g));
    const o = ctx.createOscillator();
    o.frequency.value = rand(0.04, 0.07);
    const d = ctx.createGain();
    d.gain.value = 0.008;
    o.connect(d).connect(g.gain);
    o.start();
    sources.push(o);
  }

  // the water at the raft's edges, each on its own clock: a swell rises against the logs,
  // slaps and gurgles a little, and draws back
  RAFT_AT.water.forEach((fallback, i) => {
    const p = panner((pl) => pl.water?.[i]?.pan, fallback);
    const g = ctx.createGain();
    g.gain.value = 0.012;
    g.connect(p);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;
    lp.Q.value = 0.6;
    lp.connect(g);
    noise().connect(lp);
    const W = { ...E, out: p };
    (function swell() {
      const period = rand(3.5, 7.5);
      if (running()) {
        const t = ctx.currentTime + 0.05;
        const k = rand(0.55, 1);
        g.gain.setTargetAtTime(0.045 * k, t, period * 0.12);
        lp.frequency.setTargetAtTime(650, t, period * 0.12);
        g.gain.setTargetAtTime(0.012, t + period * 0.3, period * 0.15);
        lp.frequency.setTargetAtTime(320, t + period * 0.3, period * 0.15);
        const at = t + period * rand(0.2, 0.32);
        for (let j = 0, n = Math.floor(rand(1, 3.6)); j < n; j++) lap(W, at + j * rand(0.08, 0.22), k * rand(0.6, 1));
      }
      timers.push(setTimeout(swell, period * 1000));
    })();
  });

  // the sparse things: a creak somewhere in the raft, the float, the cat, a far gull
  const creakAt = panner(() => null, 0);
  every(18000, 40000, (t) => {
    creakAt.pan.setValueAtTime(rand(-0.6, 0.6), t);
    creak({ ...E, out: creakAt }, t, rand(0.6, 1));
  });
  const floatAt = panner((pl) => pl.float?.pan, RAFT_AT.float);
  every(14000, 35000, (t) => {
    plop({ ...E, out: floatAt }, t);
    if (Math.random() < 0.3) plop({ ...E, out: floatAt }, t + rand(0.4, 0.9));
  });
  const catAt = panner((pl) => (pl.float ? pl.float.pan * 0.8 : null), RAFT_AT.float * 0.8);
  every(45000, 100000, (t) => purr({ ...E, out: catAt }, t, rand(4, 7)));
  const gullAt = panner(() => null, 0);
  every(50000, 100000, (t) => {
    gullAt.pan.setValueAtTime(rand(-0.7, 0.7), t);
    SFX.gull({ ...E, out: gullAt }, t);
  });
  return { sources, stop: () => E.placers.delete(place) };
}

// one "kee-ow": up, then falling, nasal and a little rough
function gullCall(E, t, p = 1) {
  const { ctx } = E;
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(1150 * p, t);
  o.frequency.linearRampToValueAtTime(1650 * p, t + 0.06);
  o.frequency.exponentialRampToValueAtTime(950 * p, t + 0.26);
  const rough = ctx.createOscillator();
  rough.frequency.value = 55;
  const rg = ctx.createGain();
  rg.gain.value = 60 * p;
  rough.connect(rg).connect(o.frequency);
  const b = ctx.createBiquadFilter();
  b.type = 'bandpass';
  b.frequency.value = 2100 * p;
  b.Q.value = 2.5;
  const g = ctx.createGain();
  envelope(g.gain, t, 0.03, 0.036, 0.25);
  o.connect(b).connect(g).connect(E.out);
  wet(E, g, 0.6);
  for (const x of [o, rough]) {
    x.start(t);
    x.stop(t + 0.35);
  }
}
// a far gull, one call, now and then two (in SFX so the sound board can audition it)
SFX.gull = (E, t) => {
  const far = { ...E, out: lowpass(E, 3200, E.out) };
  const n = Math.random() < 0.75 ? 1 : 2;
  const p = rand(0.9, 1.15);
  for (let i = 0; i < n; i++) gullCall(far, t + i * rand(0.35, 0.45), p * (i ? 0.92 : 1));
};

// The lounge trio (see LOUNGE above; shelved until it has a scene of its own: SHELVED). A track plays into to and returns
// { setTension(x), stop() }; tension 0 to 1 comes from whichever scene it plays in.
function lounge(E, to) {
  const { ctx } = E;
  const timers = [];
  const running = () => E.running();
  // the music, as it is or out of the radio (musicBus); the trio sits behind a dark
  // lowpass: smoke
  const mus = musicBus(E, to);
  const smoke = lowpass(E, 3200, mus.in);
  const M = { ...mus.E, out: smoke };

  // the pad that comes in with tension
  const pad = ctx.createGain();
  pad.gain.value = 0;
  pad.connect(lowpass(E, 900, mus.in));
  const padOscs = [];
  for (const f of [138.59, 207.65, 277.18]) {
    for (const c of [-8, 8]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = c;
      o.connect(pad);
      o.start();
      padOscs.push(o);
    }
  }

  // the trio, scheduled a little ahead of the clock
  const beat = 60 / BPM;
  let tension = 0;
  let next = 0; // time of the next beat
  let n = 0; // beats played
  timers.push(setInterval(() => {
    const now = ctx.currentTime;
    if (!running()) return;
    if (next < now) next = now + 0.1;
    while (next < now + 0.2) {
      playBeat(next, n);
      next += beat;
      n++;
    }
  }, 25));
  function playBeat(t, i) {
    const bar = LOUNGE[Math.floor(i / 4) % LOUNGE.length];
    const b = i % 4;
    const swing = beat * (2 / 3); // the "and" of a swung beat
    const busy = tension;
    // bass: half notes, walking every beat as it gets tense, a pickup into the next bar
    if (b === 0) bass(M, t, bar.bass[0], { dur: beat * 1.6 });
    else if (b === 2) bass(M, t, bar.bass[1], { dur: beat * 1.6 });
    else if (busy > 0.4) bass(M, t, bar.bass[b === 1 ? 0 : 1] * 1.1225, { dur: beat * 0.8, gain: 0.18 });
    if (b === 3) bass(M, t + swing, bar.bass[2], { dur: beat * 0.3, gain: 0.12 });
    // keys: the chord on one, sometimes a push on the and of two
    if (b === 0) chordAt(M, t, bar.keys, { dur: beat * 3, gain: 0.032, verb: 0.35 });
    if (b === 1 && Math.random() < 0.35 + busy * 0.4) chordAt(M, t + swing, bar.keys, { dur: beat * 0.8, gain: 0.022, verb: 0.35 });
    if (busy > 0.6 && b === 3) epiano(M, t, bar.keys[3] * 2, { dur: beat, gain: 0.02, verb: 0.4 });
    // brushes: a stir on every beat, a tap on two and four
    hiss(M, t, { f: 3200, q: 0.6, dur: beat * 0.6, a: beat * 0.3, gain: 0.018 + busy * 0.012 });
    if (b % 2) hiss(M, t, { f: 2500, q: 0.8, dur: 0.12, a: 0.004, gain: 0.05 + busy * 0.03 });
    // ride: ting, ting-a-ting
    const ride = (at, k) => {
      tone(M, at, { type: 'square', f: 5200 * rand(0.99, 1.01), dur: 0.25, gain: 0.004 * k, a: 0.001 });
      hiss(M, at, { type: 'highpass', f: 6000, dur: 0.2, gain: 0.012 * k });
    };
    ride(t, b % 2 ? 1 : 0.8);
    if (b % 2 || busy > 0.5) ride(t + swing, 0.55);
  }
  return {
    setTension(x) {
      if (x === tension) return;
      tension = x;
      pad.gain.setTargetAtTime(x * 0.025, ctx.currentTime, 2);
    },
    stop() {
      timers.forEach((id) => (clearTimeout(id), clearInterval(id)));
      padOscs.forEach((o) => o.stop());
      mus.stop();
    },
  };
}

// Lantern: a slow lofi beat for a quiet evening at sea. Dusty electric piano sliding down
// Dbmaj9, Cm7, Fm9 and home to Abmaj9 over a warm pad, a round bass, a soft kick and a
// laid-back rim, lazy, deeply swung hats on a slightly wobbly tape, the whole of it
// swelling and easing once a bar like a boat on the swell, and now and then a little tune
// on a soft flute-like lead. Tension brings in busier hats and a few high notes over the
// chords.
const LANTERN_BPM = 72;
const LANTERN_LEVEL = 1.7;
const LANTERN_RADIO = 0.38; // its radio makeup (musicBus), level with it played straight
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const LANTERN = [
  { bass: 37, keys: [53, 56, 60, 63] }, // Dbmaj9
  { bass: 36, keys: [55, 58, 60, 63] }, // Cm7
  { bass: 41, keys: [56, 60, 63, 67] }, // Fm9
  { bass: 44, keys: [60, 63, 67, 70] }, // Abmaj9
].map((c) => ({ bass: mtof(c.bass), keys: c.keys.map(mtof) }));
const LANTERN_TOP = [75, 77, 80, 82, 84].map(mtof); // Ab major pentatonic, up high
// the lead's little tunes, two bars each: [beat, MIDI, beats long] (on the and: swung)
const LANTERN_TUNES = [
  [[0, 80, 1.5], [1.5, 77, 0.5], [2, 75, 2], [4.5, 72, 1], [5.5, 75, 2.5]],
  [[0.5, 72, 0.5], [1, 75, 0.5], [1.5, 77, 1], [2.5, 80, 1.5], [4, 82, 1], [5, 80, 3]],
  [[0, 84, 1], [1, 82, 0.5], [1.5, 80, 1.5], [3, 77, 1], [4.5, 75, 3.5]],
  [[1, 77, 0.5], [1.5, 80, 0.5], [2, 82, 2], [4.5, 80, 0.5], [5, 77, 1], [6, 75, 2]],
];
// (t0: when the loops it plays with start, so its beat falls on theirs)
function lantern(E, to, plays = ALL, t0 = null) {
  const { ctx } = E;
  const timers = [];
  const running = () => E.running();
  const level = ctx.createGain();
  level.gain.value = LANTERN_LEVEL;
  level.connect(to);
  const mus = musicBus(E, level, LANTERN_RADIO);
  // the tape: a little wow and flutter, the highs rolled off
  const tape = ctx.createDelay(0.1);
  tape.delayTime.value = 0.02;
  // the swell: the whole of it rising and easing once a bar (playBeat rocks it)
  const sway = ctx.createGain();
  tape.connect(sway).connect(mus.in);
  const wobble = [];
  for (const [rate, depth] of [[0.45, 0.0014], [3.3, 0.00012]]) {
    const o = ctx.createOscillator();
    o.frequency.value = rate;
    const d = ctx.createGain();
    d.gain.value = depth;
    o.connect(d).connect(tape.delayTime);
    o.start();
    wobble.push(o);
  }
  const M = { ...mus.E, out: lowpass(E, 2600, tape) };
  const MH = { ...mus.E, out: lowpass(E, 9000, tape) }; // (the hats and the rim: brighter)
  const { oscs, osc } = kit(E);

  // the pad: two saws a note a little apart, left and right, warm and closed, breathing
  // slowly; it moves to each bar's chord
  const padG = ctx.createGain();
  padG.gain.value = 0.015;
  padG.connect(tape);
  const padF = lowpass(E, 650, padG);
  const pads = plays('bed', 'pad') ? LANTERN[0].keys.flatMap((f) => [-0.5, 0.5].map((p, k) => {
    const pan = ctx.createStereoPanner();
    pan.pan.value = p;
    pan.connect(padF);
    const o = osc('sawtooth', f, 0.5, pan);
    o.detune.value = k ? 8 : -8;
    return o;
  })) : [];
  if (pads.length) osc('sine', 0.05, 150, padF.frequency);

  // the lead: a soft triangle with a slow vibrato coming in, like a far flute
  function lead(t, m, len) {
    const f = mtof(m);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const vib = ctx.createOscillator();
    vib.frequency.value = 4.8;
    const vd = ctx.createGain();
    vd.gain.setValueAtTime(0, t);
    vd.gain.linearRampToValueAtTime(f * 0.006, t + 0.45);
    vib.connect(vd).connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.02, t + 0.05);
    g.gain.setTargetAtTime(0.014, t + 0.05, 0.3);
    g.gain.setTargetAtTime(0, t + len * 0.92, 0.1);
    o.connect(g).connect(M.out);
    wet(M, g, 0.45);
    for (const x of [o, vib]) {
      x.start(t);
      x.stop(t + len + 0.8);
    }
  }
  let tuneUntil = 0;

  const beat = 60 / LANTERN_BPM;
  const swing = 0.66; // where the off-beat eighth falls, in beats: lazy, near a triplet
  let tension = 0;
  let next = t0 ?? 0;
  let n = 0;
  timers.push(setInterval(() => {
    const now = ctx.currentTime;
    if (!running()) return;
    if (next < now && t0 === null) next = now + 0.1;
    for (; next < now; n++) next += beat; // (with the loops: skip the missed beats, keep in step)
    while (next < now + 0.2) {
      playBeat(next, n);
      next += beat;
      n++;
    }
  }, 25));
  const kick = (t, k = 1) => tone(M, t, { f: 115, f1: 42, dur: 0.24, gain: 0.17 * k, a: 0.003 });
  // (the rim sits a hair behind the beat, and the hats wander a little round it)
  const rim = (t, k = 1) => {
    hiss(MH, t + 0.018, { f: 1900, q: 0.8, dur: 0.14, a: 0.002, gain: 0.09 * k, verb: 0.15 });
    tone(M, t + 0.018, { f: 210, f1: 160, dur: 0.05, gain: 0.05 * k, a: 0.002 });
  };
  const hat = (t, k = 1) => hiss(MH, Math.max(ctx.currentTime, t + rand(-0.008, 0.008)), { type: 'highpass', f: 7000, dur: 0.03, a: 0.001, gain: 0.035 * k });
  function playBeat(t, i) {
    const bar = LANTERN[Math.floor(i / 4) % LANTERN.length];
    const b = i % 4;
    const off = t + swing * beat;
    if (b === 0) {
      pads.forEach((o, j) => o.frequency.setTargetAtTime(bar.keys[j >> 1], t, 0.12));
      sway.gain.setTargetAtTime(1.15, t, beat * 0.5);
      sway.gain.setTargetAtTime(0.85, t + beat * 2, beat * 0.5);
    }
    // the lead: a tune now and then, starting on a chord's first bar
    const nbar = Math.floor(i / 4);
    if (b === 0 && nbar % 2 === 0 && t >= tuneUntil && Math.random() < 0.45 && plays('bed', 'lead')) {
      for (const [at, m, len] of LANTERN_TUNES[Math.floor(Math.random() * LANTERN_TUNES.length)]) {
        lead(t + (Math.floor(at) + (at % 1 ? swing : 0)) * beat, m, len * beat);
      }
      tuneUntil = t + beat * 12; // (its two bars, and two more of rest)
    }
    // keys: the chord on one, strummed a hair; now and then a soft push late in the bar
    // (in 0.3 of bars calm, and more as it gets tense)
    if (b === 0 && plays('bed', 'keys')) bar.keys.forEach((f, j) => epiano(M, t + j * 0.022, f, { dur: beat * 3.4, gain: 0.026, verb: 0.3 }));
    const r = b === 2 ? Math.random() : 1;
    if (r < 0.3 + tension * 0.3 && plays(r < 0.3 ? 'bed' : 'tense', 'keys')) bar.keys.forEach((f, j) => epiano(M, off + j * 0.012, f, { dur: beat * 1.2, gain: 0.015, verb: 0.3 }));
    // bass: the root on one, again on the and of three
    if (plays('bed', 'bass')) {
      if (b === 0) tone(M, t, { type: 'triangle', f: bar.bass, dur: beat * 1.5, gain: 0.11, a: 0.01, lp: 320 });
      if (b === 2) tone(M, off, { type: 'triangle', f: bar.bass, dur: beat * 0.9, gain: 0.085, a: 0.01, lp: 320 });
    }
    // drums: kick on one and the and of two, rim on two and four
    const kicks = plays('bed', 'kick');
    if (b === 0 && kicks) kick(t);
    if (b === 1 && kicks) kick(off, 0.7);
    if (b === 2 && Math.random() < 0.25 && kicks) kick(t + beat * 0.75, 0.5);
    if (b % 2 && plays('bed', 'rim')) rim(t);
    // hats: swung eighths, sixteenths as it gets tense
    if (plays('bed', 'hat')) {
      hat(t, b % 2 ? 0.8 : 1);
      hat(off, 0.6);
    }
    if (tension > 0.4 && plays('tense', 'hat')) {
      hat(t + beat * 0.31, 0.4);
      hat(t + beat * 0.81, 0.4);
    }
    // a few high notes over the chords when it matters
    if (tension > 0.5 && b === 3 && Math.random() < 0.7) {
      const f = LANTERN_TOP[Math.floor(Math.random() * LANTERN_TOP.length)];
      if (plays('tense', 'top')) epiano(M, off, f, { dur: beat * 1.5, gain: 0.016, verb: 0.45 });
    }
  }
  return {
    setTension(x) {
      tension = x;
      padF.frequency.setTargetAtTime(650 + x * 600, ctx.currentTime, 2); // (the pad opens)
    },
    stop() {
      timers.forEach((id) => (clearTimeout(id), clearInterval(id)));
      wobble.forEach((o) => o.stop());
      oscs.forEach((o) => o.stop());
      mus.stop();
    },
  };
}

// ---- the tracks from files ------------------------------------------------------------
// Each track's notes, played on Surge XT and rendered into a pair of seamless loops
// (scripts/sound/bgm.py): the bed, and a layer that comes in with tension, the same length
// so they stay together. They hold the voices sounds/bgm/choice.js gives the loops; the
// synth version above plays the rest alongside, in step. Both go through the same music
// bus (the radio included). If the files can't be had, the synth plays every voice.
// gain: the loops' level going into the bus and tensed the tension layer's at full
// tension; each voice in them is as loud as the synth's own (measured: compare.py levels);
// after: the track's level after the bus and radio the radio's makeup, as the synth's;
// tense(x): how far in the tension layer is at tension x.
const LOOPS = {
  lantern: { gain: 0.333, tensed: 1, after: LANTERN_LEVEL, radio: LANTERN_RADIO, tense: (x) => Math.min(1, Math.max(0, (x - 0.3) / 0.3)) },
};
const loopFiles = new WeakMap(); // ctx -> name -> Promise<[bed, tense]>
// the layers a track takes from the loops: those with a voice marked 'loop'
const loopLayers = (name) => ['bed', 'tense'].filter((layer) => Object.values(BGM_CHOICE[name]?.[layer] ?? {}).includes('loop'));
function loadLoops(ctx, name) {
  if (!loopFiles.has(ctx)) loopFiles.set(ctx, new Map());
  const byName = loopFiles.get(ctx);
  if (!byName.has(name)) {
    const get = (file) => fetch(new URL(`sounds/bgm/${file}.ogg`, import.meta.url))
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${file}.ogg: ${r.status}`))))
      .then((b) => ctx.decodeAudioData(b));
    const layers = loopLayers(name);
    byName.set(name, Promise.all(['bed', 'tense'].map((layer) => (layers.includes(layer) ? get(layer === 'bed' ? name : `${name}-tense`) : null))));
  }
  return byName.get(name);
}
function fromLoops(name, synth) {
  const L = LOOPS[name];
  // the voices the synth plays alongside the loops (any not named in choice.js: the loops)
  const synthPlays = (layer, voice) => BGM_CHOICE[name]?.[layer]?.[voice] === 'synth';
  const anySynth = () => ['bed', 'tense'].some((layer) => Object.values(BGM_CHOICE[name]?.[layer] ?? {}).includes('synth'));
  const loops = (E, to, [bed, tense]) => {
    const { ctx } = E;
    const after = ctx.createGain();
    after.gain.value = L.after;
    after.connect(to);
    const mus = musicBus(E, after, L.radio);
    const at = ctx.currentTime + 0.05;
    const play = (buffer, gain) => {
      if (!buffer) return null;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(g).connect(mus.in);
      src.start(at);
      return { src, g };
    };
    const a = play(bed, L.gain);
    const b = play(tense, 0);
    const own = anySynth() ? synth(E, to, synthPlays, at) : null;
    return {
      setTension(x) {
        b?.g.gain.setTargetAtTime(L.tense(x) * L.tensed * L.gain, ctx.currentTime, 1.5);
        own?.setTension(x);
      },
      stop() {
        a?.src.stop();
        b?.src.stop();
        mus.stop();
        own?.stop();
      },
    };
  };
  // starts silent and comes in once the loops are in (the slot fades it up anyway);
  // ready settles when it plays, from the files or the synth
  return (E, to) => {
    let track = null;
    let stopped = false;
    let tension = 0;
    const ready = (loopLayers(name).length ? loadLoops(E.ctx, name).then((bufs) => loops(E, to, bufs), (err) => {
      console.warn(`[audio] ${name}: playing the synth version (${err.message})`);
      return synth(E, to);
    }) : Promise.resolve().then(() => synth(E, to))).then((t) => {
      if (stopped) return t.stop();
      track = t;
      t.setTension(tension);
    });
    return {
      ready,
      setTension(x) {
        tension = x;
        track?.setTension(x);
      },
      stop() {
        stopped = true;
        track?.stop();
      },
    };
  };
}

// The music tracks, by name (⚙ picks one, or each scene's own). The lounge trio is kept
// for a scene of its own but is off the list for now; a pick of it saved before plays the
// scene's own track (the raft's is Lantern).
export const TRACKS = { wired, lantern: fromLoops('lantern', lantern) };
// the synth versions, for comparing (scripts/sound/)
export const SYNTH_TRACKS = { wired, lantern };
export const SHELVED = { lounge };
// The voices and tracks the launch PV's score plays with (pv/score/): the Wired and Lantern
// arranged to the film, so it sounds like the game.
export const SCORE_KIT = { tone, hiss, epiano, knock, snap, brushCrash, lowpass, wet, mtof, LANTERN, LANTERN_TUNES, WIRED, WIRED_PINGS, WIRED_MODEM };
if (prefs.bgm !== 'off' && !TRACKS[prefs.bgm]) prefs.bgm = 'scene';

// The music under a scene's ambience: the scene's own track, the one picked in ⚙
// (prefs.bgm: 'scene', a TRACKS name, or 'off'), crossfading on a change. Tension goes to
// whichever track plays. Returns { pick(), setTension(x), stop() }.
const MUSIC_FADE = 2.5; // seconds
// a track's level away from its own scene: the Wired is mixed a little low under the
// machine room's hum, and comes up a little elsewhere
const AWAY_LEVEL = { wired: 1.15 };
function musicSlot(E, to, own) {
  const { ctx } = E;
  let cur = null; // { name, gain, track }
  let tension = 0;
  const fadeOut = (old, secs) => {
    old.gain.gain.setTargetAtTime(0, ctx.currentTime, secs / 4);
    setTimeout(() => {
      old.track.stop();
      old.gain.disconnect();
    }, secs * 1000 + 300);
  };
  const slot = {
    pick() {
      const name = prefs.bgm === 'off' ? null : TRACKS[prefs.bgm] ? prefs.bgm : own;
      if (name === (cur?.name ?? null)) return;
      if (cur) fadeOut(cur, MUSIC_FADE);
      cur = null;
      if (!name) return;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.gain.setTargetAtTime(name === own ? 1 : AWAY_LEVEL[name] ?? 1, ctx.currentTime, MUSIC_FADE / 4);
      gain.connect(to);
      const track = TRACKS[name](E, gain);
      track.setTension(tension);
      cur = { name, gain, track };
    },
    setTension(x) {
      tension = x;
      cur?.track.setTension(x);
    },
    stop() {
      E.slots.delete(slot);
      if (cur) fadeOut(cur, 1.2);
      cur = null;
    },
  };
  E.slots.add(slot);
  slot.pick();
  return slot;
}

// The raft: the sea around it, under its music (Lantern, unless ⚙ picks another).
function raft(E) {
  const { ctx } = E;
  const out = ctx.createGain();
  out.gain.value = 0;
  out.gain.setTargetAtTime(CASINO_BED, ctx.currentTime, 1.5);
  out.connect(E.bedBus);
  const timers = [];

  // the sea around the raft, on the ambience level under the music
  const amb = ambGain(E, out);
  const sea = raftSea(E, amb, timers);
  const music = musicSlot(E, out, 'lantern');

  let wasYours = false;
  return {
    react(kind, t = ctx.currentTime) {
      if (kind === 'down') out.gain.setTargetAtTime(CASINO_BED * 0.35, t, 0.8);
      else if (kind === 'up') out.gain.setTargetAtTime(CASINO_BED, t, 0.8);
    },
    mood(v) {
      const playing = v.phase === 'playing';
      let x = 0;
      if (playing && v.game === 'blackjack') {
        // a big pot, a double waiting on a call, a close game in the last hands
        const stacks = v.seats.map((s) => s.stack);
        x = Math.min(0.5, v.pot / 1600000) + (v.facing ? 0.3 : 0) + (v.round >= v.rounds - 2 && Math.abs(stacks[0] - stacks[1]) < 400000 ? 0.3 : 0);
      } else if (playing && v.game === 'yacht') {
        // the last turns of a close game
        const gap = Math.abs(v.seats[0].total - v.seats[1].total);
        x = (v.round >= v.rounds - 3 && gap <= 30 ? 0.4 : 0) + (v.round >= v.rounds - 1 && gap <= 30 ? 0.4 : 0);
      }
      music.setTension(Math.min(1, x));
      const yours = playing && v.turn === v.you;
      if (yours && !wasYours) sfx('turn');
      wasYours = yours;
    },
    stop() {
      timers.forEach((id) => (clearTimeout(id), clearInterval(id)));
      music.stop();
      out.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
      E.ambs.delete(amb);
      sea.stop();
      setTimeout(() => {
        sea.sources.forEach((o) => o.stop());
        out.disconnect();
      }, 2000);
    },
  };
}

// by scene (scenes.js sound) and by game
export const VIBES = { machine: roulette, raft, roulette, blackjack: raft, yacht: raft };

// ---- voices: animalese babble when the agent talks ---------------------------------
// The voice is dididudu, a tool of the user's CUCAI kit (kit/tools/dididudu/), kept here
// as a copy (dididudu.js, brought up to date by scripts/sync-dididudu.mjs): one blip per
// syllable in every game language, the voices (clawd, ds, cuca, boss) and the moods.
// Its pinyin comes from pinyin-pro 3.29.4 (MIT), its ESM build kept in vendor/pinyin-pro/,
// loaded after the first gesture; until it arrives Han characters babble on a vowel and
// tone hashed from their code point.
const PINYIN_URL = new URL('vendor/pinyin-pro/dist/index.mjs', import.meta.url).href;
export const loadPinyin = () => loadPinyinFrom(PINYIN_URL);
export { VOICES, babble, readLine };

// ---- the live page -----------------------------------------------------------------

let live = null; // { ctx, master, E } once the first gesture has unlocked audio
let vibeName = null;

function unlock() {
  if (live) {
    if (live.ctx.state === 'suspended' && !prefs.muted && !live.offline) live.ctx.resume();
    return;
  }
  start(new AudioContext());
}

// The page's sound on a context: the speakers' (unlock), or an offline one a video render
// steps along with its clock (renderSound).
function start(ctx, offline = false) {
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 6;
  limiter.ratio.value = 10;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.2;
  limiter.connect(ctx.destination);
  const master = ctx.createGain();
  master.gain.value = level();
  master.connect(limiter);
  const voice = ctx.createGain();
  voice.gain.value = voiceLevel();
  voice.connect(master);
  // the raft's game sounds a little softer, to sit in its calm
  const soft = ctx.createGain();
  soft.gain.value = 0.7;
  const softLp = ctx.createBiquadFilter();
  softLp.type = 'lowpass';
  softLp.frequency.value = 6000;
  soft.connect(softLp).connect(master);
  live = { ctx, master, voice, soft, offline, E: makeEnv(ctx, master) };
  if (offline) live.E.running = () => true;
  placeNow();
  loadPinyin();
  live.E.hide.value = document.hidden && !offline ? 0 : 1;
  if (prefs.muted && !offline) ctx.suspend();
  if (vibeName) startVibe();
}
/**
 * For rendering a video (web/play/director/): the page's sound goes into ctx, an
 * OfflineAudioContext the renderer moves on in step with the page's clock, at the default
 * levels, or as a script sets them ({ bgm, ambience }: kept to this page, never saved).
 * Resolves once the voice's pinyin is in, so every line babbles the same.
 */
export function renderSound(ctx, { bgm = 'scene', ambience = 1 } = {}) {
  if (live) return Promise.resolve();
  Object.assign(prefs, { volume: 0.6, muted: false, voice: 0.8, voiceMuted: false, ambience, radio: false, bgm: bgm === 'off' || TRACKS[bgm] ? bgm : 'scene' });
  start(ctx, true);
  return loadPinyin();
}
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, unlock, { capture: true });

function startVibe() {
  live.E.bed?.stop();
  live.E.bed = VIBES[vibeName]?.(live.E) ?? null;
}

// The bed is for when you are looking; a hidden tab keeps only the effects (a shot, your turn).
document.addEventListener('visibilitychange', () => {
  if (live) live.E.hide.setTargetAtTime(document.hidden ? 0 : 1, live.ctx.currentTime, 0.5);
});

/**
 * Pick the bed by game or scene name. Takes effect at the first gesture if audio is still
 * locked; another game in the same scene keeps the bed playing.
 */
export function setVibe(name) {
  const same = vibeName && VIBES[name] === VIBES[vibeName];
  vibeName = name;
  if (live && !(same && live.E.bed)) startVibe();
}

let placed = null; // { camera, places } from the scene
/**
 * Tell the sound where the scene's sources are: places is a scene's sound map in world
 * space ({ water: [Vector3, ...], radio, float }), heard from camera. Each becomes a pan
 * and a distance in E.places, and the bed and the radio follow.
 */
export function placeSound(camera, places) {
  placed = camera && places ? { camera, places } : null;
  // after a frame or two, once the camera sits in its seat
  requestAnimationFrame(() => requestAnimationFrame(placeNow));
}
function placeNow() {
  if (!live) return;
  const out = {};
  if (placed) {
    const { camera, places } = placed;
    camera.updateMatrixWorld();
    const hear = (v) => {
      const p = v.clone().applyMatrix4(camera.matrixWorldInverse);
      const flat = Math.hypot(p.x, p.z) || 1;
      return { pan: Math.max(-0.9, Math.min(0.9, (p.x / flat) * 1.1)), dist: p.length() };
    };
    for (const [k, v] of Object.entries(places)) if (v) out[k] = Array.isArray(v) ? v.map(hear) : hear(v);
  }
  live.E.places = out;
  for (const fn of live.E.placers) fn(out);
}
/** Where the sound hears the scene's sources, as pans and distances (for checking). */
export const soundPlaces = () => live?.E.places ?? null;

/** Play a sound by name now; opts go to the sound (count, gap, slot, item, who, amount, pot, points, dur). */
export function sfx(name, opts) {
  if (!live || prefs.muted || !live.E.running()) return;
  // a line the agent says out loud needs no chime too
  if (name === 'chat' && performance.now() - spokeAt < 300) return;
  const own = VIBE_SFX[vibeName]?.[name];
  // on the raft, the game's own sounds (cards, chips, dice) are a little softer
  const E = VIBES[vibeName] === raft && (own || name in CASINO_SFX) ? { ...live.E, out: live.soft } : live.E;
  (own ?? SFX[name])?.(E, live.ctx.currentTime + 0.01, opts);
}

/** For the sound board: measure what the live page is playing, over secs seconds. */
export async function meterLive(secs = 10) {
  if (!live) return null;
  // each channel apart, so where things sit shows too
  const split = live.ctx.createChannelSplitter(2);
  live.master.connect(split);
  const ans = [0, 1].map((i) => {
    const an = live.ctx.createAnalyser();
    an.fftSize = 2048;
    split.connect(an, i);
    return an;
  });
  const buf = new Float32Array(2048);
  let peak = 0, n = 0;
  const sums = [0, 0];
  const end = performance.now() + secs * 1000;
  while (performance.now() < end) {
    ans.forEach((an, i) => {
      an.getFloatTimeDomainData(buf);
      for (const x of buf) {
        peak = Math.max(peak, Math.abs(x));
        sums[i] += x * x;
      }
    });
    n += buf.length;
    await new Promise((r) => setTimeout(r, 40));
  }
  live.master.disconnect(split);
  const db = (x) => (20 * Math.log10(x || 1e-9)).toFixed(1);
  return { peak: db(peak), rms: db(Math.sqrt((sums[0] + sums[1]) / 2 / n)), left: db(Math.sqrt(sums[0] / n)), right: db(Math.sqrt(sums[1] / n)) };
}

let speech = null; // the line being said: { out, timers, token }
let spokeAt = -1e9;
let speechToken = 0;
const EMOJI_ONLY = /^[p{Extended_Pictographic}‍️s]*$/u;

/**
 * Say a line in the agent's voice: animalese babble, under the effects. A new line cuts
 * the old one off. voice is a VOICES name or an object of its fields (an avatar's own);
 * mood the line's (MOODS: how it says it);
 * onBlip({ i, at, dur, loud, last }) fires at each blip's onset (ms for at and dur), for
 * the mouth. Resolves to { ms, blips }, or null when nothing is said (muted, emoji only).
 */
export async function speak(text, { voice = 'clawd', mood, onBlip } = {}) {
  hush();
  if (!live || prefs.muted || prefs.voiceMuted || !text || EMOJI_ONLY.test(text)) return null;
  spokeAt = performance.now();
  const token = ++speechToken;
  if (!hasPinyin()) await Promise.race([loadPinyin(), new Promise((r) => setTimeout(r, 1200))]);
  if (token !== speechToken || !live.E.running()) return null;
  const v = typeof voice === 'string' ? VOICES[voice] ?? VOICES.clawd : { ...VOICES.clawd, ...voice };
  const { ctx } = live;
  const out = ctx.createGain();
  out.connect(live.voice);
  const t = ctx.currentTime + 0.02;
  const { blips, secs } = babble({ ...live.E, out }, t, text, v, { mood, maxSecs: 6 });
  const ms = (x) => Math.round(x * 1000);
  const timers = blips.map((b, i) => setTimeout(() => onBlip?.({ i, at: ms(b.at), dur: ms(b.dur), loud: b.loud, last: !!b.last }), ms(t - ctx.currentTime + b.at)));
  timers.push(setTimeout(() => speech?.token === token && (speech = null), ms(secs) + 100));
  speech = { out, timers, token };
  return { ms: ms(secs), blips: blips.map((b) => ({ at: ms(b.at), dur: ms(b.dur), loud: b.loud })) };
}
/** Stop the line being said, quickly and without a click. */
export function hush() {
  speechToken++;
  if (!speech) return;
  const { out, timers } = speech;
  timers.forEach(clearTimeout);
  out.gain.setTargetAtTime(0, live.ctx.currentTime, 0.012);
  setTimeout(() => out.disconnect(), 200);
  speech = null;
}

/** Hand the bed the latest view so it can follow the game. */
export function setMood(view) {
  if (live && view) live.E.bed?.mood?.(view);
}

export function setVolume(v) {
  prefs.volume = Math.min(1, Math.max(0, v));
  prefs.muted = false;
  apply();
}
/** The whole mix at k of its level, easing there over secs (a director's bullet time). */
export function duckAll(k = 1, secs = 0.3) {
  if (!live) return;
  live.master.gain.setTargetAtTime(level() * k, live.ctx.currentTime, Math.max(0.01, secs / 3));
}
export function setAmbience(v) {
  prefs.ambience = Math.min(1, Math.max(0, v));
  apply();
}
/** The music: 'scene' (each scene's own), a TRACKS name, or 'off'. Crossfades live. */
export function setBgm(name) {
  prefs.bgm = name === 'off' || TRACKS[name] ? name : 'scene';
  apply();
}
export function setRadio(on) {
  prefs.radio = !!on;
  apply();
}
export function setVoiceVolume(v) {
  prefs.voice = Math.min(1, Math.max(0, v));
  prefs.voiceMuted = false;
  apply();
}
export function setVoiceMuted(m) {
  prefs.voiceMuted = m;
  if (m) hush();
  apply();
}
export function setMuted(m) {
  prefs.muted = m;
  apply();
}
function apply() {
  savePrefs();
  syncPanel();
  document.documentElement.dataset.muted = prefs.muted ? '1' : ''; // the ⚙ button shows it
  if (!live) return;
  live.master.gain.setTargetAtTime(level(), live.ctx.currentTime, 0.05);
  live.voice.gain.setTargetAtTime(voiceLevel(), live.ctx.currentTime, 0.05);
  for (const g of live.E.ambs) g.gain.setTargetAtTime(ambienceLevel(), live.ctx.currentTime, 0.05);
  for (const m of live.E.musics) routeMusic(m, live.ctx);
  for (const slot of live.E.slots) slot.pick();
  // a muted page stops the clock entirely: no CPU, no sounds piling up for later
  if (prefs.muted) setTimeout(() => prefs.muted && live.ctx.suspend(), 200);
  else live.ctx.resume();
}

// ---- the ⚙ window: sound on/off and volume (Art & UI owns how it looks) -------------

let panel = null;
// an on/off button: its word, and lit while on
function flip(sel, on) {
  const b = panel.querySelector(sel);
  b.textContent = on ? t('ui.settings.on') : t('ui.settings.off');
  b.classList.toggle('on', on);
}
function syncPanel() {
  if (!panel) return;
  flip('[data-mute]', !prefs.muted);
  panel.querySelector('[data-vol]').value = Math.round(prefs.volume * 100);
  panel.querySelector('[data-vol-n]').textContent = Math.round(prefs.volume * 100);
  panel.querySelector('[data-amb]').value = Math.round(prefs.ambience * 100);
  panel.querySelector('[data-amb-n]').textContent = Math.round(prefs.ambience * 100);
  for (const b of panel.querySelectorAll('[data-bgm] button')) {
    const on = b.dataset.track === prefs.bgm;
    b.classList.toggle('on', on);
    b.toggleAttribute('aria-current', on);
  }
  flip('[data-radio]', prefs.radio);
  flip('[data-voice-mute]', !prefs.voiceMuted);
  panel.querySelector('[data-voice]').value = Math.round(prefs.voice * 100);
  panel.querySelector('[data-voice-n]').textContent = Math.round(prefs.voice * 100);
}
// The settings window's body, made if it isn't yet: the HUD adds its own rows to it, in
// its groups (data-group: game, sound, voice, view). A row is a label (.k) and what it
// sets (.v); a group opens with a head row, which may hold the group's own on/off.
export function settingsBody() {
  if (!panel) openSettings(false);
  return panel.querySelector('.settings-body');
}
export function openSettings(show) {
  if (!panel) {
    panel = document.createElement('section');
    panel.className = 'window settings';
    panel.id = 'settings';
    panel.hidden = true;
    const slider = (key) => `<span class="v slide"><input type="range" min="0" max="100" step="5" data-${key}><span class="n" data-${key}-n></span></span>`;
    panel.innerHTML = `<div class="window-title">${t('ui.settings.title')}<button class="x">×</button></div>
      <div class="settings-body">
        <div class="group" data-group="game">
          <div class="row head"><span class="k">${t('ui.settings.groupGame')}</span></div>
        </div>
        <div class="group" data-group="sound">
          <div class="row head"><span class="k">${t('ui.settings.sound')}</span><span class="v"><button class="pixbtn toggle" data-mute></button></span></div>
          <div class="row"><span class="k">${t('ui.settings.volume')}</span>${slider('vol')}</div>
          <div class="row"><span class="k">${t('ui.settings.ambience')}</span>${slider('amb')}</div>
          <div class="row wide"><span class="k">${t('ui.settings.bgm')}</span><span class="v"><span class="tracks" data-bgm></span></span></div>
          <div class="row"><span class="k">${t('ui.settings.radio')}</span><span class="v"><button class="pixbtn toggle" data-radio></button></span></div>
        </div>
        <div class="group" data-group="voice">
          <div class="row head"><span class="k">${t('ui.settings.voice')}</span><span class="v"><button class="pixbtn toggle" data-voice-mute></button></span></div>
          <div class="row"><span class="k">${t('ui.settings.volume')}</span>${slider('voice')}</div>
        </div>
        <div class="group" data-group="view">
          <div class="row head"><span class="k">${t('ui.settings.groupView')}</span></div>
        </div>
      </div>
      <div class="settings-foot">${t('ui.settings.hint')}</div>`;
    (document.querySelector('.hud') ?? document.body).append(panel);
    panel.querySelector('.x').onclick = () => openSettings(false);
    panel.querySelector('[data-mute]').onclick = () => setMuted(!prefs.muted);
    const vol = panel.querySelector('[data-vol]');
    vol.oninput = () => setVolume(vol.value / 100);
    vol.onchange = () => sfx('tick');
    const ab = panel.querySelector('[data-amb]');
    ab.oninput = () => setAmbience(ab.value / 100);
    for (const name of ['scene', ...Object.keys(TRACKS), 'off']) {
      const b = document.createElement('button');
      b.className = 'pixbtn';
      b.dataset.track = name;
      b.textContent = t(`ui.settings.tracks.${name}`);
      b.onclick = () => setBgm(name);
      panel.querySelector('[data-bgm]').append(b);
    }
    panel.querySelector('[data-radio]').onclick = () => setRadio(!prefs.radio);
    panel.querySelector('[data-voice-mute]').onclick = () => setVoiceMuted(!prefs.voiceMuted);
    const vv = panel.querySelector('[data-voice]');
    vv.oninput = () => setVoiceVolume(vv.value / 100);
    vv.onchange = () => speak(t('ui.settings.voiceSample'));
    syncPanel();
  }
  panel.hidden = show === undefined ? !panel.hidden : !show;
}

const typing = () => document.activeElement?.matches('input:not([type=range]), textarea');
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && panel) panel.hidden = true;
  else if ((e.key === 'm' || e.key === 'M') && !typing() && !e.ctrlKey && !e.metaKey && !e.altKey) setMuted(!prefs.muted);
});

// ---- HUD sounds, from the DOM alone --------------------------------------------------

const UI = 'button, .gamelist li:not(.soon)';
let hovered = null;
document.addEventListener('pointerover', (e) => {
  const el = e.target.closest?.(UI);
  if (el && el !== hovered) sfx('hover');
  hovered = el;
});
document.addEventListener('click', (e) => {
  const el = e.target.closest?.(UI);
  if (el) return sfx(el.classList.contains('emote') ? 'throw' : 'click');
  // a thing on the table you can use (the HUD marks the canvas while you point at one)
  if (e.target.id === 'view' && e.target.classList.contains('pointing')) sfx('click');
}, { capture: true });
document.addEventListener('submit', (e) => {
  if (e.target.id === 'say-form' && e.target.querySelector('input')?.value.trim()) sfx('send');
}, { capture: true });
// pointing at a new thing on the table: the HUD's tip appears or changes text
const tip = document.querySelector('#tip');
if (tip) {
  let last = '';
  new MutationObserver(() => {
    const text = tip.hidden ? '' : tip.textContent;
    if (text && text !== last) sfx('point');
    last = text;
  }).observe(tip, { attributes: true, attributeFilter: ['hidden'], childList: true, characterData: true, subtree: true });
}
