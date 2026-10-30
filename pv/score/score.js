// The launch PV's score, made to the cut (map.js), in the game's own synth voices
// (web/play/audio.js SCORE_KIT): the Wired and Lantern, the machine room's and the raft's
// tracks, arranged to the picture, and the film's sound effects. Two stems, mixed with the
// parts' own sound (the rooms, the games, the voices) in pv/cut/join.py.
//   The desk at noon is dry: the hook (a pop, a sigh going flat), the keys, Clawd's hops.
// The Wired swells in backwards as Clawd goes into the screen and its first downbeat lands as
// it is in; a sparse first bar, then the groove; the heat brings its heartbeat, it holds its
// breath for a beat and the live round lands on the downbeat; a bar with no drums for ???
// and 😭; the drums back, and the tests passing ring up the chord. Shrinking into the dusk
// desk's window it goes small and boxy, and stops dead when the window closes. The desk at
// dusk is dry again. Lantern swells in backwards on Clawd's dive, heard from inside the
// screen, and opens as the camera pulls out to the raft; drums from its second bar; its
// tune and a crash when the horizon lights; a bar without drums for the laptop and the
// deploy; night, busier, up to a riser on Eb9 as Clawd throws all five, and everything
// stops with the dice in the air but the chord, hanging; Abmaj9 drops as they land, the
// tune up high, a bell on the word, and the last chord rings into the end card.
// render.html seeds Math.random first, so every render is the same.
import { makeEnv, SCORE_KIT } from '../../web/play/audio.js';
import { RATE, LENGTH, NOON_AT, MACHINE_AT, DUSK_AT, RAFT_AT, WIRED_BAR, WIRED_ONE, LANTERN_BAR, LANTERN_ONE } from './map.js';

const { tone, hiss, epiano, brushCrash, lowpass, wet, mtof, LANTERN, LANTERN_TUNES, WIRED, WIRED_PINGS, WIRED_MODEM } = SCORE_KIT;
const [DB, CM, FM, AB] = LANTERN; // Dbmaj9, Cm7, Fm9, Abmaj9
const EB9 = { bass: mtof(39), keys: [55, 58, 61, 65].map(mtof) }; // the way home
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];

export const STEMS = ['music', 'sfx'];

/** Renders the score: channels 0-1 the music, 2-3 the sound effects. */
export async function renderScore() {
  const ctx = new OfflineAudioContext({ numberOfChannels: 4, length: Math.ceil(LENGTH * RATE), sampleRate: RATE });
  Object.assign(ctx.destination, { channelCount: 4, channelCountMode: 'explicit', channelInterpretation: 'discrete' });
  const merger = ctx.createChannelMerger(4);
  merger.connect(ctx.destination);
  const stem = (ch) => {
    const g = Object.assign(ctx.createGain(), { channelCount: 2, channelCountMode: 'explicit' });
    const split = ctx.createChannelSplitter(2);
    g.connect(split);
    split.connect(merger, 0, ch);
    split.connect(merger, 1, ch + 1);
    return g;
  };
  const music = stem(0);
  const sfx = stem(2);
  // the swells: chords played backwards, rendered first
  const swells = {
    wired: await backwards(WIRED[0].keys, 1.6),
    lantern: await backwards(DB.keys, 1.8),
    land: await backwards(AB.keys.map((f) => f * 2), 1.7),
  };
  wired(ctx, music, swells);
  lantern(ctx, music, swells);
  effects(ctx, sfx);
  return ctx.startRendering();
}

// ---- small parts -----------------------------------------------------------------------

