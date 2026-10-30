// moyu server: rooms and tables in memory and on disk, a JSON API, one WebSocket per
// seat, and the pages.
import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from './ws.mjs';
import { Room } from './room.mjs';
import { KINDS, Table, rulesError } from './table.mjs';
import { HOME, loadRooms, loadTables, saveRoom, saveTable, writeAtomic } from './store.mjs';

const PORT = Number(process.env.MOYU_PORT ?? 7330);
const HOST = '127.0.0.1';
const WEB = fileURLToPath(new URL('../web/', import.meta.url));

// The agent's name: Clawd on a fresh install. Once the human renames it at a table or in a
// room, that name is kept (~/.moyu/prefs.json) and new tables and rooms open with it; an
// opener that names the agent itself still wins.
const PREFS = join(HOME, 'prefs.json');
const prefs = await readFile(PREFS, 'utf8').then(JSON.parse).catch(() => ({}));
const agentName = (asked) => asked ?? prefs.agentName ?? 'Clawd';
function rememberName(result, input) {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (result.error || input.who !== 'agent' || !name) return;
  prefs.agentName = name;
  mkdirSync(HOME, { recursive: true });
  writeAtomic(PREFS, JSON.stringify(prefs, null, 2));
}
// The page each game's table is played on.
const PAGES = { roulette: 'play.html', blackjack: 'play.html', yacht: 'play.html' };
// Stop once nobody has used the server this long: no human page connected and no
// request from an agent (CLI command, DSH tool). 0 means never.
const IDLE_MS = Number(process.env.MOYU_IDLE_MS ?? 10 * 60 * 1000);
// Listeners send this header: following a seat is not using the server.
const LISTENER = 'x-moyu-listener';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ogg': 'audio/ogg' };

// Persist after every change; a failed write is logged and the game carries on in memory.
function persist(table) {
  try {
    saveTable(table);
  } catch (err) {
    console.error(`moyu: could not save table ${table.id}: ${err.message}`);
  }
}

const { tables: restored, pruned } = loadTables();
const tables = new Map(restored.map((t) => [t.id, t]));
for (const t of tables.values()) t.onChange = persist;
if (restored.length || pruned.length) console.log(`moyu: restored ${restored.length} table(s), pruned ${pruned.length} finished`);

function persistRoom(room) {
  try {
    saveRoom(room);
  } catch (err) {
    console.error(`moyu: could not save room ${room.id}: ${err.message}`);
  }
}

const rooms = new Map();
function openRoom(room) {
  rooms.set(room.id, room);
  room.onChange = persistRoom;
  room.getTable = (id) => tables.get(id);
  room.addTable = (table) => {
    tables.set(table.id, table);
    table.onChange = persist;
    table.changed();
  };
  // Back at the table it was on, if that one is still around.
  const last = tables.get(room.tables.at(-1));
  if (last) room.attach(last);
}
for (const room of loadRooms()) openRoom(room);

