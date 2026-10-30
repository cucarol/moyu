#!/usr/bin/env node
// Renders the launch PV's score (score.js) the same way every time: a muted headless Chrome
// plays it into an OfflineAudioContext with a seeded Math.random and posts the channels
// back here. This brings the mix to -14 LUFS under a -2.5 dBFS peak limiter and writes
// 48 kHz 24-bit WAVs and the beat map. No moyu server: it serves web/ and pv/ itself.
//
//   node pv/score/render.mjs [--out dir] [--solo]
//
// Into --out (default renders/pv-score/, not committed): score.wav (the mix),
// score-no-drums.wav (music and fx, no percussion), stem-music.wav, stem-drums.wav,
// stem-fx.wav (the stems take the mix's gain but not its limiter, so they sum to it
// before limiting), beatmap.json. The beat map is also kept at pv/score/beatmap.json.
// It also writes every note by part to pv/score/v2/events.json, for v2.
//
// --solo renders each part alone instead, before the stems' compressors (the other parts
// play into a sink, so every note is the full render's), and writes the loudness of each
// to pv/score/v2/v1-levels.json (v2 matches its parts to these) and each part alone to
// solo/<part>.wav (32-bit float): the game's own sounds are v2's game stem, and any part
// v2 takes from v1 (v2/choice.json) comes from here.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { beatMap, SECTIONS, RATE, at } from './map.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const HERE = fileURLToPath(new URL('./', import.meta.url));
const STEMS = ['music', 'drums', 'fx', 'game']; // as in score.js, after the mix's two channels
const TARGET = -14; // LUFS
const CEILING = 10 ** (-2.5 / 20); // in samples: true peaks land up to a dB higher

const argv = process.argv.slice(2);
const OUT = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : join(ROOT, 'renders', 'pv-score');

// ---- the page and the browser ------------------------------------------------------

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json' };
function serve(got) {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const parts = path.split('/').filter(Boolean);
    if (req.method === 'POST') {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      got(parts, Buffer.concat(chunks));
      return res.writeHead(204).end();
    }
    if (!['web', 'pv'].includes(parts[0]) || parts.some((p) => p.includes('..'))) return res.writeHead(404).end();
    try {
      const data = await readFile(join(ROOT, ...parts));
      res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

async function renderInChrome(query = '') {
  const channels = [];
  const solos = {};
  let events = null;
  let finish;
  const done = new Promise((resolve, reject) => (finish = { resolve, reject }));
  const server = await serve((parts, body) => {
    if (parts[0] === 'out') channels[Number(parts[1])] = new Float32Array(body.buffer.slice(body.byteOffset, body.byteOffset + body.length));
    else if (parts[0] === 'solo') (solos[parts[1]] ??= [])[Number(parts[2])] = new Float32Array(body.buffer.slice(body.byteOffset, body.byteOffset + body.length));
    else if (parts[0] === 'events') events = body;
    else if (parts[0] === 'done') finish.resolve(JSON.parse(body));
    else if (parts[0] === 'error') finish.reject(new Error(`page: ${body}`));
  });
  const exe = process.env.CHROME ?? CHROMES.find(existsSync);
  if (!exe) throw new Error('no Chrome found; set CHROME');
  const profile = await mkdtemp(join(tmpdir(), 'moyu-score-'));
  const proc = spawn(exe, [
    '--headless=new',
    '--mute-audio', // every test browser: never a sound
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-timer-throttling',
    `http://127.0.0.1:${server.address().port}/pv/score/render.html${query}`,
  ], { stdio: 'ignore' });
  const timer = setTimeout(() => finish.reject(new Error('no score after 10 min')), 600000);
  try {
    const info = await done;
    return { info, channels, events, solos };
  } finally {
    clearTimeout(timer);
    proc.kill();
    await new Promise((r) => (proc.exitCode !== null ? r() : proc.once('exit', r)));
    await rm(profile, { recursive: true, force: true }).catch(() => {});
    server.close();
  }
}

// ---- loudness (ITU-R BS.1770-4) and a lookahead limiter ------------------------------

function biquad(x, [b0, b1, b2], [, a1, a2]) {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v;
    y[i] = v;
  }
  return y;
}
// K-weighting at 48 kHz: a high shelf, then a high pass
const kWeight = (x) => biquad(biquad(x, [1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585]), [1, -2, 1], [1, -1.99004745483398, 0.99007225036621]);
function lufs([l, r]) {
  const kl = kWeight(l), kr = kWeight(r);
  const size = 0.4 * RATE, step = 0.1 * RATE;
  const blocks = [];
  for (let s = 0; s + size <= kl.length; s += step) {
    let z = 0;
    for (let i = s; i < s + size; i++) z += kl[i] * kl[i] + kr[i] * kr[i];
    blocks.push(z / size);
  }
  const loud = (z) => -0.691 + 10 * Math.log10(z);
  const mean = (zs) => zs.reduce((a, b) => a + b, 0) / zs.length;
  const abs = blocks.filter((z) => loud(z) > -70);
  const rel = loud(mean(abs)) - 10;
  return loud(mean(abs.filter((z) => loud(z) > rel)));
}
// Gain that keeps every sample under the ceiling: the needed gain's minimum over the next
// 5 ms, averaged over 5 ms (so it is down in full by each peak), released over 80 ms.
function limit([l, r]) {
  const n = l.length, L = Math.round(0.005 * RATE);
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) need[i] = Math.min(1, CEILING / Math.max(Math.abs(l[i]), Math.abs(r[i]), 1e-9));
  const minAhead = new Float32Array(n);
  const q = []; // a monotonic deque of indices
  for (let i = n - 1; i >= 0; i--) {
    while (q.length && need[q[q.length - 1]] >= need[i]) q.pop();
    q.push(i);
    while (q[0] > i + L - 1) q.shift();
    minAhead[i] = need[q[0]];
  }
  const rel = 1 - Math.exp(-1 / (0.08 * RATE));
  let sum = L, g = 1; // the window starts full of ones
  let most = 1, busy = 0;
  for (let i = 0; i < n; i++) {
    sum += minAhead[i] - (i >= L ? minAhead[i - L] : 1);
    g = Math.min(sum / L, g + (1 - g) * rel);
    l[i] *= g;
    r[i] *= g;
    most = Math.min(most, g);
    if (g < 0.8) busy++;
  }
  // how hard it worked: the deepest cut, and how long it cut more than 2 dB
  return { most: 20 * Math.log10(most), busy: busy / RATE };
}
const scaled = (chs, k) => chs.map((c) => c.map((v) => v * k));
const peakDb = (chs) => 20 * Math.log10(Math.max(...chs.map((c) => c.reduce((m, v) => Math.max(m, Math.abs(v)), 0))));

