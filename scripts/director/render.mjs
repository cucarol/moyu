#!/usr/bin/env node
// Renders frame by frame: muted headless Chrome over CDP, the page's clock stopped
// (clock.js, in every frame, same-origin iframes included) and moved on one frame at a time,
// each frame a PNG, the page's sound captured in step, then joined with ffmpeg. No moyu
// server: it serves web/ itself (and the folder of a local script or page).
//
//   node scripts/director/render.mjs <script> [options]            a director script
//   node scripts/director/render.mjs --page <file.html> [options]  any local HTML page
//
// <script> is a name in web/play/director/scripts/ or a path to a script file anywhere.
// Options:
//   --size 1920x1080   --fps 30   --scale 1 (2 or 3: the page laid out that many times
//                      smaller, so its type comes out bigger, like a phone's)
//   --lang zh-CN|en|…  the page's language (a script's own lang otherwise)
//   --from ms          start this far in (the frames before still play, unseen)
//   --duration ms      stop after this long (a page needs one: default 5000)
//   --live             roulette's live (stream) layout
//   --frames N --every K   stop after N frames; keep every Kth (stills for a sheet)
//   --out dir          default renders/<name>-<w>x<h>[-lang]/ (not committed)
//   --gl vulkan|angle  --no-mp4  --no-sound  --max-secs 300 (the longest sound it holds)
// Out: frames/, sound.wav (the page's sound under exactly those frames), <name>.mp4 (both
// muxed), timeline.json (each beat's frame).
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, rm, mkdtemp } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, extname, dirname, basename, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const WEB = join(ROOT, 'web');

function args(argv) {
  const o = { size: '1920x1080', scale: 1, fps: 30, gl: 'vulkan', every: 1, frames: Infinity, mp4: true, live: false, sound: true, from: 0, duration: null, 'max-secs': 300 };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--live') o.live = true;
    else if (a === '--no-mp4') o.mp4 = false;
    else if (a === '--no-sound') o.sound = false;
    else if (a.startsWith('--')) o[a.slice(2)] = argv[++i];
    else rest.push(a);
  }
  o.script = rest[0];
  if (!o.script && !o.page) throw new Error('usage: render.mjs <script> | --page <file.html>  [--size WxH] [--fps 30] [--lang en] [--from ms] [--duration ms] [--out dir]');
  for (const k of ['fps', 'every', 'frames', 'scale', 'from', 'max-secs']) o[k] = Number(o[k]);
  if (o.duration !== null) o.duration = Number(o.duration);
  if (o.page) o.duration ??= 5000;
  [o.w, o.h] = o.size.split('x').map(Number);
  // a script or page on disk is served from its own folder, at /local/
  // a page may carry a query (--page pv/cubicle/cubicle.html?shot=dusk) for its address
  let query = '';
  if (o.page?.includes('?')) [o.page, query] = [o.page.slice(0, o.page.indexOf('?')), o.page.slice(o.page.indexOf('?') + 1)];
  const file = o.page ?? (/[\\/]|\.js$/.test(o.script) ? o.script : null);
  if (file) {
    const abs = resolve(file);
    if (!existsSync(abs) || !statSync(abs).isFile()) throw new Error(`no such file: ${abs}`);
    o.local = dirname(abs);
    o.url = `/local/${basename(abs)}`;
    o.query = query;
  }
  o.name = basename(o.page ?? o.script).replace(/\.(js|html?)$/, '').replace(/[^\w-]/g, '_');
  o.out ??= join(ROOT, 'renders', `${o.name}-${o.w}x${o.h}${o.lang ? `-${o.lang}` : ''}${o.live ? '-live' : ''}`);
  return o;
}

