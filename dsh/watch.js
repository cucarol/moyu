// The DSH plugin's listener: the counterpart of cli/listen.mjs, but inside the DSH host,
// for every session there at once. It follows the rooms and the unfinished or just
// finished tables bound to a DSH session (their `session` is `dsh:<session id>`) and
// hands each frame to wake().
// Nothing here may throw out of a callback: in DSH a stray throw or rejection ends the app.
import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { writeAtomic } from '../server/store.mjs';
import { Table } from '../server/table.mjs';

export const PREFIX = 'dsh:';
const BEAT_MS = 2000;
const FRESH_MS = 10000;
const RETRY_MS = 5000;
// The server stops when nobody uses it: then one try this often until it is back.
const DOWN_MS = Number(process.env.MOYU_DOWN_MS ?? 30000);
// Following a seat is not using the server, so it may still stop.
const HEADERS = { 'x-moyu-listener': '1' };

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

// dirs: { tables, rooms, listeners }. follow(sid) says how this host can reach a session:
// 'live' (its agent runs here), 'cold' (it can be resumed here) or null. wake(sid, text)
// delivers one frame and resolves to false when the session can no longer be reached.
export function createWatcher({ dirs, base, follow, wake, warn = () => {}, WebSocketImpl = globalThis.WebSocket, pid = process.pid, downMs = DOWN_MS }) {
  const BEAT = join(dirs.listeners, `dsh-${pid}.json`);
  const UP = join(dirs.listeners, 'server-up'); // the server writes when it last started
  const live = new Map(); // ws URL -> { ws, sid }
  const done = new Set(); // ws URLs whose game is over or whose seat is gone
  const retryAt = new Map(); // ws URL -> earliest time to try again
  const gone = new Set(); // sessions that could not be reached; dropped until their agent is back
  const queues = new Map(); // sid -> the last delivery, so frames reach a session in order
  let beating = false;
  let mine = {}; // the sessions in the last heartbeat
  let downUntil = 0; // the server was gone: no tries before this
  let timer = null;
  let ticking = null;
  let again = false;
  let stopped = false;

  async function files(dir) {
    const out = [];
    for (const name of await readdir(dir).catch(() => [])) {
      if (!name.endsWith('.json')) continue;
      try {
        out.push(JSON.parse(await readFile(join(dir, name), 'utf8')));
      } catch {}
    }
    return out;
  }

  // Sessions other DSH hosts on this machine (Desktop and `dsh web`, say) follow right now.
  async function others() {
    const claims = new Map(); // sid -> [{ pid, state }]
    for (const name of await readdir(dirs.listeners).catch(() => [])) {
      if (!name.startsWith('dsh-') || name === `dsh-${pid}.json`) continue;
      try {
        const beat = JSON.parse(await readFile(join(dirs.listeners, name), 'utf8'));
        if (Date.now() - beat.at > FRESH_MS) {
          // A host that was killed left its heartbeat behind.
          if (!alive(beat.pid)) await rm(join(dirs.listeners, name), { force: true });
          continue;
        }
        for (const [sid, state] of Object.entries(beat.sessions ?? {})) claims.set(sid, [...(claims.get(sid) ?? []), { pid: beat.pid, state }]);
      } catch {}
    }
    return claims;
  }

  // ws URL -> sid for everything this host should hear now, or null when the server is down.
  async function wanted() {
    const bound = (x) => typeof x.session === 'string' && x.session.startsWith(PREFIX) && x.ws;
    const rooms = (await files(dirs.rooms)).filter(bound);
    let tables = (await files(dirs.tables)).filter((t) => bound(t) && !t.room);
    if (rooms.length || tables.length) {
      // A finished table stays a while for talk after the game; the server closes it then.
      const over = await fetch(`${base}/api/tables`, { headers: HEADERS })
        .then((r) => r.json())
        .then((list) => new Set(list.filter((t) => t.phase === 'over' && Date.now() - t.updatedAt > Table.LINGER_MS).map((t) => t.id)))
        .catch(() => null);
      if (!over) return null; // server down
      tables = tables.filter((t) => !over.has(t.id));
    }
    const claims = await others();
    const want = new Map();
    mine = {};
    for (const x of [...rooms, ...tables]) {
      const sid = x.session.slice(PREFIX.length);
      const state = follow(sid);
      if (!state || (state !== 'live' && gone.has(sid))) continue;
      // A session another host runs is theirs; between hosts that could only resume it, the lowest pid.
      const rivals = claims.get(sid) ?? [];
      if (state === 'cold' && rivals.some((c) => c.state === 'live' || c.pid < pid)) continue;
      want.set(x.ws, sid);
      mine[sid] = state;
    }
    await heartbeat(mine);
    return want;
  }

  async function heartbeat(sessions) {
    if (Object.keys(sessions).length) {
      await mkdir(dirs.listeners, { recursive: true });
      writeAtomic(BEAT, JSON.stringify({ pid, at: Date.now(), sessions }));
      beating = true;
    } else if (beating) {
      beating = false;
      await rm(BEAT, { force: true });
    }
  }

  function deliver(sid, text) {
    const next = (queues.get(sid) ?? Promise.resolve())
      .then(() => wake(sid, text))
      .then((reached) => {
        if (reached === false) {
          warn(`moyu: session ${sid} could not be woken; no longer following it`);
          gone.add(sid);
          closeSession(sid);
        }
      })
      .catch((err) => warn(`moyu: waking session ${sid} failed: ${err?.message ?? err}`));
    queues.set(sid, next);
    next.finally(() => queues.get(sid) === next && queues.delete(sid)).catch(() => {});
  }

  function connect(url, sid) {
    let ws;
    try {
      ws = new WebSocketImpl(url);
    } catch (err) {
      retryAt.set(url, Date.now() + RETRY_MS);
      warn(`moyu: could not connect: ${err?.message ?? err}`);
      return;
    }
    live.set(url, { ws, sid });
    ws.addEventListener('message', (e) => {
      try {
        deliver(sid, String(e.data).trimEnd());
      } catch (err) {
        warn(`moyu: dropped a frame: ${err?.message ?? err}`);
      }
    });
    ws.addEventListener('error', () => {});
    ws.addEventListener('close', (e) => {
      try {
        // Only a close the server made counts; one we made ourselves already left `live`.
        if (live.get(url)?.ws !== ws) return;
        live.delete(url);
        if (e.code === 1000 || e.code === 4003) done.add(url);
        else retryAt.set(url, Date.now() + RETRY_MS);
      } catch {}
    });
  }

  function drop(url, delay = 0) {
    const entry = live.get(url);
    if (!entry) return;
    live.delete(url);
    if (delay) retryAt.set(url, Date.now() + delay);
    try {
      entry.ws.close();
    } catch {}
  }

  // A session's agent went away here: hang up its sockets. The next tick connects
  // again if it can still be resumed, and the server resends what it missed.
  function closeSession(sid, delay = BEAT_MS) {
    for (const [url, entry] of [...live]) if (entry.sid === sid) drop(url, delay);
  }

  async function tick() {
    if (stopped) return;
    // A server started since we found it gone (by a tool call, or a Claude Code command) ends the wait.
    const started = Number(await readFile(UP, 'utf8').catch(() => 0));
    if (Date.now() >= downUntil || started > downUntil - downMs) {
      const want = await wanted();
      if (stopped) return;
      if (want) return track(want);
      // Gone (stopped when idle, say): keep the sockets we have, and our claims, and look again later.
      downUntil = Date.now() + downMs;
    }
    await heartbeat(mine);
  }

  function track(want) {
    for (const [url, entry] of [...live]) if (want.get(url) !== entry.sid) drop(url);
    for (const [url, sid] of want) {
      if (live.has(url) || done.has(url) || (retryAt.get(url) ?? 0) > Date.now()) continue;
      connect(url, sid);
    }
  }

  // Ticks never overlap; a poke during one runs another right after it.
  function poke() {
    if (stopped) return;
    if (ticking) {
      again = true;
      return;
    }
    ticking = tick()
      .catch((err) => warn(`moyu: listener tick failed: ${err?.message ?? err}`))
      .finally(() => {
        ticking = null;
        if (again) {
          again = false;
          poke();
        }
      });
  }

  return {
    start() {
      stopped = false;
      poke();
      timer = setInterval(() => {
        try {
          poke();
        } catch {}
      }, BEAT_MS);
      // A host that is done (headless, say) must not be kept alive by this timer.
      timer.unref?.();
    },
    async stop() {
      stopped = true;
      clearInterval(timer);
      for (const url of [...live.keys()]) drop(url);
      await ticking;
      if (beating) await rm(BEAT, { force: true }).catch(() => {});
      beating = false;
    },
    poke,
    // The agent for this session is up here again: follow it from the next tick.
    revive(sid) {
      gone.delete(sid);
      poke();
    },
    closeSession,
    tick,
    // For tests.
    get following() {
      return new Map([...live].map(([url, { sid }]) => [url, sid]));
    },
  };
}