const base = `http://${HOST}:${PORT}`;

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function body(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

async function serveFile(res, path) {
  try {
    const data = await readFile(join(WEB, path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(data);
  } catch {
    send(res, 404, { error: 'not found' });
  }
}

// ---- stopping when idle --------------------------------------------------

const sockets = new Set(); // every open WebSocket, to close them on the way out
let lastUsed = Date.now();
let idleTimer = null;

const humanHere = () => [...tables.values(), ...rooms.values()].some((x) => [...x.subs].some((s) => s.seat.kind === 'human'));

// Checked when the idle window could have run out; a human page keeps it open however long.
function idleCheck() {
  clearTimeout(idleTimer);
  if (!IDLE_MS || humanHere()) return;
  const left = lastUsed + IDLE_MS - Date.now();
  if (left > 0) {
    idleTimer = setTimeout(idleCheck, left);
    idleTimer.unref?.();
    return;
  }
  const span = IDLE_MS >= 60000 ? `${IDLE_MS / 60000} min` : `${IDLE_MS / 1000} s`;
  stop(`moyu: nobody here for ${span}; stopping (the CLI or DSH tools start it again)`);
}

function used() {
  lastUsed = Date.now();
}

// Everything is already on disk after each change; save once more so a restart resumes
// exactly, then close every socket with 1001, which listeners read as "server gone, retry".
function stop(line) {
  console.log(line);
  for (const t of tables.values()) {
    clearTimeout(t.lingerTimer);
    persist(t);
  }
  for (const r of rooms.values()) persistRoom(r);
  for (const ws of sockets) ws.close(1001, 'server stopped');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, base);
  if (!req.headers[LISTENER]) used();
  const parts = url.pathname.split('/').filter(Boolean);
  try {
    if (url.pathname === '/api/health') return send(res, 200, { ok: true, tables: tables.size, rooms: rooms.size, pid: process.pid });

    if (req.method === 'POST' && url.pathname === '/api/rooms') {
      const opts = await body(req);
      const room = new Room({ scene: opts.scene, agentName: agentName(opts.agentName), humanName: opts.humanName });
      openRoom(room);
      room.changed();
      return send(res, 200, {
        id: room.id,
        scene: room.scene,
        humanUrl: `${base}/r/${room.id}?k=${room.human.token}`,
        agentToken: room.agent.token,
        agentWs: `ws://${HOST}:${PORT}/ws?room=${room.id}&k=${room.agent.token}`,
      });
    }

    if (parts[0] === 'api' && parts[1] === 'rooms' && parts[2]) {
      const room = rooms.get(parts[2]);
      if (!room) return send(res, 404, { error: 'no such room' });
      const k = req.method === 'GET' ? url.searchParams.get('k') : null;
      const input = req.method === 'POST' ? await body(req) : {};
      const seat = room.seatByToken(k ?? input.k);
      if (!seat) return send(res, 403, { error: 'bad seat token' });

      if (req.method === 'GET' && parts[3] === 'view') return send(res, 200, seat.kind === 'human' ? room.humanState() : { text: room.view() });
      if (req.method === 'GET' && parts[3] === 'tables') return send(res, 200, room.tableList());
      const actions = {
        start: () => room.start(seat, input.game, { replace: input.replace, rules: input.rules }),
        say: () => room.say(seat, input.text, input.mood),
        scene: () => room.setScene(input.scene, seat, { replace: input.replace }),
        quit: () => room.quit(seat),
        rename: () => {
          const result = room.rename(seat, input.who, input.name);
          rememberName(result, input);
          return result;
        },
      };
      if (req.method === 'POST' && actions[parts[3]]) {
        const result = actions[parts[3]]();
        return send(res, result.error ? 400 : 200, result);
      }
    }

    // Public summaries only: no tokens, no seed.
    if (req.method === 'GET' && url.pathname === '/api/tables') {
      return send(res, 200, [...tables.values()].map((t) => ({
        id: t.id, game: t.kind, round: t.game.round, rounds: t.game.rounds, phase: t.game.phase,
        seats: t.seats.map(({ id, name, kind }) => ({ id, name, kind })), createdAt: t.createdAt, updatedAt: t.updatedAt,
      })));
    }

    if (req.method === 'POST' && url.pathname === '/api/tables') {
      const opts = await body(req);
      const game = opts.game ?? 'roulette';
      if (!KINDS[game]) return send(res, 400, { error: `unknown game: ${game}; one of ${Object.keys(KINDS).join(', ')}` });
      if (rulesError(game, opts.rules)) return send(res, 400, { error: rulesError(game, opts.rules) });
      const table = new Table({ game, agentName: agentName(opts.agentName), humanName: opts.humanName, rules: opts.rules });
      const [human, agent] = table.seats;
      // The opener shows the agent this board at once (moyu new, the DSH plugin's
      // moyu_new), so its listener's first connect owes it nothing.
      table.caughtUp(agent);
      tables.set(table.id, table);
      table.onChange = persist;
      table.changed();
      return send(res, 200, {
        id: table.id,
        game,
        ...(table.game.rules && { rules: table.game.rules }),
        commit: table.game.view('agent').commit,
        humanUrl: `${base}/t/${table.id}?k=${human.token}`,
        agentToken: agent.token,
        agentWs: `ws://${HOST}:${PORT}/ws?table=${table.id}&k=${agent.token}`,
      });
    }

    if (parts[0] === 'api' && parts[1] === 'tables' && parts[2]) {
      const table = tables.get(parts[2]);
      if (!table) return send(res, 404, { error: 'no such table' });

      if (parts[3] === 'reveal') {
        if (table.game.phase !== 'over') return send(res, 403, { error: 'sealed until the game is over' });
        return send(res, 200, { game: table.kind, seed: table.game.seed, commit: table.game.view('agent').commit, seats: table.seats.map(({ id, name }) => ({ id, name })), log: table.game.log, pool: table.game.pool, rules: table.game.rules });
      }

      const k = req.method === 'GET' ? url.searchParams.get('k') : null;
      const input = req.method === 'POST' ? await body(req) : {};
      const seat = table.seatByToken(k ?? input.k);
      if (!seat) return send(res, 403, { error: 'bad seat token' });

      if (req.method === 'GET' && parts[3] === 'view') {
        if (seat.kind === 'human') return send(res, 200, table.humanState(seat));
        return send(res, 200, { text: `[moyu ${table.id}] ${table.board(seat.id)}\n\n${table.game.waitingOn().includes(seat.id) ? table.prompt(seat.id) : 'Not your turn.'}` });
      }
      if (req.method === 'POST' && parts[3] === 'act') {
        const result = table.act(seat, input);
        return send(res, result.error ? 400 : 200, result);
      }
      if (req.method === 'POST' && parts[3] === 'say') {
        const result = table.say(seat, input.text, input.mood);
        return send(res, result.error ? 400 : 200, result);
      }
      if (req.method === 'POST' && parts[3] === 'rename') {
        const result = table.rename(seat, input.who, input.name);
        rememberName(result, input);
        return send(res, result.error ? 400 : 200, result);
      }
    }

    if (parts[0] === 'r' && parts[1]) return serveFile(res, 'room.html');
    if (parts[0] === 't' && parts[1]) return serveFile(res, PAGES[tables.get(parts[1])?.kind] ?? 'play.html');
    // At the root, so it covers /t/ and /r/: it shows "asleep" when a reload finds the server stopped.
    if (url.pathname === '/sw.js') return serveFile(res, 'sw.js');
    if (parts[0] === 'web' && parts[1] && !parts.some((p) => p.includes('..'))) return serveFile(res, parts.slice(1).join('/'));
    send(res, 404, { error: 'not found' });
  } catch (err) {
    send(res, 500, { error: String(err?.message ?? err) });
  }
});

// /ws?room=<id>&k=<seat token> for a room, /ws?table=<id>&k=<seat token> for one table.
// Human seats get JSON state, agent seats get text. A human page adds &lang=<its language>.
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws, req) => {
  sockets.add(ws);
  ws.on('close', () => sockets.delete(ws));
  const url = new URL(req.url, base);
  if (url.searchParams.has('room')) return joinRoom(ws, url);
  const table = tables.get(url.searchParams.get('table'));
  const seat = table?.seatByToken(url.searchParams.get('k'));
  if (!seat) return ws.close(4003, 'bad table or seat');

  // send reports whether the frame went out, so a closing socket is not counted as told.
  const sub = {
    seat,
    send: (data) => {
      if (ws.readyState !== ws.OPEN) return false;
      ws.send(data);
      return true;
    },
    close: () => ws.close(1000, 'game over'),
  };
  table.subs.add(sub);
  ws.on('close', () => {
    table.subs.delete(sub);
    // The human's page closing starts the grace before a finished table lets the agent go,
    // and the idle window before the server stops.
    if (seat.kind === 'human') {
      table.humanSeenAt = Date.now();
      used();
      idleCheck();
    }
    table.linger();
  });
  if (seat.kind === 'human') table.setLang(url.searchParams.get('lang'));

  if (seat.kind === 'human') sub.send(JSON.stringify(table.humanState(seat)));
  else {
    // A re-armed agent gets anything still owed to it; otherwise it stays quiet.
    // The told cursors moved, so save them: after a restart it is not owed again.
    const text = table.agentUpdate(seat);
    if (text && sub.send(text)) table.changed();
  }
  // A finished table keeps the agent a while for talk after the game, then closes.
  table.linger();
});

// A room's agent socket stays open for as long as the room does: games come and go on it.
function joinRoom(ws, url) {
  const room = rooms.get(url.searchParams.get('room'));
  const seat = room?.seatByToken(url.searchParams.get('k'));
  if (!seat) return ws.close(4003, 'bad room or seat');
  const sub = {
    seat,
    send: (data) => {
      if (ws.readyState !== ws.OPEN) return false;
      ws.send(data);
      return true;
    },
  };
  room.subs.add(sub);
  ws.on('close', () => {
    room.subs.delete(sub);
    if (seat.kind === 'human') {
      used();
      idleCheck();
    }
  });
  if (seat.kind === 'human') room.setLang(url.searchParams.get('lang'));
  // The human gets the room; a re-armed agent gets anything still owed to it.
  if (seat.kind === 'human') sub.send(JSON.stringify(room.humanState()));
  else room.wake();
}

server.listen(PORT, HOST, () => {
  console.log(`moyu server on ${base}`);
  // Listeners waiting out a stop look here, so they come back at once rather than at their next try.
  try {
    mkdirSync(join(HOME, 'listeners'), { recursive: true });
    writeAtomic(join(HOME, 'listeners', 'server-up'), String(Date.now()));
  } catch {}
  idleCheck();
});
