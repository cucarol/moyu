#!/usr/bin/env node
// Renders the game's own sounds offline, the way they play in the page, for comparing
// against their Surge XT versions: a muted headless Chrome opens listen.html, which plays
// each job into an OfflineAudioContext (the tracks' timers run on its clock) and posts it
// back. No moyu server: it serves web/ and scripts/sound/ itself.
//
//   node scripts/sound/listen.mjs jobs.json outDir
//
// jobs.json: [{ id, secs, track: 'wired', synth: true, tension: 0, tensions, voices, radio } | { id, secs, sfx: 'shot', args, vibe }]
// (synth: the Web Audio track, just the voices named ('bed.drone', ...) if voices is
// given; without it, the track as the game plays it now, from its loops and choice.js;
// radio: the music out of the little radio (⚙ 收音机放音乐); vibe: that vibe's own
// version of the sound, VIBE_SFX; choice: over choice.js for the
// job, as { lantern: { bed: { kick: 'synth' } } }). Each job becomes outDir/<id>.wav, 48 kHz 32-bit float stereo.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const RATE = 48000;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.ogg': 'audio/ogg' };
const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

function wavFloat(l, r) {
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

async function main() {
  const [jobsFile, out] = process.argv.slice(2);
  if (!out) throw new Error('usage: listen.mjs jobs.json outDir');
  const jobs = await readFile(jobsFile, 'utf8');
  await mkdir(out, { recursive: true });
  const got = {};
  let finish;
  const done = new Promise((resolve, reject) => (finish = { resolve, reject }));
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const parts = path.split('/').filter(Boolean);
    if (req.method === 'POST') {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = Buffer.concat(chunks);
      if (parts[0] === 'out') (got[parts[1]] ??= [])[Number(parts[2])] = new Float32Array(body.buffer.slice(body.byteOffset, body.byteOffset + body.length));
      else if (parts[0] === 'done') finish.resolve();
      else if (parts[0] === 'error') finish.reject(new Error(`page: ${body}`));
      return res.writeHead(204).end();
    }
    if (path === '/jobs.json') return res.writeHead(200, { 'content-type': TYPES['.json'] }).end(jobs);
    const ok = parts[0] === 'web' || (parts[0] === 'scripts' && parts[1] === 'sound');
    if (!ok || parts.some((p) => p.includes('..'))) return res.writeHead(404).end();
    try {
      const data = await readFile(join(ROOT, ...parts));
      res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' }).end(data);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const exe = process.env.CHROME ?? CHROMES.find(existsSync);
  if (!exe) throw new Error('no Chrome found; set CHROME');
  const profile = await mkdtemp(join(tmpdir(), 'moyu-listen-'));
  const proc = spawn(exe, [
    '--headless=new',
    '--mute-audio', // every test browser: never a sound
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-timer-throttling',
    `http://127.0.0.1:${server.address().port}/scripts/sound/listen.html`,
  ], { stdio: 'ignore' });
  const timer = setTimeout(() => finish.reject(new Error('no sound after 10 min')), 600000);
  try {
    await done;
  } finally {
    clearTimeout(timer);
    proc.kill();
    await new Promise((r) => (proc.exitCode !== null ? r() : proc.once('exit', r)));
    await rm(profile, { recursive: true, force: true }).catch(() => {});
    server.close();
  }
  for (const [id, [l, r]] of Object.entries(got)) await writeFile(join(out, `${id}.wav`), wavFloat(l, r));
  console.log(`wrote ${Object.keys(got).length} renders to ${out}`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