// A script's own lang, read without a browser (a script is a plain module).
async function scriptLang(o) {
  if (o.page) return null;
  const path = o.local ? join(o.local, basename(o.url)) : join(WEB, 'play', 'director', 'scripts', `${o.script}.js`);
  try {
    return (await import(`${pathToFileURL(path)}?t=${Date.now()}`)).default?.lang ?? null;
  } catch {
    return null;
  }
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.mp4': 'video/mp4', '.webm': 'video/webm' };
function serve(local) {
  const roots = { web: WEB, ...(local && { local }) };
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const parts = path.split('/').filter(Boolean);
    const root = roots[parts[0]];
    if (!root || parts.some((p) => p === '..' || p.includes('\\'))) return res.writeHead(404).end();
    try {
      const data = await readFile(join(root, ...parts.slice(1)));
      res.writeHead(200, { 'content-type': TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream' });
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

async function launch(o) {
  const exe = process.env.CHROME ?? CHROMES.find(existsSync);
  if (!exe) throw new Error('no Chrome found; set CHROME');
  const profile = await mkdtemp(join(tmpdir(), 'moyu-director-'));
  const gl = o.gl === 'angle' ? ['--use-angle=d3d11'] : ['--use-angle=vulkan', '--enable-features=Vulkan'];
  const proc = spawn(exe, [
    '--headless=new',
    '--mute-audio', // every test browser: never a sound
    `--user-data-dir=${profile}`,
    '--remote-debugging-port=0',
    `--window-size=${Math.round(o.w / o.scale)},${Math.round(o.h / o.scale)}`,
    '--force-device-scale-factor=1',
    '--hide-scrollbars',
    '--ignore-gpu-blocklist',
    '--enable-gpu',
    ...gl,
    '--autoplay-policy=no-user-gesture-required',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  const port = await new Promise((resolve, reject) => {
    let buf = '';
    proc.stderr.on('data', (d) => {
      buf += d;
      const m = /DevTools listening on ws:\/\/[^:]+:(\d+)\//.exec(buf);
      if (m) resolve(Number(m[1]));
    });
    proc.on('exit', (c) => reject(new Error(`chrome exited (${c}) before it listened:\n${buf.slice(-800)}`)));
  });
  const close = async () => {
    proc.kill();
    await new Promise((r) => (proc.exitCode !== null ? r() : proc.once('exit', r)));
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  };
  return { port, close };
}

// A small CDP client over one page's socket.
async function page(port) {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target = list.find((t) => t.type === 'page');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j)));
  let id = 0;
  const pending = new Map();
  const listeners = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method) for (const fn of listeners.get(msg.method) ?? []) fn(msg.params);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, { resolve, reject });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  const on = (method, fn) => listeners.set(method, [...(listeners.get(method) ?? []), fn]);
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  return { send, on, evaluate, close: () => ws.close() };
}

// The mp4 is encoded on the GPU (NVENC) when there is one: the CPU is busy enough taking the
// frames; MOYU_X264=1 encodes in software instead.
const VIDEO = process.env.MOYU_X264
  ? ['-c:v', 'libx264', '-preset', 'slow', '-crf', '14']
  : ['-c:v', 'h264_nvenc', '-preset', 'p7', '-tune', 'hq', '-rc', 'vbr', '-cq', '16', '-b:v', '0'];
function ffmpeg(argv) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', argv, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('exit', (c) => (c ? reject(new Error(err.slice(-1500))) : resolve()));
  });
}

