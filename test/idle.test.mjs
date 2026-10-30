// The server stops by itself when nobody uses it, and the listeners wait it out without
// hammering it. Own MOYU_HOME and ports, so a running server and ~/.moyu are never touched.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createWatcher } from '../dsh/watch.js';

const MAIN = fileURLToPath(new URL('../server/main.mjs', import.meta.url));
const CLI = fileURLToPath(new URL('../cli/moyu.mjs', import.meta.url));
const LISTEN = fileURLToPath(new URL('../cli/listen.mjs', import.meta.url));
const homes = [];
const children = new Set();

after(() => {
  for (const c of children) c.kill();
  for (const h of homes) rmSync(h, { recursive: true, force: true });
});

function place(idle = '1500') {
  const home = mkdtempSync(join(tmpdir(), 'moyu-idle-'));
  homes.push(home);
  const port = 20000 + Math.floor(Math.random() * 20000);
  const env = { ...process.env, MOYU_HOME: home, MOYU_PORT: String(port), MOYU_IDLE_MS: idle };
  delete env.CLAUDE_CODE_SESSION_ID;
  return { home, port, base: `http://127.0.0.1:${port}`, env };
}

// The server as a child of the test, so its exit and its log line can be seen.
async function serve({ env }) {
  const child = spawn(process.execPath, [MAIN], { env });
  children.add(child);
  let out = '';
  child.stdout.on('data', (d) => (out += d));
  const exited = new Promise((r) => child.on('exit', (code) => (children.delete(child), r(code))));
  for (let i = 0; i < 100 && !out.includes('moyu server on'); i++) await new Promise((r) => setTimeout(r, 50));
  assert.match(out, /moyu server on/);
  return { child, exited, log: () => out };
}

// Listener-style requests: they must not count as use.
const peek = (base) => fetch(`${base}/api/tables`, { headers: { 'x-moyu-listener': '1' } }).then((r) => r.json());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const within = (p, ms) => Promise.race([p, sleep(ms).then(() => 'still running')]);
const open = (url) => {
  const ws = new WebSocket(url);
  ws.closed = new Promise((r) => ws.addEventListener('close', (e) => r(e.code)));
  return new Promise((r) => ws.addEventListener('open', () => r(ws)));
};

test('the server stops after the idle window, says so in one line, and marks the listeners', async () => {
  const p = place();
  const s = await serve(p);
  assert.equal(await within(s.exited, 4000), 0);
  assert.match(s.log(), /moyu: nobody here for 1.5 s; stopping/);
  assert.ok(existsSync(join(p.home, 'listeners', 'server-up')));
  // 0 means never.
  const q = place('0');
  const t = await serve(q);
  // The worker that shows a reload "asleep" is served at the root, so it covers /t/ and /r/.
  const sw = await fetch(`${q.base}/sw.js`);
  assert.match(sw.headers.get('content-type'), /javascript/);
  assert.match(await sw.text(), /asleep/);
  assert.equal(await within(t.exited, 2500), 'still running');
  t.child.kill();
});

test('an open human page keeps it running; when the page goes, it stops and the game resumes after', async () => {
  const p = place();
  const s = await serve(p);
  const made = await (await fetch(`${p.base}/api/tables`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"game":"yacht"}' })).json();
  const k = new URL(made.humanUrl).searchParams.get('k');
  const page = await open(`ws://127.0.0.1:${p.port}/ws?table=${made.id}&k=${k}`);
  const seat = await open(made.agentWs);
  // Listener requests the whole time, and nobody else: the page alone keeps it up.
  for (let i = 0; i < 6; i++) {
    await sleep(500);
    await peek(p.base);
  }
  assert.equal(await within(s.exited, 10), 'still running');
  const told = new Promise((r) => seat.addEventListener('message', (e) => r(String(e.data))));
  await fetch(`${p.base}/api/tables/${made.id}/say`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ k, text: 'brb' }) });
  assert.match(await told, /Human says: brb/);
  page.close();
  // Closed as "server gone" (not 1000, game over), so the listener comes back later.
  assert.equal(await within(seat.closed, 4000), 1001);
  assert.equal(await within(s.exited, 1000), 0);

  // Back again: the table is there, and what the agent was told is not told again.
  const t = await serve(p);
  assert.equal((await peek(p.base)).find((x) => x.id === made.id)?.phase, 'playing');
  const again = await open(made.agentWs);
  let resent = null;
  again.addEventListener('message', (e) => (resent = String(e.data)));
  await sleep(800);
  assert.equal(resent, null);
  again.close();
  t.child.kill();
});

