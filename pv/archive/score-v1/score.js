// The launch PV's score, played by the game's own synth voices (web/play/audio.js) into an
// OfflineAudioContext. Every note is placed on the clock in map.js, so the picture can be
// cut to beatmap.json. 序破急: a sparse terminal, the machine room's Wired drone with a
// groove that builds as the rack lights, the raft's Lantern at dusk, the night's pulse up
// to the Yacht roll, a hush while the dice hang, then the theme, and a button.
// render.html seeds Math.random first, so every render is the same.
import { makeEnv, SCORE_KIT } from '../../web/play/audio.js';
import { BEAT, BAR, LENGTH, RATE, at, MARKERS } from './map.js';

const { tone, hiss, epiano, knock, snap, brushCrash, mtof, LANTERN } = SCORE_KIT;
const [DB, CM, FM, AB] = LANTERN; // Dbmaj9, Cm7, Fm9, Abmaj9: the key is A flat
const chord = (bass, keys) => ({ bass: mtof(bass), keys: keys.map(mtof) });
const EB = chord(39, [55, 58, 61, 65]); // Eb9, the way home
const BBM = chord(46, [61, 65, 68, 72]); // Bbm9

// The machine room's drone chords (the Wired, voiced low), in F minor: the same notes as
// A flat's pentatonic, which its pings and the rack's glints play.
const WIRED = { fm: [41, 48, 56, 63], db: [37, 44, 53, 60], bbm: [34, 41, 49, 56], eb: [39, 46, 55, 61], ab: [44, 51, 60, 67] };
const GLINTS = [84, 87, 89, 92, 94, 96].map(mtof);

// The theme, a bar for each of Lantern's chords: [beat, beats long, midi note].
const THEME = [
  [[0, 1, 77], [1, 0.5, 75], [1.5, 1, 72], [2.5, 0.5, 75], [3, 1, 77]],
  [[0, 1.5, 75], [1.5, 0.5, 72], [2, 1, 70], [3, 0.5, 72], [3.5, 0.5, 75]],
  [[0, 1, 80], [1, 0.5, 77], [1.5, 1, 75], [2.5, 0.5, 77], [3, 1, 72]],
  [[0, 0.5, 70], [0.5, 0.5, 72], [1, 3, 75]],
];
const THEME_END = [[0, 0.5, 77], [0.5, 0.5, 80], [1, 3, 84]]; // the last bar, up high

export const STEMS = ['music', 'drums', 'fx', 'game'];
// Every note the score plays, by part, for v2 (v2/render.py plays them on Surge XT):
// { part, t, ... } with midi notes (m), lengths in seconds (dur) and v1's levels (vel).
// The game's own sounds (the dice, the card snap) are the 'game' stem and stay as they are.
export const EVENTS = [];
const toMidi = (f) => Math.round((69 + 12 * Math.log2(f / 440)) * 100) / 100;
// each stem's compressor: threshold (dB), ratio, attack and release (s), met DRIVE louder
// than the voices play (they are at the game's quiet levels)
const SQUEEZE = { music: [-24, 4, 0.003, 0.2], drums: [-22, 5, 0.002, 0.1], fx: [-22, 4, 0.002, 0.2], game: [-22, 5, 0.002, 0.1] };
const DRIVE = 10;
// the piece's shape after the compressors (dB, the same on every stem): 序 quiet, 破
// building through the rooms, 急 full at the drop, then down for the end card
const ARC = [[0, -6.5], [3, -4.5], [8, -3], [11, -2], [12, -3], [19, -3], [23, -1.5], [25, 0], [29, -2], [32, -3]];