async function main() {
  const o = args(process.argv.slice(2));
  o.lang ??= await scriptLang(o);
  await rm(o.out, { recursive: true, force: true });
  await mkdir(join(o.out, 'frames'), { recursive: true });
  const server = await serve(o.local);
  const chrome = await launch(o);
  const t0 = Date.now();
  try {
    const p = await page(chrome.port);
    p.on('Runtime.consoleAPICalled', (e) => e.type === 'error' && console.error('[page]', e.args.map((a) => a.value ?? a.description).join(' ')));
    p.on('Runtime.exceptionThrown', (e) => console.error('[page]', e.exceptionDetails.exception?.description ?? e.exceptionDetails.text));
    await p.send('Runtime.enable');
    await p.send('Page.enable');
    await p.send('Emulation.setDeviceMetricsOverride', { width: Math.round(o.w / o.scale), height: Math.round(o.h / o.scale), deviceScaleFactor: o.scale, mobile: false });
    // the clock, in the page and in every frame it opens; the sound with it
    const clock = await readFile(join(dirname(fileURLToPath(import.meta.url)), 'clock.js'), 'utf8');
    const pre = o.sound ? `window.__vtSound = ${JSON.stringify({ maxSecs: o['max-secs'] })};\n` : '';
    await p.send('Page.addScriptToEvaluateOnNewDocument', { source: pre + clock });
    const base = `http://127.0.0.1:${server.address().port}`;
    const lang = o.lang ? { lang: o.lang } : {};
    const url = o.page
      ? `${base}${o.url}?${new URLSearchParams([...new URLSearchParams(o.query ?? ''), ...Object.entries(lang)])}`
      : `${base}/web/play.html?${new URLSearchParams({ director: o.url ?? o.script, render: '1', ...(o.live && { live: '1' }), ...lang })}`;
    await p.send('Page.navigate', { url });

    const frame = 1000 / o.fps;
    // Load: the page's own I/O (fonts, three.js, the script) runs in real time while the
    // clock stands at 0 (timers due now still fire), until the page is ready. No frames are
    // drawn meanwhile, so a slow load changes nothing. A director page is ready when it
    // waits for start(); a plain page once it has loaded with its fonts, or, if it sets
    // window.__vtReady = false, once it sets it true.
    const ready = o.page
      ? `document.readyState === 'complete' && window.__vtReady !== false && document.fonts.status === 'loaded' ? { waiting: true } : null`
      : `window.__director ? { waiting: __director.waiting, done: __director.done, error: __director.error } : null`;
    const state = () => p.evaluate(ready).catch(() => null);
    for (let i = 0; ; i++) {
      const s = await state();
      if (s?.error) throw new Error(`director: ${s.error}`);
      if (s?.waiting) break;
      if (Date.now() - t0 > 90000) throw new Error('the page never got ready (90 s)');
      await p.evaluate('window.__vt?.step(0, false)').catch(() => {});
      await new Promise((r) => setTimeout(r, i < 20 ? 50 : 10));
    }
    if (!o.page) {
      // a second of settling: the camera finds its seat, the room its idle
      for (let i = 0; i < o.fps; i++) await p.evaluate(`__vt.step(${frame})`);
      await p.evaluate('__director.start()');
    }
    const start = o.page ? 0 : await p.evaluate('__director.t0');
    console.log(`ready in ${((Date.now() - t0) / 1000).toFixed(1)} s; rendering ${o.name} at ${o.w}x${o.h}, ${o.fps} fps${o.lang ? `, ${o.lang}` : ''}`);

    const done = o.page ? null : 'window.__director.done';
    const err = async () => !o.page && (await p.evaluate('__director.error'));
    // --from: the frames before it play out unseen
    let skipped = 0;
    for (; skipped * frame < o.from - 1e-6; skipped++) {
      await p.evaluate(`__vt.step(${frame})`);
      if (done && (await p.evaluate(done))) break;
    }
    if (await err()) throw new Error(`director: ${await err()}`);
    const first = start + (skipped + 1) * frame; // the clock the first frame shows
    const limit = Math.min(o.frames, o.duration !== null ? Math.round(o.duration / frame) : Infinity);
    let n = 0;
    let kept = 0;
    const r0 = Date.now();
    const spent = { step: 0, shot: 0 }; // where the time goes
    let writes = Promise.resolve();
    for (; n < limit; n++) {
      let c = Date.now();
      await p.evaluate(`__vt.step(${frame})`);
      spent.step += Date.now() - c;
      if (n % o.every === 0) {
        c = Date.now();
        const shot = await p.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true, fromSurface: true, captureBeyondViewport: false });
        spent.shot += Date.now() - c;
        const file = join(o.out, 'frames', `${String(kept).padStart(5, '0')}.png`);
        writes = writes.then(() => writeFile(file, Buffer.from(shot.data, 'base64')));
        kept++;
      }
      const e = await err();
      if (e) throw new Error(`director: ${e}`);
      if (done && (await p.evaluate(done))) {
        n++;
        break;
      }
      if (n % (o.fps * 5) === 0 && n) console.log(`  ${n} frames, ${(n / ((Date.now() - r0) / 1000)).toFixed(1)} fps (per frame: step ${Math.round(spent.step / n)} ms, shot ${Math.round(spent.shot / Math.ceil(n / o.every))} ms)`);
    }
    await writes;
    // the sound under exactly these frames: frame k shows the clock at first + k frames, and
    // its sound starts there
    let wav = null;
    if (o.sound && (await p.evaluate('!!window.__vt?.sound'))) {
      const pieces = await p.evaluate(`__vt.sound.wav(${first}, ${first + n * frame})`);
      wav = join(o.out, 'sound.wav');
      await writeFile(wav, Buffer.concat(pieces.map((x) => Buffer.from(x, 'base64'))));
    }
    const marks = o.page ? [] : await p.evaluate('__director.marks');
    const at = (t) => Math.round((start + t - first) / frame + 1);
    await writeFile(join(o.out, 'timeline.json'), JSON.stringify({ name: o.name, lang: o.lang ?? null, fps: o.fps, size: [o.w, o.h], from: o.from, frames: n, beats: marks.map((m) => ({ ...m, frame: at(m.t) })).filter((m) => m.frame >= 0) }, null, 1));
    console.log(`${n} frames (${kept} kept) in ${((Date.now() - r0) / 1000).toFixed(1)} s`);
    p.close();
    if (o.mp4 && o.every === 1 && n) {
      const mp4 = join(o.out, `${o.name}.mp4`);
      const audio = wav ? ['-i', wav, '-c:a', 'aac', '-b:a', '256k', '-shortest'] : [];
      await ffmpeg(['-y', '-framerate', String(o.fps), '-i', join(o.out, 'frames', '%05d.png'), ...audio, ...VIDEO, '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4]);
      console.log(mp4);
    }
    if (wav) console.log(wav);
  } finally {
    await chrome.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
