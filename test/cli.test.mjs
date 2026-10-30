// Drives the real CLI and server: own MOYU_HOME and port, so a running server and
// the user's ~/.moyu are never touched.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const CLI = fileURLToPath(new URL('../cli/moyu.mjs', import.meta.url));
const LISTEN = fileURLToPath(new URL('../cli/listen.mjs', import.meta.url));
const HOME = mkdtempSync(join(tmpdir(), 'moyu-home-'));
const PORT = 20000 + Math.floor(Math.random() * 20000);
const BASE = `http://127.0.0.1:${PORT}`;
// No Claude Code session unless a test gives one, even when the suite runs inside one.
// Short post-game windows (Table.LINGER_MS, GRACE_MS) for the server and the listener.
const env = { ...process.env, MOYU_HOME: HOME, MOYU_PORT: String(PORT), MOYU_LINGER_MS: '3000', MOYU_GRACE_MS: '1000' };
delete env.CLAUDE_CODE_SESSION_ID;

async function moyu(...args) {
  return moyuIn(env, ...args);
}

async function moyuIn(env, ...args) {
  const { stdout } = await promisify(execFile)(process.execPath, [CLI, ...args], { env, cwd: tmpdir() });
  return stdout.trim();
}

async function stopServer() {
  try {
    const { pid } = await (await fetch(`${BASE}/api/health`)).json();
    process.kill(pid);
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setTimeout(r, 100));
      await fetch(`${BASE}/api/health`);
    }
  } catch {}
}

after(async () => {
  await stopServer();
  rmSync(HOME, { recursive: true, force: true });
});

