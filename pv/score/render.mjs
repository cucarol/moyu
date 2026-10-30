#!/usr/bin/env node
// Renders the launch PV's score (score.js) the same way every time: a muted headless Chrome
// plays it into an OfflineAudioContext with a seeded Math.random and posts the channels
// back here. Writes its two stems as they come (32-bit float, 48 kHz): pv/cut/join.py sets
// their levels against the parts' own sound and brings the whole cut to loudness.
// No moyu server: it serves web/ and pv/ itself.
//
//   node pv/score/render.mjs [--out dir]      (default renders/pv-score/, not committed)
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { RATE } from './map.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const STEMS = ['music', 'sfx']; // as in score.js
const argv = process.argv.slice(2);
const OUT = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : join(ROOT, 'renders', 'pv-score');

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

async function renderInChrome() {
  const channels = [];
  let finish;
  const done = new Promise((resolve, reject) => (finish = { resolve, reject }));
  const server = await serve((parts, body) => {
    if (parts[0] === 'out') channels[Number(parts[1])] = new Float32Array(body.buffer.slice(body.byteOffset, body.byteOffset + body.length));
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
    `http://127.0.0.1:${server.address().port}/pv/score/render.html`,
  ], { stdio: 'ignore' });
  const timer = setTimeout(() => finish.reject(new Error('no score after 10 min')), 600000);
  try {
    const info = await done;
    return { info, channels };
  } finally {
    clearTimeout(timer);
    proc.kill();
    await new Promise((r) => (proc.exitCode !== null ? r() : proc.once('exit', r)));
    await rm(profile, { recursive: true, force: true }).catch(() => {});
    server.close();
  }
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
const peakDb = (chs) => 20 * Math.log10(Math.max(...chs.map((c) => c.reduce((m, v) => Math.max(m, Math.abs(v)), 0))));

const t0 = Date.now();
const { info, channels } = await renderInChrome();
console.log(`rendered ${(info.length / info.sampleRate).toFixed(2)} s in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
await mkdir(OUT, { recursive: true });
for (const [i, name] of STEMS.entries()) {
  const pair = [channels[i * 2], channels[i * 2 + 1]];
  await writeFile(join(OUT, `${name}.wav`), wavFloat(pair));
  console.log(`${name}.wav  peak ${peakDb(pair).toFixed(1)} dBFS`);
}
console.log(`wrote ${OUT}`);