/** Renders the score: channels 0-1 the mix, then two for each of STEMS (they sum to it). */
export async function renderScore() {
  const n = STEMS.length * 2 + 2;
  const ctx = new OfflineAudioContext({ numberOfChannels: n, length: Math.ceil(LENGTH * RATE), sampleRate: RATE });
  Object.assign(ctx.destination, { channelCount: n, channelCountMode: 'explicit', channelInterpretation: 'discrete' });
  const merger = ctx.createChannelMerger(n);
  merger.connect(ctx.destination);
  const stereo = () => Object.assign(ctx.createGain(), { channelCount: 2, channelCountMode: 'explicit' });
  const tap = (node, ch) => {
    const split = ctx.createChannelSplitter(2);
    node.connect(split);
    split.connect(merger, 0, ch);
    split.connect(merger, 1, ch + 1);
  };
  const mix = stereo();
  tap(mix, 0);
  // each stem through a gentle compressor (synth chords and hits are all peaks), so the
  // renderer's limiter only has to catch the odd one
  const stems = {};
  STEMS.forEach((name, i) => {
    stems[name] = stereo();
    stems[name].gain.value = DRIVE;
    const comp = ctx.createDynamicsCompressor();
    const [threshold, ratio, attack, release] = SQUEEZE[name];
    comp.threshold.value = threshold;
    comp.ratio.value = ratio;
    comp.knee.value = 8;
    comp.attack.value = attack;
    comp.release.value = release;
    const out = stereo();
    ARC.forEach(([bar, db], j) => out.gain[j ? 'linearRampToValueAtTime' : 'setValueAtTime'](10 ** (db / 20) / DRIVE, at(bar)));
    stems[name].connect(comp).connect(out);
    out.connect(mix);
    tap(out, 2 + i * 2);
  });
  play(ctx, stems);
  return ctx.startRendering();
}

/**
 * One part alone (a name from EVENTS, 'game' for the game's own sounds, or '*' for all of
 * them together), before the stems' compressors and the arc: v2 matches each of its parts
 * to this one's loudness, and can take any of them in its place.
 */
export async function renderSolo(part) {
  const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: Math.ceil(LENGTH * RATE), sampleRate: RATE });
  const stems = Object.fromEntries(STEMS.map((name) => {
    const g = ctx.createGain();
    g.gain.value = DRIVE;
    g.connect(ctx.destination);
    return [name, g];
  }));
  play(ctx, stems, part);
  return ctx.startRendering();
}