// A chord on the electric piano, rendered alone and turned round: it swells up to where it
// would have been struck.
async function backwards(keys, secs) {
  const off = new OfflineAudioContext({ numberOfChannels: 2, length: Math.ceil(secs * RATE), sampleRate: RATE });
  const E = makeEnv(off, off.destination);
  keys.forEach((f, j) => epiano(E, 0.01 + j * 0.025, f, { dur: secs - 0.15, gain: 0.03, verb: 0.7 }));
  const b = await off.startRendering();
  for (let c = 0; c < 2; c++) b.getChannelData(c).reverse();
  return b;
}
function play(ctx, buffer, end, to, gain = 1) {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(g).connect(to);
  src.start(Math.max(0, end - buffer.duration));
}
function filter(ctx, type, f, q = 0.7) {
  const b = ctx.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  return b;
}
function lfo(ctx, rate, depth, param, from = 0) {
  const o = ctx.createOscillator();
  o.frequency.value = rate;
  const g = ctx.createGain();
  g.gain.value = depth;
  o.connect(g).connect(param);
  o.start(from);
  o.stop(LENGTH);
}
// the tape the bands play on: a little wow and flutter
function tape(ctx, to, wow) {
  const d = ctx.createDelay(0.1);
  d.delayTime.value = 0.02;
  d.connect(to);
  for (const [rate, depth] of wow) lfo(ctx, rate, depth, d.delayTime);
  return d;
}
// a held saw chord, two a note a little apart left and right, through a closed lowpass
// breathing slowly: the Wired's drone and Lantern's pad
function saws(ctx, notes, { level, detune, spread, lp, q = 0.7, breathe, from, until, to }) {
  const sides = [-spread, spread].map((p) => {
    const pan = ctx.createStereoPanner();
    pan.pan.value = p;
    const f = filter(ctx, 'lowpass', lp, q);
    f.connect(pan).connect(to);
    return f;
  });
  const oscs = notes.flatMap((f) => sides.map((side, k) => {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.detune.value = k ? detune : -detune;
    const g = ctx.createGain();
    g.gain.value = level;
    o.connect(g).connect(side);
    o.start(from);
    o.stop(until);
    return o;
  }));
  sides.forEach((side, k) => lfo(ctx, breathe[k], breathe[2], side.frequency, from));
  return {
    oscs,
    sides,
    to(notes, t, tc = 0.2) {
      oscs.forEach((o, j) => o.frequency.setTargetAtTime(notes[j >> 1], t, tc));
    },
  };
}
// the bar's beats, on a swing: t(beat) for a beat in the bar, halves on the swung eighth
const grid = (one, beat, swing) => (x) => one + (Math.floor(x) + (x % 1 ? swing : 0)) * beat;

// ---- the Wired: the machine room ----------------------------------------------------------