test('agent requests keep it running; listener requests do not', async () => {
  const p = place();
  const s = await serve(p);
  for (let i = 0; i < 6; i++) {
    await sleep(500);
    await fetch(`${p.base}/api/tables`); // a CLI command or DSH tool call
  }
  assert.equal(await within(s.exited, 10), 'still running');
  for (let i = 0; i < 2; i++) {
    await sleep(500);
    await peek(p.base);
  }
  assert.equal(await within(s.exited, 2500), 0);
});

// Stands in for a stopped server: every try is a refused connection, counted.
async function counter(port) {
  let tries = 0;
  const srv = createServer((sock) => (tries++, sock.destroy()));
  await new Promise((r) => srv.listen(port, '127.0.0.1', r));
  return { tries: () => tries, close: () => new Promise((r) => srv.close(r)) };
}

test('the Claude Code listener backs off while the server is gone, stays up, and hears what was missed', async () => {
  // Long enough for the listener to reconnect to the restarted server before it stops again.
  const p = place('4000');
  const env = { ...p.env, MOYU_DOWN_MS: '60000', CLAUDE_CODE_SESSION_ID: 'session-idle' };
  const listener = spawn(process.execPath, [LISTEN], { env, cwd: tmpdir() });
  children.add(listener);
  let heard = '';
  listener.stdout.on('data', (d) => (heard += d));
  const { stdout } = await promisify(execFile)(process.execPath, [CLI, 'new', '--game', 'yacht'], { env, cwd: tmpdir() });
  const human = new URL(stdout.match(/Human's link: (\S+)/)[1]);
  const id = human.pathname.split('/').pop();
  const k = human.searchParams.get('k');

  // Nobody uses it: it stops, though the listener still follows the seat.
  let down = false;
  for (let i = 0; i < 80 && !down; i++) {
    await sleep(100);
    down = await peek(p.base).then(() => false, () => true);
  }
  assert.ok(down, 'the server stopped');
  await sleep(3000); // the listener finds it gone
  const c = await counter(p.port);
  await sleep(5000);
  assert.ok(c.tries() === 0, `no tries during the backoff, got ${c.tries()}`);
  await c.close();
  assert.equal(listener.exitCode, null);

  // An agent command starts it again; the listener comes back at once and gets the chat.
  await promisify(execFile)(process.execPath, [CLI, 'view', '--table', id], { env, cwd: tmpdir() });
  await fetch(`${p.base}/api/tables/${id}/say`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ k, text: 'back' }) });
  for (let i = 0; i < 60 && !heard.includes('Human says: back'); i++) await sleep(100);
  assert.match(heard, new RegExp(`\\[moyu ${id}\\] Human says: back`));
  listener.kill();
  await fetch(`${p.base}/api/health`).then(async (r) => process.kill((await r.json()).pid)).catch(() => {});
});

test('the DSH watcher backs off while the server is gone and tries again once it has started', async () => {
  const p = place();
  const dirs = { tables: join(p.home, 'tables'), rooms: join(p.home, 'rooms'), listeners: join(p.home, 'listeners') };
  mkdirSync(dirs.tables, { recursive: true });
  mkdirSync(dirs.listeners, { recursive: true });
  writeFileSync(join(dirs.tables, 'aa11.json'), JSON.stringify({ id: 'aa11', session: 'dsh:s1', ws: `ws://127.0.0.1:${p.port}/ws?table=aa11&k=x` }));
  const c = await counter(p.port);
  class Never {
    constructor() {
      throw new Error('no connect while the server is gone');
    }
  }
  const watcher = createWatcher({ dirs, base: p.base, follow: () => 'live', wake: async () => true, WebSocketImpl: Never, downMs: 60000 });
  await watcher.tick();
  assert.equal(c.tries(), 1);
  await watcher.tick();
  await watcher.tick();
  assert.equal(c.tries(), 1, 'one try per backoff');
  writeFileSync(join(dirs.listeners, 'server-up'), String(Date.now() + 1));
  await watcher.tick();
  assert.equal(c.tries(), 2, 'a server start ends the wait');
  await watcher.stop();
  await c.close();
  assert.equal(readFileSync(join(dirs.tables, 'aa11.json'), 'utf8').includes('dsh:s1'), true);
});