function play(ctx, stems, solo = null) {
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];
  EVENTS.length = 0;
  // rec notes a part's event. With solo, only that part sounds: every other voice still
  // plays (so the random draws stay the same as the full render's, note for note), into
  // a sink, through via(part, E).
  const plays = (part) => !solo || solo === '*' || solo === part;
  const rec = (part, t, o = {}) => EVENTS.push({ part, t: Math.round(t * 1e5) / 1e5, ...o });

  // the music, its mids dipping at the hits to leave the game's sounds room
  const musicIn = ctx.createGain();
  const mids = ctx.createBiquadFilter();
  mids.type = 'peaking';
  mids.frequency.value = 1400;
  mids.Q.value = 0.7;
  mids.gain.value = 0;
  musicIn.connect(mids).connect(stems.music);
  for (const t of [MARKERS.liveShot, MARKERS.testsPass, MARKERS.yachtLand, MARKERS.title]) {
    mids.gain.setValueAtTime(0, t - 0.03);
    mids.gain.linearRampToValueAtTime(-9, t);
    mids.gain.setValueAtTime(-9, t + 0.3);
    mids.gain.linearRampToValueAtTime(0, t + 1);
  }
  const M = makeEnv(ctx, musicIn);
  const sink = ctx.createGain();
  const hush = { ...M, out: sink, verb: sink };
  const via = (part, E) => (plays(part) ? E : hush);
  // the keys: warm and closed, open for the theme
  const keysLp = ctx.createBiquadFilter();
  keysLp.type = 'lowpass';
  keysLp.connect(M.out);
  for (const [bar, f] of [[0, 2600], [19, 2600], [21, 3200], [23, 4200], [25, 5200], [29, 3000]]) keysLp.frequency.setValueAtTime(f, at(bar));
  const K = { ...M, out: keysLp };
  const D = makeEnv(ctx, stems.drums);
  const X = makeEnv(ctx, stems.fx);
  const G = makeEnv(ctx, stems.game);
  const pan = (E, p) => {
    const s = ctx.createStereoPanner();
    s.pan.value = p;
    s.connect(E.out);
    return { ...E, out: s };
  };

  // ---- voices -----------------------------------------------------------------------
  const strum = (t, keys, { dur = BEAT * 3.4, gain = 0.026, verb = 0.3, up = 1 } = {}) =>
    keys.forEach((f, j) => {
      rec('keys', t + j * 0.014, { m: toMidi(f * up), dur, vel: gain });
      epiano(via('keys', K), t + j * 0.014, f * up, { dur, gain, verb });
    });
  const key = (E, t, f, o, part = 'keys', p = 0) => {
    rec(part, t, { m: toMidi(f), dur: o.dur, vel: o.gain, pan: p });
    epiano(via(part, E), t, f, o);
  };
  // (the low end sits well under the game's levels: it fills the peaks, not the loudness)
  const bass = (t, f, beats, gain = 0.15, lp = 320) => (rec('bass', t, { m: toMidi(f), dur: beats * BEAT, vel: gain }), tone(via('bass', M), t, { type: 'triangle', f, dur: beats * BEAT, gain: gain * 0.45, a: 0.01, lp }));
  const lead = (t, m, beats, k = 1, oct = 0) => {
    const f = mtof(m + oct * 12);
    const dur = Math.max(0.12, beats * BEAT * 0.9);
    rec('lead', t, { m: toMidi(f), dur, vel: k });
    epiano(via('lead', K), t, f, { dur: dur + 0.3, gain: 0.05 * k, verb: 0.35 });
    tone(via('lead', K), t, { type: 'square', f, dur, gain: 0.01 * k, a: 0.012, lp: 2200, verb: 0.2 });
  };
  const phrase = (bar, notes, k, oct) => notes.forEach(([b, len, m]) => lead(at(bar, b), m, len, k, oct));
  const glint = (t, k = 1) => {
    const p = rand(-0.8, 0.8);
    const f = pick(GLINTS);
    rec('glint', t, { m: toMidi(f), dur: 0.3, vel: k, pan: p });
    tone(pan(via('glint', M), p), t, { f, dur: 0.3, gain: 0.008 * k, a: 0.005, verb: 0.35 });
  };
  const kick = (t, k = 1) => (rec('kick', t, { vel: k }), tone(via('kick', D), t, { f: 120, f1: 46, dur: 0.24, gain: 0.12 * k, a: 0.003 }));
  const rim = (t, k = 1) => {
    rec('rim', t, { vel: k });
    hiss(via('rim', D), t, { f: 1900, q: 0.8, dur: 0.14, a: 0.002, gain: 0.05 * k, verb: 0.15 });
    tone(via('rim', D), t, { f: 210, f1: 160, dur: 0.05, gain: 0.03 * k, a: 0.002 });
  };
  const hat = (t, k = 1) => (rec('hat', t, { vel: k }), hiss(via('hat', D), t, { type: 'highpass', f: 7000, dur: 0.03, a: 0.001, gain: 0.011 * k }));
  const shake = (t, k = 1) => knock(via('game', G), t, 0.2 * k, 1.1); // dice in the cup
  const boom = (t, k = 1) => {
    rec('boom', t, { vel: k });
    tone(via('boom', X), t, { f: 80, f1: 32, dur: 1.1, gain: 0.1 * k, a: 0.002 });
    hiss(via('boom', X), t, { type: 'lowpass', f: 900, f1: 120, dur: 0.6, gain: 0.08 * k, verb: 0.3 });
  };
  const crash = (t, k = 1) => (rec('crash', t, { vel: k }), brushCrash(via('crash', X), t, 0.045 * k));
  // a rise of filtered air peaking at t + rise
  const swell = (t, rise, f0, f1, gain, type = 'bandpass') => (rec('swell', t, { rise, f0, f1, vel: gain, type }), hiss(via('swell', X), t, { type, f: f0, f1, q: 1.2, a: rise, dur: 0.05, gain }));

  // ---- 0-3 the terminal: a hush, a note, room for Clawd's question --------------------
  rec('pad', 0.05, { m: 44, dur: 5, vel: 0.022, a: 1.5 });
  tone(via('pad', M), 0.05, { f: mtof(44), dur: 5, gain: 0.022, a: 1.5, verb: 0.3 });
  rec('pad', 0.05, { m: 51, dur: 5, vel: 0.013, a: 2 });
  tone(via('pad', M), 0.05, { f: mtof(51), dur: 5, gain: 0.013, a: 2, verb: 0.3 });
  key(K, at(0), mtof(68), { dur: 2, gain: 0.035, verb: 0.5 });
  key(K, at(0, 2), mtof(75), { dur: 1.5, gain: 0.02, verb: 0.5 });
  // (来一局？ at MARKERS.ask) and an answer, rising
  key(K, at(2), mtof(72), { dur: 0.6, gain: 0.035, verb: 0.4 });
  key(K, at(2, 0.5), mtof(75), { dur: 1.2, gain: 0.035, verb: 0.4 });
  swell(at(2, 2), BEAT * 2 - 0.05, 200, 2400, 0.04);

  // ---- 3-12 the machine room: the Wired, a groove building as the rack lights ----------
  const drone = (() => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at(2, 2));
    g.gain.linearRampToValueAtTime(0.1, at(3));
    g.gain.setValueAtTime(0.1, at(11, 3));
    g.gain.linearRampToValueAtTime(0, at(13));
    if (plays('drone')) g.connect(M.out);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 2;
    f.connect(g);
    f.frequency.setValueAtTime(420, at(3));
    f.frequency.linearRampToValueAtTime(700, at(7));
    f.frequency.linearRampToValueAtTime(1000, at(10));
    f.frequency.setValueAtTime(1000, at(11));
    f.frequency.exponentialRampToValueAtTime(2600, at(11, 3.5));
    // the Wired's slow delay, here a dotted eighth
    const delay = ctx.createDelay(2);
    delay.delayTime.value = BEAT * 0.75;
    const fb = ctx.createGain();
    fb.gain.value = 0.45;
    const fbLp = ctx.createBiquadFilter();
    fbLp.type = 'lowpass';
    fbLp.frequency.value = 1800;
    delay.connect(fbLp).connect(fb).connect(delay);
    const back = ctx.createGain();
    back.gain.value = 0.5;
    delay.connect(back).connect(M.out);
    if (plays('drone')) g.connect(delay);
    const changes = [[at(3), 'fm'], [at(5), 'db'], [at(7), 'bbm'], [at(8), 'fm'], [at(10), 'db'], [at(10, 2), 'eb'], [at(11), 'ab']];
    // (fades in from bar 2.5 to 3 and out from 11.75 to 13; opens up through bar 11)
    rec('drone', at(2, 2), { changes: changes.map(([t, name]) => [t, WIRED[name]]), end: at(13) });
    const oscs = WIRED.fm.flatMap((m, i) => [-7, 7].map((c) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.detune.value = c;
      for (const [t, name] of changes) o.frequency.setTargetAtTime(mtof(WIRED[name][i]), t, 0.12);
      const v = ctx.createGain();
      v.gain.value = 0.05;
      o.connect(v).connect(f);
      return o;
    }));
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.043;
    const depth = ctx.createGain();
    depth.gain.value = 180;
    lfo.connect(depth).connect(f.frequency);
    for (const o of [...oscs, lfo]) {
      o.start(at(2, 2));
      o.stop(at(13) + 0.1);
    }
    return { delay };
  })();
  // pings from the Wired: the theme's first notes, through its delay
  const pings = { ...M, out: drone.delay };
  for (const [bar, b, m] of [[3, 0, 77], [4, 0, 75], [4, 2, 72], [5, 0, 80], [6, 0, 77], [6, 1.5, 75], [6, 2.5, 72], [7, 0, 84], [9, 2, 80], [10, 0, 77]]) {
    rec('ping', at(bar, b), { m, dur: 1.2, vel: 0.022 });
    tone(via('ping', M), at(bar, b), { type: b ? 'triangle' : 'sine', f: mtof(m), dur: 1.2, gain: 0.022, a: 0.01 });
    tone(via('ping', pings), at(bar, b), { type: 'sine', f: mtof(m), dur: 1.2, gain: 0.022, a: 0.01 });
  }
  // the rack lighting up: glints, more of them each bar (none while the shot rings)
  const lights = { 5: 1, 6: 1, 7: 2, 8: 2, 9: 3, 10: 4 };
  for (const [bar, per] of Object.entries(lights)) {
    for (let b = bar === '8' ? 2 : 0; b < 4; b++) {
      const slots = [0, 1, 2, 3].sort(() => Math.random() - 0.5).slice(0, per);
      for (const s of slots) glint(at(+bar, b + s / 4), 0.7 + per * 0.1);
    }
  }
  const root = (name) => mtof(WIRED[name][0]);
  const roomChord = (bar, b) => (bar < 5 ? 'fm' : bar < 7 ? 'db' : bar < 8 ? 'bbm' : bar < 10 ? 'fm' : b < 2 ? 'db' : 'eb');
  for (let bar = 4; bar < 11; bar++) {
    for (let b = 0; b < 4; b++) {
      const f = root(roomChord(bar, b));
      if (bar < 8) bass(at(bar, b), f, 0.8, 0.13);
      else if (bar > 8 || b >= 2) for (const h of [0, 0.5]) bass(at(bar, b + h), f, 0.42, h ? 0.09 : 0.12);
    }
  }
  bass(at(11), root('ab'), 2, 0.15);
  for (let i = 0; i < 4; i++) bass(at(11, 2 + i / 2), root('ab'), 0.42, 0.09 + i * 0.015);
  // the drums come in a piece at a time
  for (let bar = 5; bar < 11; bar++) {
    const hit = bar === 8;
    for (let b = 0; b < 4; b++) {
      const t = at(bar, b);
      if (hit && b < 2) continue; // the shot: only the boom
      if (b === 0 || b === 2) kick(t, bar < 7 ? 0.8 : 1);
      if (bar >= 7 && b === 1) kick(at(bar, 1.5), 0.6);
      if (bar >= 6) hat(at(bar, b + 0.5), 0.9);
      if (bar >= 7) hat(t, 0.6);
      if (bar >= 9) {
        hat(at(bar, b + 0.25), 0.3);
        hat(at(bar, b + 0.75), 0.3);
      }
      if ((bar >= 8 && b % 2) || (bar === 7 && b === 3)) rim(t, bar >= 9 ? 1 : 0.8);
    }
  }
  for (let i = 0; i < 4; i++) rim(at(10, 3 + i / 4), 0.5 + i * 0.15);
  boom(MARKERS.liveShot);
  crash(MARKERS.liveShot, 0.8);
  // all tests pass: the drone opens, a green wave of keys sweeps up across the room
  kick(MARKERS.testsPass);
  crash(MARKERS.testsPass);
  swell(MARKERS.testsPass, BAR - 0.3, 300, 9000, 0.05, 'lowpass');
  strum(MARKERS.testsPass, AB.keys, { dur: BAR, gain: 0.024, verb: 0.45 });
  [56, 60, 63, 67, 70, 72, 75, 79, 80, 84, 87, 91].forEach((m, i, a) =>
    key(pan(K, -0.8 + (1.6 * i) / (a.length - 1)), at(11, i / 4), mtof(m), { dur: 0.9, gain: 0.02, verb: 0.45 }, 'arp', -0.8 + (1.6 * i) / (a.length - 1)));
  for (let i = 0; i < 16; i++) hat(at(11, i / 4), 0.4 + (0.8 * i) / 15);
  for (let i = 0; i < 4; i++) rim(at(11, 3 + i / 4), 0.6 + i * 0.15);

  // ---- 12-19 the raft at dusk: Lantern ------------------------------------------------
  const lantern = (bar, c, { swing = 0.62, push = false, busy = false, theme = null } = {}) => {
    const t = at(bar);
    const off = (b) => at(bar, b + swing);
    strum(t, c.keys);
    if (push) strum(off(2), c.keys, { dur: BEAT * 1.2, gain: 0.015 });
    bass(t, c.bass, 1.5, 0.16);
    bass(off(2), c.bass, 0.9, 0.12);
    kick(t);
    kick(off(1), 0.7);
    for (let b = 0; b < 4; b++) {
      if (b % 2) rim(at(bar, b));
      hat(at(bar, b), b % 2 ? 0.8 : 1);
      hat(off(b), 0.6);
      if (busy) {
        hat(at(bar, b + 0.25), 0.35);
        hat(at(bar, b + 0.75), 0.35);
      }
    }
    if (theme) phrase(bar, theme, 0.45, -1);
  };
  lantern(12, DB);
  lantern(13, CM, { push: true });
  lantern(14, FM, { theme: THEME[2] });
  lantern(15, AB, { push: true, theme: THEME[3] });
  lantern(16, DB, { busy: true });
  lantern(17, EB, { busy: true, push: true });
  // the boats' lanterns lighting along the horizon, one by one
  [75, 77, 80, 82, 84, 87, 89, 92].forEach((m, i) => key(pan(K, -0.8 + (1.6 * i) / 7), at(17, i / 2), mtof(m), { dur: 1.2, gain: 0.013, verb: 0.5 }, 'arp', -0.8 + (1.6 * i) / 7));
  // the whole horizon lit: a breath, the chord ringing
  strum(MARKERS.horizonLit, AB.keys, { dur: BEAT * 3.6, gain: 0.03, verb: 0.5 });
  bass(MARKERS.horizonLit, AB.bass, 3, 0.15);
  kick(MARKERS.horizonLit, 0.6);
  crash(MARKERS.horizonLit, 0.6);
  [87, 91, 94, 96].forEach((m, i) => {
    rec('shimmer', MARKERS.horizonLit + i * 0.08, { m, dur: 1.6, vel: 0.007, pan: -0.5 + i / 3 });
    tone(pan(via('shimmer', M), -0.5 + i / 3), MARKERS.horizonLit + i * 0.08, { f: mtof(m), dur: 1.6, gain: 0.007, a: 0.01, verb: 0.6 });
  });
  swell(at(18, 2), BEAT * 2 - 0.05, 250, 3000, 0.03);

  // ---- 19-25 night: the pulse quickens to the Yacht roll ------------------------------
  const night = [[19, FM], [20, DB], [21, FM], [22, DB]];
  for (const [bar, c] of night) {
    strum(at(bar), c.keys, { dur: BEAT * 1.2, gain: 0.024 });
    strum(at(bar, 1.5), c.keys, { dur: BEAT * 0.6, gain: 0.018 });
    strum(at(bar, 3), c.keys, { dur: BEAT * 0.6, gain: 0.016 });
  }
  strum(at(23), BBM.keys, { dur: BEAT * 1.2, gain: 0.024 });
  strum(at(23, 2), EB.keys, { dur: BEAT * 1.2, gain: 0.024 });
  for (let i = 0; i < 40; i++) {
    const bar = 19 + Math.floor(i / 8);
    const c = bar < 23 ? night[bar - 19][1] : i % 8 < 4 ? BBM : EB;
    bass(at(19, i / 2), c.bass, 0.42, i % 2 ? 0.09 : 0.12, 420);
  }
  for (let bar = 19; bar < 24; bar++) {
    for (let b = 0; b < 4; b++) {
      const t = at(bar, b);
      if (bar >= 21 || b % 2 === 0) kick(t, bar >= 21 && b % 2 ? 0.8 : 1);
      if (bar >= 20 && b % 2 && bar < 23) rim(t);
      hat(t, 0.6);
      hat(at(bar, b + 0.5), 0.9);
      if (bar >= 21) {
        hat(at(bar, b + 0.25), 0.4);
        hat(at(bar, b + 0.75), 0.4);
        shake(at(bar, b + 0.5), 0.6);
      }
      if (bar < 23 && Math.random() < 0.6) glint(at(bar, b + pick([0, 0.5])), 0.8); // the stars coming out
    }
  }
  // the riser: the dice shaken harder, a roll, air and a climbing tone
  for (let i = 0; i < 32; i++) shake(at(23, i / 8), 0.4 + (1.2 * i) / 31);
  [0, 0.5, 1, 1.5, 2, 2.25, 2.5, 2.75, 3, 3.125, 3.25, 3.375, 3.5, 3.625, 3.75, 3.875].forEach((b, i) => rim(at(23, b), 0.4 + i * 0.05));
  swell(MARKERS.riser, BAR - 0.05, 300, 7000, 0.08);
  rec('riser', MARKERS.riser, { m: 45, m1: 81, dur: BAR - 0.05, vel: 0.025 });
  tone(via('riser', X), MARKERS.riser, { type: 'sawtooth', f: 110, f1: 880, a: BAR - 0.05, dur: 0.05, gain: 0.025, lp: 2500 });
  // the freeze: the dice leave the cup, then near silence while they hang
  const F = MARKERS.yachtFreeze;
  for (const dt of [0, 0.02, 0.045]) knock(via('game', G), F + dt, 0.3);
  rec('toss', F, { rise: 0.08, dur: 0.35, f0: 500, f1: 3500, vel: 0.02 });
  hiss(via('toss', X), F, { f: 500, f1: 3500, q: 1.2, a: 0.08, dur: 0.35, gain: 0.02 });
  rec('shimmer', F + 0.2, { m: 87, dur: 1.4, vel: 0.0016, a: 0.5, pan: -0.4 });
  tone(pan(via('shimmer', M), -0.4), F + 0.2, { f: mtof(87), dur: 1.4, gain: 0.0016, a: 0.5, verb: 0.7 });
  rec('shimmer', F + 0.3, { m: 94, dur: 1.3, vel: 0.0013, a: 0.5, pan: 0.4 });
  tone(pan(via('shimmer', M), 0.4), F + 0.3, { f: mtof(94), dur: 1.3, gain: 0.0013, a: 0.5, verb: 0.7 });
  swell(MARKERS.yachtLand - 0.61, 0.6, 150, 7000, 0.03, 'lowpass'); // breathing in

  // ---- 25-29 the drop: the dice land, the theme -------------------------------------
  boom(MARKERS.yachtLand, 0.8);
  crash(MARKERS.yachtLand, 0.9);
  [DB, CM, FM, AB].forEach((c, i) => {
    const bar = 25 + i;
    const off = (b) => at(bar, b + 0.58);
    strum(at(bar), c.keys, { gain: 0.03 });
    strum(at(bar), c.keys, { gain: 0.008, up: 2 });
    strum(off(2), c.keys, { dur: BEAT * 1.2, gain: 0.018 });
    c.keys.slice(0, 3).forEach((f) => (rec('pad', at(bar), { m: toMidi(f), dur: BEAT * 3.6, vel: 0.012, a: 0.3 }), tone(via('pad', M), at(bar), { type: 'triangle', f, dur: BEAT * 3.6, gain: 0.012, a: 0.3, lp: 1200 })));
    bass(at(bar), c.bass, 1.4, 0.17);
    for (const b of [1.58, 2, 2.58, 3.58]) bass(at(bar, b), c.bass, 0.4, 0.11);
    phrase(bar, i === 3 ? THEME_END : THEME[i], 1, 0);
    if (i) kick(at(bar)); // (the land is the boom's)
    kick(off(1), 0.75);
    kick(at(bar, 2));
    if (i % 2) kick(off(3), 0.6);
    for (let b = 0; b < 4; b++) {
      if (b % 2) rim(at(bar, b), 1.1);
      hat(at(bar, b), 1);
      hat(off(b), 0.7);
      hat(at(bar, b + 0.25), 0.35);
      shake(off(b), 0.5);
    }
  });
  crash(MARKERS.title, 0.7);
  for (let i = 0; i < 6; i++) glint(MARKERS.title + i * BEAT * 0.25, 1.2); // the stars twinkle

  // ---- 29-32 the end card: winding down to a button ---------------------------------
  strum(at(29), DB.keys, { dur: BEAT * 4, gain: 0.026, verb: 0.4 });
  bass(at(29), DB.bass, 3, 0.14);
  phrase(29, THEME[0], 0.6, 0);
  kick(at(29), 0.7);
  for (let b = 0; b < 4; b++) hat(at(29, b + 0.5), 0.6);
  rim(at(29, 3), 0.6);
  strum(at(30), FM.keys, { dur: BEAT * 2, gain: 0.022, verb: 0.4 });
  bass(at(30), FM.bass, 1.8, 0.12);
  strum(at(30, 2), EB.keys, { dur: BEAT * 2, gain: 0.022, verb: 0.4 });
  bass(at(30, 2), EB.bass, 1.8, 0.12);
  for (let b = 0; b < 4; b++) hat(at(30, b), 0.5);
  glint(at(30, 1), 0.8);
  glint(at(30, 3), 0.8);
  strum(at(31), AB.keys, { dur: BEAT * 1.2, gain: 0.02, verb: 0.3 });
  bass(at(31), AB.bass, 1.2, 0.12);
  lead(at(31, 1.5), 75, 0.4, 0.7);
  // the button: one dry hit on the home chord, and a little pixel ding
  const end = MARKERS.end;
  [56, 63, 68, 72].forEach((m) => key(K, end, mtof(m), { dur: 0.3, gain: 0.045, verb: 0.1 }));
  bass(end, AB.bass, 0.5, 0.18);
  kick(end);
  snap(via('game', G), end, 0.5);
  rec('ding', end + 0.04, { m: 92, dur: 0.12, vel: 0.012 });
  tone(via('ding', X), end + 0.04, { type: 'square', f: mtof(92), dur: 0.12, gain: 0.012, a: 0.002, lp: 4000 });
}