function wired(ctx, music, swells) {
  const beat = WIRED_BAR / 4;
  const swing = 0.58;
  const [s0, s1] = MACHINE_AT.shrink;
  const close = DUSK_AT.close[0] + 0.06;
  // the window: going small and boxy as the room shrinks into it, then nothing
  const hp = filter(ctx, 'highpass', 20);
  const lp = filter(ctx, 'lowpass', 20000);
  const win = ctx.createGain();
  hp.connect(lp).connect(win).connect(music);
  lp.frequency.setValueAtTime(20000, s0);
  lp.frequency.exponentialRampToValueAtTime(1700, s1);
  hp.frequency.setValueAtTime(20, s0);
  hp.frequency.exponentialRampToValueAtTime(380, s1);
  win.gain.setValueAtTime(1, s0);
  win.gain.linearRampToValueAtTime(0.6, s1);
  win.gain.setValueAtTime(0.6, close);
  win.gain.linearRampToValueAtTime(0, close + 0.02);
  const E = makeEnv(ctx, hp);
  const T = { ...E, out: lowpass(E, 2800, tape(ctx, hp, [[0.37, 0.0016], [2.9, 0.00012]])) };
  const TH = { ...E, out: lowpass(E, 9000, T.out) };
  const tapeLp = T.out;

  // the echo: left, then right, darker each time round (three quarters of a beat)
  const echo = ctx.createGain();
  const back = ctx.createGain();
  back.gain.value = 0.5;
  back.connect(hp);
  const [dl, dr] = [-0.7, 0.7].map((p) => {
    const d = ctx.createDelay(2);
    d.delayTime.value = beat * 0.75;
    const pan = ctx.createStereoPanner();
    pan.pan.value = p;
    d.connect(pan).connect(back);
    return d;
  });
  echo.connect(dl);
  for (const [a, b] of [[dl, dr], [dr, dl]]) {
    const f = filter(ctx, 'lowpass', 1800);
    const g = ctx.createGain();
    g.gain.value = 0.5;
    a.connect(f).connect(g).connect(b);
  }

  // the drone, coming up under the swell; the heat opens it, it sinks for the held breath
  const one = WIRED_ONE;
  const at = (bar, x = 0) => grid(one + bar * WIRED_BAR, beat, swing)(x);
  const droneG = ctx.createGain();
  droneG.connect(hp);
  droneG.connect(echo);
  droneG.gain.setValueAtTime(0, one - 1.2);
  droneG.gain.linearRampToValueAtTime(0.12, one);
  const drone = saws(ctx, WIRED[0].drone, { level: 0.05, detune: 7, spread: 0.6, lp: 420, q: 2, breathe: [0.043, 0.031, 180], from: one - 1.2, until: close + 0.1, to: droneG });
  const heat = MACHINE_AT.heat;
  drone.sides.forEach((s) => s.frequency.setTargetAtTime(980, heat, 1));
  droneG.gain.setTargetAtTime(0.17, heat, 1);
  const breath = at(3, 3); // the beat before the live round: everything holds
  drone.sides.forEach((s) => s.frequency.setTargetAtTime(300, breath, 0.08));
  droneG.gain.setTargetAtTime(0.07, breath, 0.08);
  drone.sides.forEach((s) => s.frequency.setTargetAtTime(560, MACHINE_AT.bang, 0.3));
  droneG.gain.setTargetAtTime(0.12, MACHINE_AT.bang, 0.3);
  tapeLp.frequency.setTargetAtTime(3800, heat, 1.5);
  tapeLp.frequency.setTargetAtTime(2800, MACHINE_AT.bang, 1);
  play(ctx, swells.wired, one, T.out, 1.3);

  const kick = (t, k = 1) => tone(T, t, { f: 105, f1: 40, dur: 0.26, gain: 0.17 * k, a: 0.003 });
  const rim = (t, k = 1) => {
    hiss(TH, t, { f: 2100, q: 0.9, dur: 0.12, a: 0.002, gain: 0.12 * k, verb: 0.3 });
    hiss(T, t, { f: 800, q: 0.7, dur: 0.07, a: 0.002, gain: 0.05 * k });
    tone(T, t, { f: 190, f1: 150, dur: 0.05, gain: 0.06 * k, a: 0.002 });
  };
  const hat = (t, k = 1) => hiss(TH, t, { type: 'highpass', f: 7000, dur: 0.03, a: 0.001, gain: 0.05 * k });
  // bars 0..6: 0 sparse, 1-2 the groove, 3 the heat and the held breath, 4 the live round
  // and nothing after it, 5 back, 6 (in the window) its downbeat
  for (let bar = 0; bar <= 6; bar++) {
    const c = WIRED[Math.floor(bar / 2) % WIRED.length];
    if (bar % 2 === 0) drone.to(c.drone, at(bar), 0.25);
    for (let b = 0; b < 4; b++) {
      const t = at(bar, b), off = at(bar, b + 0.5);
      if (t >= close) break;
      const held = bar === 3 && b === 3;
      const quiet = bar === 4 && b > 0;
      if (held) continue;
      if (b === 0) c.keys.forEach((f, j) => epiano(T, t + j * 0.02, f, { dur: beat * 3.6, gain: 0.027, verb: 0.35 }));
      if (b === 2 && bar % 2 && !quiet) c.keys.slice(1).forEach((f, j) => epiano(T, off + j * 0.015, f, { dur: beat * 1.2, gain: 0.016, verb: 0.35 }));
      if (b === 0) tone(T, t, { type: 'triangle', f: c.drone[0], dur: beat * (quiet ? 3 : 1.4), gain: 0.11, a: 0.01, lp: 320 });
      if (b === 2 && !quiet) tone(T, off, { type: 'triangle', f: c.drone[0], dur: beat * 0.8, gain: 0.08, a: 0.01, lp: 320 });
      if (quiet) continue;
      if (b === 0) kick(t);
      if (bar === 0) continue;
      if (b === 1) kick(off, 0.65);
      if (b === 2 && bar % 2) kick(off, 0.5);
      if (b % 2) rim(t);
      hat(t, b % 2 ? 0.75 : 1);
      hat(off, 0.55);
      // the heat: the heartbeat on every beat, ghost hats, the pulse in eighths
      if (bar === 3) {
        tone(E, t, { f: 62, f1: 42, dur: 0.12, gain: 0.21 });
        tone(E, t + 0.18, { f: 58, f1: 40, dur: 0.12, gain: 0.14 });
        hat(at(bar, b + 0.29), 0.25);
        hat(at(bar, b + 0.79), 0.25);
        tone(T, t, { type: 'sawtooth', f: c.drone[0] * 2, dur: 0.1, gain: 0.05, a: 0.005, lp: 650 });
        tone(T, off, { type: 'sawtooth', f: c.drone[0] * 2, dur: 0.08, gain: 0.035, a: 0.005, lp: 650 });
      }
    }
  }
  // the live round: a crash on the downbeat
  brushCrash(TH, MACHINE_AT.bang, 0.07);

  // pings from the Wired on the chord's notes, a modem now and then
  const pings = ctx.createGain();
  pings.connect(hp);
  pings.connect(echo);
  const chordAt = (t) => Math.floor(Math.max(0, t - one) / (2 * WIRED_BAR)) % WIRED.length;
  const panned = (p) => {
    const n = ctx.createStereoPanner();
    n.pan.value = p;
    n.connect(pings);
    return n;
  };
  const ping = (t, k = 1, p = rand(-0.6, 0.6)) => {
    const f = pick(WIRED_PINGS[chordAt(t)]);
    const type = pick(['sine', 'triangle']);
    for (let i = 0; i < k; i++) tone(E, t + i * 0.2, { type, f, dur: i ? 0.5 : 1.2, gain: 0.02 * 0.6 ** i, a: 0.01, to: panned(p) });
  };
  const modem = (t, len) => {
    const [a, b] = pick(WIRED_MODEM);
    const o = ctx.createOscillator();
    o.type = 'square';
    for (let s = 0; s < len; s += 0.012) o.frequency.setValueAtTime(Math.random() < 0.5 ? a : b, t + s);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.004, t + 0.015);
    g.gain.setValueAtTime(0.004, t + len - 0.03);
    g.gain.linearRampToValueAtTime(0, t + len);
    const bp = filter(ctx, 'bandpass', 1700, 0.8);
    o.connect(g).connect(bp).connect(panned(rand(-0.6, 0.6)));
    o.start(t);
    o.stop(t + len + 0.05);
  };
  ping(at(1, 1.5), 1);
  ping(at(1, 3.5), 2);
  modem(at(2, 1), 0.45);
  ping(at(2, 2.5), 1);
  ping(MACHINE_AT.bang + 1.3, 1, -0.3); // the lone one after the round: ???
  // the tests pass: the green wave rings up the chord's notes, over a crash
  const pass = MACHINE_AT.pass;
  const notes = WIRED_PINGS[chordAt(pass)];
  [...notes, notes[2] * 2, notes[4] * 2].forEach((f, i) => tone(E, pass + i * 0.075, { type: 'triangle', f: f / 2, dur: 0.9, gain: 0.02, a: 0.005, to: panned(-0.6 + i * 0.17) }));
  brushCrash(TH, pass, 0.05);
}