// ---- files ---------------------------------------------------------------------------

function wav24([l, r]) {
  const n = l.length, data = n * 6;
  const b = Buffer.alloc(44 + data);
  b.write('RIFF', 0); b.writeUInt32LE(36 + data, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22);
  b.writeUInt32LE(RATE, 24); b.writeUInt32LE(RATE * 6, 28); b.writeUInt16LE(6, 32); b.writeUInt16LE(24, 34);
  b.write('data', 36); b.writeUInt32LE(data, 40);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (const v of [l[i], r[i]]) {
      b.writeIntLE(Math.round(Math.max(-1, Math.min(1, v)) * 8388607), o, 3);
      o += 3;
    }
  }
  return b;
}

function wavFloat([l, r]) {
  const n = l.length, data = n * 8;
  const b = Buffer.alloc(44 + data);
  b.write('RIFF', 0); b.writeUInt32LE(36 + data, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(3, 20); b.writeUInt16LE(2, 22);
  b.writeUInt32LE(RATE, 24); b.writeUInt32LE(RATE * 8, 28); b.writeUInt16LE(8, 32); b.writeUInt16LE(32, 34);
  b.write('data', 36); b.writeUInt32LE(data, 40);
  for (let i = 0; i < n; i++) {
    b.writeFloatLE(l[i], 44 + i * 8);
    b.writeFloatLE(r[i], 48 + i * 8);
  }
  return b;
}

function ebur128(file) {
  return new Promise((resolve) => {
    const p = spawn('ffmpeg', ['-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('error', () => resolve(null));
    p.on('exit', () => {
      const tail = err.slice(err.lastIndexOf('Summary:'));
      const I = /I:\s+(-?[\d.]+) LUFS/.exec(tail)?.[1];
      const TP = /Peak:\s+(-?[\d.]+) dBFS/.exec(tail)?.[1];
      resolve(I ? { lufs: Number(I), truePeak: Number(TP) } : null);
    });
  });
}

async function solo() {
  const t0 = Date.now();
  const events = JSON.parse(await readFile(join(HERE, 'v2', 'events.json'), 'utf8'));
  const names = [...new Set(events.map((e) => e.part)), 'game'];
  const { solos } = await renderInChrome(`?solo=${[...names, '*'].join(',')}`);
  console.log(`rendered ${names.length} parts alone in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const levels = {};
  for (const name of names) {
    levels[name] = { lufs: Math.round(lufs(solos[name]) * 100) / 100, peak: Math.round(peakDb(solos[name]) * 100) / 100 };
    console.log(`${name.padEnd(8)} ${levels[name].lufs.toFixed(1).padStart(6)} LUFS  peak ${levels[name].peak.toFixed(1)} dBFS`);
  }
  // the parts alone add up to all of them at once only if every note is the same
  let off = 0, top = 0;
  for (let c = 0; c < 2; c++) {
    for (let i = 0; i < solos['*'][c].length; i++) {
      let sum = 0;
      for (const name of names) sum += solos[name][c][i];
      off = Math.max(off, Math.abs(sum - solos['*'][c][i]));
      top = Math.max(top, Math.abs(solos['*'][c][i]));
    }
  }
  console.log(`the parts alone, summed, against all at once: ${(20 * Math.log10(off / top)).toFixed(1)} dB under the peak`);
  await writeFile(join(HERE, 'v2', 'v1-levels.json'), JSON.stringify(levels, null, 2) + '\n');
  await mkdir(OUT, { recursive: true });
  await mkdir(join(OUT, 'solo'), { recursive: true });
  for (const name of names) await writeFile(join(OUT, 'solo', `${name}.wav`), wavFloat(solos[name]));
  console.log(`wrote pv/score/v2/v1-levels.json and ${join(OUT, 'solo')}`);
}

async function main() {
  const t0 = Date.now();
  const { info, channels, events } = await renderInChrome();
  // every note, by part, for v2 (v2/render.py), one per line
  await mkdir(join(HERE, 'v2'), { recursive: true });
  await writeFile(join(HERE, 'v2', 'events.json'), `[\n${JSON.parse(events).map((e) => JSON.stringify(e)).join(',\n')}\n]\n`);
  console.log(`rendered ${(info.length / info.sampleRate).toFixed(2)} s, ${info.channels} channels in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const pair = (i) => [channels[i], channels[i + 1]];
  const raw = pair(0);
  const stems = Object.fromEntries(STEMS.map((s, i) => [s, pair(2 + i * 2)]));

  // the gain to the target, again after limiting (which takes a little loudness off)
  const before = lufs(raw);
  let gain = 10 ** ((TARGET - before) / 20);
  let mix, cut;
  for (let i = 0; i < 4; i++) {
    mix = scaled(raw, gain);
    cut = limit(mix);
    const got = lufs(mix);
    if (Math.abs(got - TARGET) < 0.05) break;
    gain *= 10 ** ((TARGET - got) / 20);
  }
  console.log(`mix as rendered ${before.toFixed(1)} LUFS, brought up ${(20 * Math.log10(gain)).toFixed(1)} dB`);
  console.log(`limiter: deepest cut ${cut.most.toFixed(1)} dB, more than 2 dB for ${cut.busy.toFixed(1)} s`);

  await mkdir(OUT, { recursive: true });
  const files = { 'score.wav': mix };
  // the stems at the mix's gain, all turned down together if one would clip
  const parts = Object.fromEntries(STEMS.map((s) => [`stem-${s}.wav`, scaled(stems[s], gain)]));
  parts['score-no-drums.wav'] = [0, 1].map((c) => stems.music[c].map((v, i) => (v + stems.fx[c][i]) * gain));
  const over = Math.max(...Object.values(parts).map(peakDb)) + 1;
  if (over > 0) console.log(`stems ${over.toFixed(1)} dB under the mix's level, so none clips`);
  for (const [name, chs] of Object.entries(parts)) files[name] = over > 0 ? scaled(chs, 10 ** (-over / 20)) : chs;
  for (const [name, chs] of Object.entries(files)) {
    await writeFile(join(OUT, name), wav24(chs));
    console.log(`${name.padEnd(20)} peak ${peakDb(chs).toFixed(2)} dBFS`);
  }
  const map = JSON.stringify(beatMap(), null, 2) + '\n';
  await writeFile(join(OUT, 'beatmap.json'), map);
  await writeFile(join(HERE, 'beatmap.json'), map);

  // how loud each section sits, stem by stem (RMS, dBFS)
  const rms = (c, a, b) => {
    let z = 0;
    for (let i = a; i < b; i++) z += c[i] * c[i];
    return (10 * Math.log10(z / (b - a) + 1e-12)).toFixed(1);
  };
  console.log('section        mix   music drums fx   (RMS dBFS)');
  for (const s of SECTIONS) {
    const a = Math.round(at(s.from) * RATE), b = Math.round(at(s.to) * RATE);
    const row = [mix, ...STEMS.map((k) => files[`stem-${k}.wav`])].map((chs) => rms(chs[0], a, b).padStart(5));
    console.log(`${s.name.padEnd(13)} ${row.join(' ')}`);
  }
  const check = await ebur128(join(OUT, 'score.wav'));
  if (check) console.log(`score.wav: ${check.lufs} LUFS integrated, true peak ${check.truePeak} dBFS (ffmpeg ebur128)`);
  console.log(`wrote ${OUT}`);
}

(argv.includes('--solo') ? solo : main)().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