const humanOf = (out) => {
  const url = new URL(out.match(/Human's link: (\S+)/)[1]);
  return { id: url.pathname.split('/').pop(), k: url.searchParams.get('k') };
};
const post = (path, body) => fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());

test('--table routes between two open tables, and both survive a server restart', async () => {
  const outA = await moyu('new', '--game', 'yacht', '--name', 'A');
  const outB = await moyu('new', '--game', 'blackjack', '--name', 'B');
  const a = humanOf(outA);
  const b = humanOf(outB);
  assert.notEqual(a.id, b.id);
  assert.match(outA, /^Yacht table/);
  assert.equal(readFileSync(join(HOME, 'last'), 'utf8'), b.id);

  // No --table means the last table made; --table picks the other one.
  assert.ok((await moyu('view')).startsWith(`[moyu ${b.id}]`));
  assert.ok((await moyu('view', '--table', a.id)).startsWith(`[moyu ${a.id}]`));
  assert.match(await moyu('ws', '--table', a.id), new RegExp(`^ws://127\\.0\\.0\\.1:${PORT}/ws\\?table=${a.id}&k=[0-9a-f]+$`));

  // Play on A only: if the human rolls first it scores, then the agent keeps and scores.
  if (!(await moyu('view', '--table', a.id)).includes('Your move')) {
    assert.ok((await post(`/api/tables/${a.id}/act`, { k: a.k, action: 'score', category: 'choice' })).ok);
  }
  const kept = await moyu('keep', '1', '3', '--table', a.id, '--say', 'go');
  assert.ok(kept.startsWith(`[moyu ${a.id}]`));
  assert.match(kept, /You keep \d \d and reroll/);
  assert.match(await moyu('score', 'yacht', '--table', a.id), /You score \d+ in yacht/);

  const list = await moyu('list');
  assert.match(list, new RegExp(`^${a.id}  yacht  turn \\d+/12  playing  Human vs A$`, 'm'));
  assert.match(list, new RegExp(`^${b.id}  blackjack  hand 1/8  playing  Human vs B  \\(last\\)$`, 'm'));

  // The seed and tokens on disk never come back over HTTP.
  const saved = JSON.parse(readFileSync(join(HOME, 'server', 'tables', `${a.id}.json`), 'utf8'));
  const humanView = await (await fetch(`${BASE}/api/tables/${a.id}/view?k=${a.k}`)).text();
  const listing = await (await fetch(`${BASE}/api/tables`)).text();
  for (const text of [humanView, listing]) assert.ok(!text.includes(saved.game.seed) && !text.includes(saved.seats[1].token));
  assert.equal((await fetch(`${BASE}/api/tables/${a.id}/reveal`)).status, 403);

  // Kill the server; the next command starts it again and both tables carry on unchanged.
  const before = [await moyu('view', '--table', a.id), await moyu('view', '--table', b.id)];
  const humanBefore = await (await fetch(`${BASE}/api/tables/${a.id}/view?k=${a.k}`)).json();
  await stopServer();
  assert.deepEqual([await moyu('view', '--table', a.id), await moyu('view', '--table', b.id)], before);
  assert.deepEqual(await (await fetch(`${BASE}/api/tables/${a.id}/view?k=${a.k}`)).json(), humanBefore);

  // Finish A by quitting and verify it from the CLI.
  assert.match(await moyu('quit', '--table', a.id), new RegExp(`Verify: moyu verify --table ${a.id}`));
  assert.match(await moyu('verify', '--table', a.id), /matches the commit[\s\S]*follow from the seed/);
  assert.ok(!(await moyu('list')).includes(a.id));
});

test('a room: the human starts games from the page, the agent plays them with no moyu new', async () => {
  const out = await moyu('room', '--human', 'C');
  const link = new URL(out.match(/Human's link: (\S+)/)[1]);
  const room = { id: link.pathname.split('/').pop(), k: link.searchParams.get('k') };
  assert.match(out, new RegExp(`^Room ${room.id} open\\.`));
  assert.match(out, new RegExp(`Listen on: ws://127\\.0\\.0\\.1:${PORT}/ws\\?room=${room.id}&k=[0-9a-f]+`));
  assert.match(out, /No game on/);
  assert.equal((await fetch(link)).status, 200);
  // Run again: the same room, not a new one.
  assert.match(await moyu('room'), new RegExp(`^Room ${room.id} open\\.`));

  // Idle chat, both ways.
  assert.ok((await post(`/api/rooms/${room.id}/say`, { k: room.k, text: 'hey' })).ok);
  // Not listening, so its reply comes back with the line it missed.
  assert.match(await moyu('say', 'hi C', '--room', room.id), /C says: hey/);

  // The human picks Yacht on the page; the agent's commands find the table by id.
  const started = await post(`/api/rooms/${room.id}/start`, { k: room.k, game: 'yacht' });
  assert.ok(started.ok);
  assert.match(await moyu('view', '--room', room.id), new RegExp(`Game on: Yacht table ${started.table}`));
  assert.ok((await moyu('view', '--table', started.table)).startsWith(`[moyu ${started.table}]`));
  assert.equal(readFileSync(join(HOME, 'last'), 'utf8'), started.table);
  const tableK = `/api/tables/${started.table}/view?k=${room.k}`;
  assert.equal((await (await fetch(BASE + tableK)).json()).view.you, 'human'); // the room link sits at the table

  // Mid-game room chat lands at the table; then the human quits and the room is free.
  assert.ok((await post(`/api/rooms/${room.id}/say`, { k: room.k, text: 'gl' })).ok);
  const state = await (await fetch(`${BASE}/api/rooms/${room.id}/view?k=${room.k}`)).json();
  assert.deepEqual(state.chat.map((c) => c.text), ['hey', 'hi C', 'gl']);
  assert.ok((await post(`/api/tables/${started.table}/act`, { k: room.k, action: 'quit' })).ok);
  assert.match(await moyu('verify', '--table', started.table), /matches the commit[\s\S]*follow from the seed/);

  // The agent can open the next one itself, and the room comes back after a restart.
  assert.match(await moyu('start', 'blackjack', '--room', room.id), /A Blackjack table is open/);
  await stopServer();
  assert.match(await moyu('view', '--room', room.id), /Game on: Blackjack table/);
});

test("the plugin's listener follows this session's tables and room, and nobody else's", async () => {
  const mine = { ...env, CLAUDE_CODE_SESSION_ID: 'session-a' };
  const theirs = { ...env, CLAUDE_CODE_SESSION_ID: 'session-b' };
  const listener = spawn(process.execPath, [LISTEN], { env: mine, cwd: tmpdir() });
  let heard = '';
  listener.stdout.on('data', (d) => (heard += d));
  const until = async (re) => {
    for (let i = 0; i < 100 && !re.test(heard); i++) await new Promise((r) => setTimeout(r, 100));
    assert.match(heard, re);
  };
  try {
    // Once its heartbeat is down, the CLI says so instead of handing over a URL.
    for (let i = 0; i < 100 && !existsSync(join(HOME, 'listeners', 'session-a.json')); i++) await new Promise((r) => setTimeout(r, 50));
    const out = await moyuIn(mine, 'new', '--game', 'yacht', '--name', 'A');
    assert.match(out, /^Listening: the moyu plugin follows this/m);
    assert.doesNotMatch(out, /Listen for your turns on/);
    const other = await moyuIn(theirs, 'new', '--game', 'yacht', '--name', 'B');
    assert.match(other, /Listen for your turns on/); // session-b has no listener running

    // The human's chat at my table reaches the listener; at session-b's table it doesn't.
    const a = humanOf(out);
    const b = humanOf(other);
    assert.ok((await post(`/api/tables/${b.id}/say`, { k: b.k, text: 'not for A' })).ok);
    assert.ok((await post(`/api/tables/${a.id}/say`, { k: a.k, text: 'hello A' })).ok);
    await until(new RegExp(`\\[moyu ${a.id}\\][\\s\\S]*hello A`));
    assert.ok(!heard.includes('not for A'));

    // Acting on session-b's table from this session moves it here.
    await moyuIn(mine, 'say', 'mine now', '--table', b.id);
    assert.ok((await post(`/api/tables/${b.id}/say`, { k: b.k, text: 'for A now' })).ok);
    await until(/for A now/);

    // A room: the game the human starts there arrives once, through the room.
    const room = await moyuIn(mine, 'room', '--new', '--human', 'C');
    assert.match(room, /^Listening:/m);
    const r = humanOf(room);
    const started = await post(`/api/rooms/${r.id}/start`, { k: r.k, game: 'blackjack' });
    await until(new RegExp(`\\[moyu room ${r.id}\\] A Blackjack table is open: ${started.table}`));
    await new Promise((res) => setTimeout(res, 2500));
    assert.equal(heard.split('A Blackjack table is open').length, 2);
  } finally {
    listener.kill();
  }
});

test('a listener that connects after moyu new or moyu room is owed nothing yet: the command showed the opening', async () => {
  // Collect what a seat's socket sends over a while.
  const listen = async (url, ms, during = async () => {}) => {
    const frames = [];
    const ws = new WebSocket(url);
    ws.addEventListener('message', (e) => frames.push(String(e.data)));
    await new Promise((r) => ws.addEventListener('open', r));
    await during();
    await new Promise((r) => setTimeout(r, ms));
    ws.close();
    return frames;
  };
  for (const game of ['roulette', 'blackjack', 'yacht']) {
    const out = await moyu('new', '--game', game);
    const t = humanOf(out);
    const url = await moyu('ws', '--table', t.id);
    // Whoever opens, the board and any prompt were in the output.
    assert.match(out, /Your (turn|move)|Not your turn/);
    assert.deepEqual(await listen(url, 400), [], game);
    // The next change is told as usual, and only that.
    const frames = await listen(url, 400, () => post(`/api/tables/${t.id}/say`, { k: t.k, text: `hi ${game}` }));
    assert.equal(frames.length, 1);
    // (When it is the agent's move, the frame repeats the board and the prompt.)
    assert.ok(frames[0].startsWith(`[moyu ${t.id}] Human says: hi ${game}`), frames[0]);
  }
  const room = await moyu('room', '--new');
  assert.deepEqual(await listen(await moyu('ws', '--room', humanOf(room).id), 400), []);
});

test('after game over the table stays open a while for talk, then lets the agent go', async () => {
  const listener = spawn(process.execPath, [LISTEN], { env: { ...env, CLAUDE_CODE_SESSION_ID: 'session-post' }, cwd: tmpdir() });
  let heard = '';
  listener.stdout.on('data', (d) => (heard += d));
  const waitFor = async (what, ok) => {
    for (let i = 0; i < 100 && !ok(); i++) await new Promise((r) => setTimeout(r, 100));
    assert.ok(ok(), typeof what === 'function' ? what() : what);
  };
  try {
    await waitFor('the heartbeat', () => existsSync(join(HOME, 'listeners', 'session-post.json')));
    const t = humanOf(await moyuIn({ ...env, CLAUDE_CODE_SESSION_ID: 'session-post' }, 'new', '--game', 'yacht'));
    const page = new WebSocket(`ws://127.0.0.1:${PORT}/ws?table=${t.id}&k=${t.k}`);
    await new Promise((r) => page.addEventListener('open', r));
    assert.match(await moyu('quit', '--table', t.id), /Game over/);
    // The human talks after the game: the listener still hears it and wakes the session.
    assert.ok((await post(`/api/tables/${t.id}/say`, { k: t.k, text: 'mean!' })).ok);
    await waitFor(() => `the post-game chat, heard: ${heard}`, () => heard.includes(`[moyu ${t.id}] Human says: mean!`));
    assert.match(heard, /Game over; reply with: moyu say "<text>" --table/);
    assert.equal(await moyu('say', 'luck, honest', '--table', t.id), `[moyu ${t.id}] Said. The game is over.`);
    // A seat socket of our own, to see when the server lets the agent go. (It would take
    // frames from the listener, so only now that nothing more is said.)
    const seat = new WebSocket(await moyu('ws', '--table', t.id));
    let closed = null;
    seat.addEventListener('close', (e) => (closed = e.code));
    await new Promise((r) => seat.addEventListener('open', r));
    // Quiet for LINGER_MS: closed with 1000, so listeners stop.
    await waitFor('the idle close', () => closed === 1000);
    page.close();

    // The human's page closing lets the agent go after GRACE_MS, quiet or not.
    const t2 = humanOf(await moyu('new', '--game', 'yacht'));
    const page2 = new WebSocket(`ws://127.0.0.1:${PORT}/ws?table=${t2.id}&k=${t2.k}`);
    await new Promise((r) => page2.addEventListener('open', r));
    const seat2 = new WebSocket(await moyu('ws', '--table', t2.id));
    let closed2 = null;
    seat2.addEventListener('close', (e) => (closed2 = e.code));
    await new Promise((r) => seat2.addEventListener('open', r));
    await moyu('quit', '--table', t2.id);
    await new Promise((r) => setTimeout(r, 1500));
    assert.equal(closed2, null); // page still open: stays
    const left = Date.now();
    page2.close();
    await waitFor('the close after the page left', () => closed2 === 1000);
    assert.ok(Date.now() - left < 2500);
  } finally {
    listener.kill();
  }
});

test('a short roulette game opens from moyu new, moyu start and the API, and verifies; bad rules are refused', async () => {
  const out = await moyu('new', '--rules', 'short', '--name', 'S');
  assert.match(out, /^Roulette \(short: one round\) table/);
  assert.match(out, /Load 1 · Human 4\/4 \S+ · You 4\/4/);
  assert.doesNotMatch(out, /Round/);
  const t = humanOf(out);
  assert.equal((await (await fetch(`${BASE}/api/tables/${t.id}/view?k=${t.k}`)).json()).view.rules, 'short');
  await moyu('quit', '--table', t.id);
  const verified = await moyu('verify', '--table', t.id);
  assert.match(verified, /sha256\(seed\) matches/);
  assert.match(verified, /follow from the seed/);

  // The API: a bad value is refused with the choices; other games ignore it.
  const bad = await post('/api/tables', { game: 'roulette', rules: 'long' });
  assert.equal(bad.error, 'unknown rules for roulette: long; one of bo3, short');
  assert.ok((await post('/api/tables', { game: 'yacht', rules: 'long' })).id);
  assert.equal((await post('/api/tables', { game: 'roulette' })).rules, 'bo3');

  // In a room.
  await moyu('room', '--scene', 'machine', '--new');
  await assert.rejects(moyu('start', 'roulette', '--rules', 'long'), /unknown rules for roulette: long/);
  const started = await moyu('start', 'roulette', '--rules', 'short');
  assert.doesNotMatch(started, /Round/);
  assert.match(started, /4\/4/);
  assert.doesNotMatch(await moyu('view'), /Round/);
});

// Last: the rename it makes is remembered for every table after it.
test('the agent sits as Clawd until the human renames it; the new name opens later tables and rooms', async () => {
  const agentOf = async (id) => (await (await fetch(`${BASE}/api/tables`)).json()).find((t) => t.id === id).seats.find((s) => s.kind === 'agent').name;
  const first = humanOf(await moyu('new', '--game', 'yacht'));
  assert.equal(await agentOf(first.id), 'Clawd');
  assert.ok((await post(`/api/tables/${first.id}/rename`, { k: first.k, who: 'agent', name: ' 小鱼 ' })).ok);
  assert.equal(JSON.parse(readFileSync(join(HOME, 'prefs.json'), 'utf8')).agentName, '小鱼');
  assert.equal(await agentOf((await post('/api/tables', { game: 'yacht' })).id), '小鱼');
  // an opener that names the agent still wins, and does not change what is remembered
  assert.equal(await agentOf(humanOf(await moyu('new', '--game', 'yacht', '--name', 'S')).id), 'S');
  assert.equal(await agentOf((await post('/api/tables', { game: 'yacht' })).id), '小鱼');
});