// ---- Lantern: the raft, dusk into night ------------------------------------------------------

// One rig of Lantern's band: the tape, the swell once a bar, the pad. from..until its sound
// lives; gate() cuts it dead.
function lanternRig(ctx, to, from, until) {
  const gate = ctx.createGain();
  gate.connect(to);
  const sway = ctx.createGain();
  sway.connect(gate);
  const E = makeEnv(ctx, gate);
  const tp = tape(ctx, sway, [[0.45, 0.0014], [3.3, 0.00012]]);
  const M = { ...E, out: lowpass(E, 2600, tp) };
  const MH = { ...E, out: lowpass(E, 9000, tp) };
  const padG = ctx.createGain();
  padG.gain.value = 0;
  padG.connect(tp);
  const pad = saws(ctx, DB.keys, { level: 0.5, detune: 8, spread: 0.5, lp: 650, breathe: [0.05, 0.05, 150], from, until, to: padG });
  return { E, M, MH, gate, sway, padG, pad };
}

function lantern(ctx, music, swells) {
  const B = LANTERN_BAR;
  const beat = B / 4;
  const swing = 0.66;
  // heard from inside the dusk screen as Clawd dives, open once the camera is out on the raft
  const screen = filter(ctx, 'lowpass', 1300);
  screen.connect(music);
  screen.frequency.setValueAtTime(1300, RAFT_AT.lit - 4 * B + 1.1);
  screen.frequency.exponentialRampToValueAtTime(20000, LANTERN_ONE + B * 1.15);
  const freeze = RAFT_AT.freeze, land = RAFT_AT.land;
  const pre = lanternRig(ctx, screen, LANTERN_ONE - 0.5, freeze + 0.1);
  const post = lanternRig(ctx, music, land - 0.05, LENGTH);
  pre.gate.gain.setValueAtTime(1, freeze - 0.01);
  pre.gate.gain.linearRampToValueAtTime(0, freeze + 0.015);
  pre.padG.gain.setValueAtTime(0, LANTERN_ONE - 0.5);
  pre.padG.gain.linearRampToValueAtTime(0.015, LANTERN_ONE + 0.3);
  post.padG.gain.setValueAtTime(0.018, land);
  play(ctx, swells.lantern, LANTERN_ONE, pre.M.out, 1.2);

  // the bars before the freeze, and from the landing on: chord, and what plays
  const BARS = [
    { chord: DB, drums: false },
    { chord: CM },
    { chord: FM },
    { chord: AB, stopLast: true }, // a beat of air before the horizon lights
    { chord: DB, crash: true, tune: LANTERN_TUNES[0] }, // lit
    { chord: CM },
    { chord: FM, drums: false }, // the laptop to you, the deploy
    { chord: AB, tense: true, tune: LANTERN_TUNES[2] }, // night
    { chord: DB, tense: true },
    { chord: EB9, tense: true, riser: true }, // all five again
  ].map((o, i) => ({ drums: true, ...o, rig: pre, t0: LANTERN_ONE + i * B }));
  const AFTER = [
    { chord: AB, crash: true, tune: [[0, 75, 1], [1, 77, 0.5], [1.5, 80, 1], [2.5, 82, 0.5], [3, 84, 1]] },
    { chord: DB, tune: [[0, 82, 1.2], [1.2, 80, 0.5]] },
    { chord: AB, drums: false, last: true, tune: [[0, 80, 4]] },
  ].map((o, i) => ({ drums: true, ...o, rig: post, t0: land + i * B }));

  const lead = (E, t, m, len) => {
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
    o.connect(g).connect(E.out);
    wet(E, g, 0.45);
    for (const x of [o, vib]) {
      x.start(t);
      x.stop(t + len + 0.8);
    }
  };

  for (const bar of [...BARS, ...AFTER]) {
    const { rig, chord, t0 } = bar;
    const { M, MH, E } = rig;
    const at = grid(t0, beat, swing);
    rig.pad.to(chord.keys, t0, 0.12);
    rig.sway.gain.setTargetAtTime(1.15, t0, beat * 0.5);
    rig.sway.gain.setTargetAtTime(0.85, t0 + beat * 2, beat * 0.5);
    if (bar.tense) rig.pad.sides.forEach((s) => s.frequency.setTargetAtTime(1100, t0, 2));
    const kick = (t, k = 1) => tone(M, t, { f: 115, f1: 42, dur: 0.24, gain: 0.17 * k, a: 0.003 });
    const rim = (t, k = 1) => {
      hiss(MH, t + 0.018, { f: 1900, q: 0.8, dur: 0.14, a: 0.002, gain: 0.09 * k, verb: 0.15 });
      tone(M, t + 0.018, { f: 210, f1: 160, dur: 0.05, gain: 0.05 * k, a: 0.002 });
    };
    const hat = (t, k = 1) => hiss(MH, t + rand(-0.008, 0.008), { type: 'highpass', f: 7000, dur: 0.03, a: 0.001, gain: 0.035 * k });
    // keys: the chord on one, strummed a hair (the last: let ring); a soft push late in the bar
    chord.keys.forEach((f, j) => epiano(M, t0 + j * 0.022, f, { dur: bar.last ? B * 1.3 : beat * 3.4, gain: 0.026, verb: bar.last ? 0.5 : 0.3 }));
    if (!bar.riser && !bar.last && (bar.tense || Math.random() < 0.4)) chord.keys.forEach((f, j) => epiano(M, at(2.5) + j * 0.012, f, { dur: beat * 1.2, gain: 0.015, verb: 0.3 }));
    // bass: the root on one, again on the and of three; the riser walks up in eighths
    tone(M, t0, { type: 'triangle', f: chord.bass, dur: beat * (bar.last ? 4 : 1.5), gain: 0.11, a: 0.01, lp: 320 });
    if (bar.riser) [0, 2, 4, 5, 7, 9, 11, 12].forEach((s, i) => i && tone(M, at(i / 2), { type: 'triangle', f: chord.bass * 2 ** (s / 12), dur: beat * 0.45, gain: 0.09, a: 0.01, lp: 380 }));
    else if (!bar.last) tone(M, at(2.5), { type: 'triangle', f: chord.bass, dur: beat * 0.9, gain: 0.085, a: 0.01, lp: 320 });
    if (bar.crash) brushCrash(MH, t0, 0.07);
    if (bar.tune) for (const [x, m, len] of bar.tune) lead(M, at(x), m, len * beat);
    if (bar.drums) {
      for (let b = 0; b < 4; b++) {
        if (bar.stopLast && b === 3) break;
        const t = at(b), off = at(b + 0.5);
        if (b === 0) kick(t);
        if (b === 1) kick(off, 0.7);
        if (b % 2) rim(t);
        hat(t, b % 2 ? 0.8 : 1);
        hat(off, 0.6);
        if (bar.tense) {
          hat(t + beat * 0.31, 0.4);
          hat(t + beat * 0.81, 0.4);
        }
      }
      // night: a few high notes over the chords
      if (bar.tense && !bar.riser) epiano(M, at(3.5), pick([75, 77, 80, 82, 84].map(mtof)), { dur: beat * 1.5, gain: 0.016, verb: 0.45 });
    } else if (bar.last) kick(t0);
    // the riser: the rim in eighths, then sixteenths, getting louder; the keys climb the chord
    if (bar.riser) {
      [0, 0.5, 1, 1.25, 1.5, 1.75].forEach((x, s) => rim(t0 + beat * (2 + x), 0.35 + s * 0.1));
      const up = [...chord.keys, ...chord.keys.map((f) => f * 2)];
      up.forEach((f, i) => epiano(M, t0 + beat * 2 + i * beat / 4, f, { dur: beat, gain: 0.014 + i * 0.002, verb: 0.35 }));
    }
  }
  // the stars, done as the dice land: a twinkle up high, in A flat
  for (let i = 0; i < 10; i++) tone(post.E, land + 0.15 + i * 0.11 + rand(0, 0.04), { type: 'sine', f: pick([75, 77, 80, 82, 84, 87, 89].map(mtof)) * 2, dur: 0.6, gain: 0.008, a: 0.004, verb: 0.6 });

  // the freeze: everything stops but the chord, hanging, sagging a little; it gives way to
  // the landing's chord swelling in backwards
  const hang = ctx.createGain();
  hang.connect(music);
  hang.gain.setValueAtTime(0, freeze - 0.005);
  hang.gain.linearRampToValueAtTime(1, freeze + 0.04);
  hang.gain.setTargetAtTime(0.7, freeze + 0.3, 0.6);
  hang.gain.setTargetAtTime(0, land - 0.5, 0.15);
  const hangE = makeEnv(ctx, hang);
  const trem = ctx.createGain();
  trem.connect(hangE.out);
  wet(hangE, trem, 0.6);
  lfo(ctx, 5.5, 0.25, trem.gain, freeze);
  for (const m of [44, 51, 56, 58, 61, 65]) {
    for (const [type, cents, k] of [['triangle', -4, 0.005], ['sine', 5, 0.0065]]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(mtof(m), freeze);
      o.frequency.exponentialRampToValueAtTime(mtof(m - 0.4), land);
      o.detune.value = cents;
      const g = ctx.createGain();
      g.gain.value = k;
      o.connect(g).connect(trem);
      o.start(freeze);
      o.stop(land + 0.3);
    }
  }
  play(ctx, swells.land, land, post.M.out, 1.4);
}

