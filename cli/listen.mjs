#!/usr/bin/env node
// The moyu plugin's monitor: one process per Claude Code session that follows the
// tables and rooms this session opened and prints each frame they send, which wakes
// the agent. It replaces the Monitor the skill would otherwise arm and re-arm.
// Node 22+ has WebSocket built in.
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { HOME, writeAtomic } from '../server/store.mjs';
import { Table } from '../server/table.mjs';

const SESSION = process.env.CLAUDE_CODE_SESSION_ID;
if (!SESSION) process.exit(0);

const BASE = `http://127.0.0.1:${process.env.MOYU_PORT ?? 7330}`;
const LISTENERS = join(HOME, 'listeners');
const BEAT = join(LISTENERS, `${SESSION}.json`);
const UP = join(LISTENERS, 'server-up'); // when the server last started
// The server stops when nobody uses it. Then try once this often, and stay alive: the
// plugin starts this monitor only once, and the server resends what we missed.
const DOWN_MS = Number(process.env.MOYU_DOWN_MS ?? 30000);
// Following a seat is not using the server, so it may still stop.
const HEADERS = { 'x-moyu-listener': '1' };

const live = new Map(); // ws URL -> socket
const done = new Set(); // ws URLs whose game is over or whose seat is gone
const retryAt = new Map(); // ws URL -> earliest time to try again
let downUntil = 0; // the server was gone: no tries before this

async function files(dir) {
  const out = [];
  for (const name of await readdir(join(HOME, dir)).catch(() => [])) {
    if (!name.endsWith('.json')) continue;
    try {
      out.push(JSON.parse(await readFile(join(HOME, dir, name), 'utf8')));
    } catch {}
  }
  return out;
}

// What this session should be hearing right now: its rooms, and its own tables that
// are still being played or just finished (the human may talk about the game a while;
// the server closes the seat when that is over). A room's tables come through the room.
async function wanted() {
  const rooms = (await files('rooms')).filter((r) => r.session === SESSION);
  let tables = (await files('tables')).filter((t) => t.session === SESSION && !t.room);
  if (!rooms.length && !tables.length) return new Set();
  const over = await fetch(`${BASE}/api/tables`, { headers: HEADERS })
    .then((r) => r.json())
    .then((list) => new Set(list.filter((t) => t.phase === 'over' && Date.now() - t.updatedAt > Table.LINGER_MS).map((t) => t.id)))
    .catch(() => null);
  if (!over) return null; // server down
  tables = tables.filter((t) => !over.has(t.id));
  return new Set([...rooms, ...tables].map((x) => x.ws));
}

async function startedSince(t) {
  return Number(await readFile(UP, 'utf8').catch(() => 0)) > t;
}

function connect(url) {
  const ws = new WebSocket(url);
  live.set(url, ws);
  // One write per frame, so a multi-line frame arrives as one notification.
  ws.addEventListener('message', (e) => process.stdout.write(String(e.data).trimEnd() + '\n'));
  ws.addEventListener('error', () => {});
  ws.addEventListener('close', ({ code }) => {
    if (live.get(url) === ws) live.delete(url);
    if (code === 1000 || code === 4003) done.add(url);
    else retryAt.set(url, Date.now() + 5000);
  });
}

async function tick() {
  writeAtomic(BEAT, JSON.stringify({ session: SESSION, pid: process.pid }));
  if (Date.now() < downUntil && !(await startedSince(downUntil - DOWN_MS))) return;
  const want = await wanted();
  if (!want) {
    // Gone (stopped when idle, say): keep the sockets we have and look again later.
    downUntil = Date.now() + DOWN_MS;
    return;
  }
  for (const [url, ws] of live) {
    if (!want.has(url)) {
      live.delete(url);
      ws.close();
    }
  }
  for (const url of want) {
    if (live.has(url) || done.has(url) || (retryAt.get(url) ?? 0) > Date.now()) continue;
    connect(url);
  }
}

await mkdir(LISTENERS, { recursive: true });
for (;;) {
  await tick().catch(() => {});
  await new Promise((r) => setTimeout(r, 2000));
}