// ---- the sound effects ---------------------------------------------------------------------

function effects(ctx, sfx) {
  const E = makeEnv(ctx, sfx);
  // the room: the air of an office, faint, at the desk (noon, then dusk)
  const air = ctx.createBufferSource();
  air.buffer = E.noise;
  air.loop = true;
  const airLp = filter(ctx, 'lowpass', 500);
  const airG = ctx.createGain();
  air.connect(airLp).connect(airG).connect(sfx);
  air.start(0);
  airG.gain.setValueAtTime(0, 0);
  airG.gain.linearRampToValueAtTime(0.03, 0.4);
  airG.gain.setValueAtTime(0.03, NOON_AT.in);
  airG.gain.linearRampToValueAtTime(0, NOON_AT.in + 0.4);
  airG.gain.setValueAtTime(0, DUSK_AT.close[0]);
  airG.gain.linearRampToValueAtTime(0.025, DUSK_AT.close[1] + 0.2);
  airG.gain.setValueAtTime(0.025, DUSK_AT.in);
  airG.gain.linearRampToValueAtTime(0, DUSK_AT.in + 0.5);

  // the hook: a fat pop as it lands, a smaller one for the face, then the sigh: a breath
  // out and a note going flat
  const h = NOON_AT.hook;
  tone(E, h, { f: 130, f1: 48, dur: 0.28, gain: 0.5 });
  tone(E, h, { type: 'square', f: 660, f1: 990, dur: 0.06, gain: 0.05, lp: 3000 });
  hiss(E, h, { type: 'lowpass', f: 1800, dur: 0.05, gain: 0.25 });
  tone(E, h + 0.1, { type: 'square', f: 990, f1: 1320, dur: 0.05, gain: 0.04, lp: 3500 });
  hiss(E, h + 0.35, { f: 1500, f1: 420, q: 0.8, dur: 1.0, a: 0.25, gain: 0.12, verb: 0.2 });
  tone(E, h + 0.4, { type: 'triangle', f: 523, f1: 247, dur: 0.95, a: 0.04, gain: 0.07, lp: 1600, verb: 0.25 });
  hiss(E, NOON_AT.hook + 1.38, { f: 2400, f1: 700, q: 1, dur: 0.22, a: 0.03, gain: 0.08 }); // away

  // the keys: each press a click and a thock; Enter heavier; Claude's card a soft blip
  const key = (t, k = 1) => {
    hiss(E, t, { f: rand(2800, 4200), q: 1.6, dur: 0.014, gain: 0.16 * k, a: 0.0008 });
    tone(E, t, { f: rand(190, 240), f1: 120, dur: 0.035, gain: 0.12 * k, a: 0.001 });
  };
  const typing = ([a, b], n, k = 1) => {
    for (let i = 0; i < n; i++) key(a + ((b - a) * i) / (n - 1) + rand(-0.025, 0.025), k * rand(0.7, 1));
  };
  const enter = (t, k = 1) => {
    hiss(E, t, { f: 2200, q: 1.2, dur: 0.025, gain: 0.22 * k, a: 0.001 });
    tone(E, t, { f: 150, f1: 80, dur: 0.07, gain: 0.25 * k, a: 0.001 });
  };
  const card = (t, k = 1) => {
    tone(E, t, { f: 1318.5, dur: 0.09, gain: 0.03 * k, a: 0.004 });
    tone(E, t + 0.07, { f: 1760, dur: 0.18, gain: 0.03 * k, a: 0.004, verb: 0.2 });
  };
  // Clawd: a hop's squeak, the spring of the jump, the pop through the glass, a soft landing
  const hop = (t) => tone(E, t, { type: 'triangle', f: 520, f1: 760, dur: 0.07, gain: 0.06 });
  const jump = (t) => tone(E, t, { type: 'triangle', f: 300, f1: 1100, dur: 0.2, gain: 0.07, lp: 4000 });
  const pop = (t) => {
    tone(E, t, { f: 900, f1: 260, dur: 0.09, gain: 0.16 });
    hiss(E, t, { f: 3000, q: 1, dur: 0.02, gain: 0.12 });
  };
  const thump = (t) => {
    tone(E, t, { f: 170, f1: 70, dur: 0.09, gain: 0.22 });
    key(t + 0.01, 0.5);
    key(t + 0.05, 0.35);
  };
  // into a screen: a rush rising, a few bits as it goes through the glass
  const dive = (t, len) => {
    hiss(E, t, { f: 400, f1: 3200, q: 1.3, dur: len, a: len * 0.7, gain: 0.1 });
    for (let i = 0; i < 4; i++) tone(E, t + len + i * 0.035, { type: 'square', f: rand(1200, 2600), dur: 0.025, gain: 0.012, lp: 4000 });
  };
  const N = NOON_AT;
  typing(N.type, 9);
  enter(N.enter);
  card(N.card);
  tone(E, N.rod, { f: 1500, dur: 0.02, gain: 0.03 }); // the rod put down
  hop(N.hop);
  jump(N.jump);
  pop(N.out);
  thump(N.land);
  dive(N.dive, N.in - N.dive);

  // the glitch into the room's tube: chopped bits and static, frame by frame
  const [g0, g1] = MACHINE_AT.glitch;
  for (let t = g0; t < g1; t += 1 / 30) {
    if (Math.random() < 0.7) tone(E, t, { type: 'square', f: rand(300, 3000), dur: 0.02, gain: 0.02 * rand(0.5, 1), lp: 5000 });
    if (Math.random() < 0.5) hiss(E, t + 0.01, { type: 'highpass', f: rand(2000, 6000), dur: 0.015, gain: 0.05 });
  }
  tone(E, g1, { f: 70, f1: 50, dur: 0.15, gain: 0.12 }); // the tube catching

  // the room into the window, and the window closing
  hiss(E, MACHINE_AT.shrink[0], { f: 3200, f1: 700, q: 1, dur: 0.45, a: 0.1, gain: 0.07 });
  tone(E, DUSK_AT.close[0], { type: 'square', f: 880, f1: 440, dur: 0.05, gain: 0.03, lp: 3000 });
  tone(E, DUSK_AT.close[0] + 0.02, { f: 220, f1: 120, dur: 0.05, gain: 0.12 });

  const D = DUSK_AT;
  typing(D.type, 6);
  enter(D.enter);
  card(D.card);
  hop(D.hop);
  jump(D.jump);
  pop(D.out);
  thump(D.land);
  dive(D.dive, D.in - D.dive);

  // the raft: the deploy typed on the laptop in the air, softer out on the water
  const R = RAFT_AT;
  typing(R.type, 6, 0.6);
  enter(R.enter, 0.6);
  card(R.card, 0.7);

  // the word made: a bell; the end card's two lines a pixel blip each
  for (const [f, d, g] of [[1046.5, 2.4, 0.05], [2093, 1.8, 0.03], [3136, 1.2, 0.02], [4186, 0.8, 0.012]]) tone(E, R.title, { f, dur: d, gain: g, a: 0.002, verb: 0.5 });
  for (const [i, x] of [0.3, 0.9].entries()) tone(E, R.card2 + x, { type: 'square', f: [784, 1046.5][i], dur: 0.07, gain: 0.025, lp: 3500 });
}
