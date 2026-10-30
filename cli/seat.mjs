// The agent's seat, shared by the CLI (cli/moyu.mjs) and the DeepSeek Harness plugin
// (dsh/index.js): every command as a function that returns the text the agent reads.
import { spawn } from 'node:child_process';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { commitOf, sameLog } from '../server/seal.mjs';
import { KINDS } from '../server/table.mjs';
import { HOME, writeAtomic } from '../server/store.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// One file per table, so several sessions can each keep a table open; `last` is the
// default for commands without --table. Rooms the same way, with `last-room`.
export const TABLES = join(HOME, 'tables');
const LAST = join(HOME, 'last');
export const ROOMS = join(HOME, 'rooms');
const LAST_ROOM = join(HOME, 'last-room');
export const LISTENERS = join(HOME, 'listeners');
export const BASE = `http://127.0.0.1:${process.env.MOYU_PORT ?? 7330}`;

export async function api(path, init) {
  const res = await fetch(BASE + path, init && { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(init) });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

// Every command starts the server if it is down; it restores its tables from disk.
export async function ensureServer() {
  try {
    await api('/api/health');
    return;
  } catch {}
  // cwd at the repo, so the long-lived server never pins the caller's directory.
  // Inside an Electron host (DSH Desktop) execPath is Electron, which runs a script as Node only when told to.
  const env = process.versions.electron ? { ...process.env, ELECTRON_RUN_AS_NODE: '1' } : process.env;
  spawn(process.execPath, [join(ROOT, 'server', 'main.mjs')], { cwd: ROOT, env, detached: true, stdio: 'ignore', windowsHide: true }).unref();
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 100));
    try {
      await api('/api/health');
      return;
    } catch {}
  }
  throw new Error('moyu server did not start');
}

const NAMES = { roulette: 'Roulette', blackjack: 'Blackjack', yacht: 'Yacht' };

// session: who is playing (tables and rooms move to whichever session last acted on
// them), or null. listening(): whether a listener follows that session for it, and
// listeningLine what to say then; otherwise the output gives the WebSocket to listen on.
export function createSeat({ session = null, listening = async () => false, listeningLine = '' } = {}) {
  function bind(file, s) {
    if (!session || s.session === session) return s;
    s.session = session;
    writeAtomic(file, JSON.stringify(s, null, 2));
    return s;
  }

  async function tableState(id) {
    if (!id) {
      try {
        id = (await readFile(LAST, 'utf8')).trim();
      } catch {
        throw new Error('no table yet: run moyu new');
      }
    }
    if (!/^[0-9a-f]+$/.test(id)) throw new Error(`bad table id: ${id}`);
    const file = join(TABLES, `${id}.json`);
    let s = null;
    try {
      s = JSON.parse(await readFile(file, 'utf8'));
    } catch {}
    // A room's tables are heard through the room's socket.
    if (s) return s.room ? s : bind(file, s);
    // A table started in a room: the room's seat sits at it. Note it like moyu new would,
    // commit included, the first time it is touched.
    for (const name of await readdir(ROOMS).catch(() => [])) {
      const room = JSON.parse(await readFile(join(ROOMS, name), 'utf8'));
      await ensureServer();
      const t = (await api(`/api/rooms/${room.id}/tables?k=${room.k}`).catch(() => [])).find((x) => x.id === id);
      if (!t) continue;
      const s = { id, game: t.game, k: room.k, ws: `${BASE.replace('http', 'ws')}/ws?table=${id}&k=${room.k}`, commit: t.commit, room: room.id };
      await mkdir(TABLES, { recursive: true });
      writeAtomic(join(TABLES, `${id}.json`), JSON.stringify(s, null, 2));
      writeAtomic(LAST, id);
      return s;
    }
    throw new Error(`no table ${id} here: see moyu list`);
  }

  async function roomState(id) {
    if (!id) {
      try {
        id = (await readFile(LAST_ROOM, 'utf8')).trim();
      } catch {
        throw new Error('no room yet: run moyu room');
      }
    }
    if (!/^[0-9a-f]+$/.test(id)) throw new Error(`bad room id: ${id}`);
    const file = join(ROOMS, `${id}.json`);
    let r;
    try {
      r = JSON.parse(await readFile(file, 'utf8'));
    } catch {
      throw new Error(`no room ${id} here: run moyu room`);
    }
    return bind(file, r);
  }

  async function roomText(r, text) {
    return [`Room ${r.id} open.`, `Human's link: ${r.humanUrl}`, (await listening()) ? listeningLine : `Listen on: ${r.ws}`, '\n' + text].join('\n');
  }

  async function act(id, input) {
    const s = await tableState(id);
    await ensureServer();
    return (await api(`/api/tables/${s.id}/act`, { k: s.k, ...input })).text;
  }

  // One command, as the CLI takes it: cmd, its positional args, its --options.
  // Returns { text } and, for a verify that fails, failed: true.
  async function run(cmd, rest, opts) {
    switch (cmd) {
      case 'room': {
        // The room last opened, if the server still has it; otherwise a new one.
        await ensureServer();
        if (!opts.new) {
          const r = await roomState().catch(() => null);
          const view = r && (await api(`/api/rooms/${r.id}/view?k=${r.k}`).catch(() => null));
          if (view) return { text: await roomText(r, view.text) };
        }
        const created = await api('/api/rooms', { scene: opts.scene ?? 'raft', agentName: opts.name, humanName: opts.human ?? 'Human' });
        const r = { id: created.id, k: created.agentToken, ws: created.agentWs, humanUrl: created.humanUrl, session };
        await mkdir(ROOMS, { recursive: true });
        writeAtomic(join(ROOMS, `${r.id}.json`), JSON.stringify(r, null, 2));
        writeAtomic(LAST_ROOM, r.id);
        return { text: await roomText(r, (await api(`/api/rooms/${r.id}/view?k=${r.k}`)).text) };
      }
      case 'start': {
        const r = await roomState(opts.room);
        await ensureServer();
        const res = await api(`/api/rooms/${r.id}/start`, { k: r.k, game: rest[0], replace: opts.replace === true, rules: opts.rules });
        await tableState(res.table); // note the table and its commit now
        return { text: res.text };
      }
      case 'new': {
        await ensureServer();
        const t = await api('/api/tables', { game: opts.game ?? 'roulette', agentName: opts.name, humanName: opts.human ?? 'Human', rules: opts.rules });
        await mkdir(TABLES, { recursive: true });
        writeAtomic(join(TABLES, `${t.id}.json`), JSON.stringify({ id: t.id, game: t.game, k: t.agentToken, ws: t.agentWs, commit: t.commit, session }, null, 2));
        writeAtomic(LAST, t.id);
        const { text } = await api(`/api/tables/${t.id}/view?k=${t.agentToken}`);
        return {
          text: [
            `${NAMES[t.game]}${t.rules === 'short' ? ' (short: one round)' : ''} table ${t.id} open. Sealed seed commit: ${t.commit}`,
            `Human's link: ${t.humanUrl}`,
            (await listening()) ? listeningLine : `Listen for your turns on: ${t.agentWs}`,
            '\n' + text,
          ].join('\n'),
        };
      }
      case 'view': {
        if (opts.room) {
          const r = await roomState(opts.room);
          await ensureServer();
          return { text: (await api(`/api/rooms/${r.id}/view?k=${r.k}`)).text };
        }
        const s = await tableState(opts.table);
        await ensureServer();
        return { text: (await api(`/api/tables/${s.id}/view?k=${s.k}`)).text };
      }
      case 'hit':
      case 'stand':
      case 'double':
      case 'call':
      case 'fold':
      case 'quit':
        return { text: await act(opts.table, { action: cmd, say: opts.say, mood: opts.mood }) };
      case 'keep':
      case 'score': {
        const input = { say: opts.say, mood: opts.mood };
        if (cmd === 'score') Object.assign(input, { action: 'score', category: rest[0] });
        else {
          // Positions as the board numbers them, 1 to 5; "1 3 5" and "135" both work.
          const keep = rest.join('').replace(/[^0-9]/g, '').split('').map((d) => Number(d) - 1);
          if (keep.some((i) => i < 0 || i > 4)) throw new Error('keep takes positions 1 to 5');
          Object.assign(input, { action: 'roll', keep });
        }
        return { text: await act(opts.table, input) };
      }
      case 'use':
      case 'shoot': {
        const input = { say: opts.say, mood: opts.mood };
        if (cmd === 'use') {
          Object.assign(input, { action: 'use', item: rest[0], pick: opts.pick });
          // --slot <n>: that slot (1-based, as the board numbers your hand), not the first of its kind
          if (opts.slot !== undefined) Object.assign(input, { item: undefined, slot: Number(opts.slot) - 1 });
        } else {
          const target = { me: 'self', self: 'self', you: 'other', other: 'other' }[rest[0]];
          if (!target) throw new Error('shoot me | shoot you');
          Object.assign(input, { action: 'shoot', target });
        }
        return { text: await act(opts.table, input) };
      }
      case 'say': {
        if (opts.room) {
          const r = await roomState(opts.room);
          await ensureServer();
          return { text: (await api(`/api/rooms/${r.id}/say`, { k: r.k, text: rest.join(' '), mood: opts.mood })).text };
        }
        const s = await tableState(opts.table);
        await ensureServer();
        return { text: (await api(`/api/tables/${s.id}/say`, { k: s.k, text: rest.join(' '), mood: opts.mood })).text };
      }
      case 'ws': {
        // Also starts the server, so a listener re-armed with this URL can connect.
        const s = opts.room ? await roomState(opts.room) : await tableState(opts.table);
        await ensureServer();
        return { text: s.ws };
      }
      case 'rules': {
        // A game's guide for the agent (rules, commands, how to play it), read when its first
        // table of that game opens, so the skill itself stays short.
        const game = rest[0];
        if (!NAMES[game]) throw new Error(`rules for which game? ${Object.keys(NAMES).join(', ')}`);
        return { text: await readFile(join(ROOT, 'skills', 'moyu', 'games', `${game}.md`), 'utf8') };
      }
      case 'list': {
        // Tables this machine holds a seat for and that are still being played.
        await ensureServer();
        const mine = new Set((await readdir(TABLES).catch(() => [])).filter((n) => n.endsWith('.json')).map((n) => n.slice(0, -5)));
        const last = await readFile(LAST, 'utf8').then((x) => x.trim(), () => null);
        const open = (await api('/api/tables')).filter((t) => mine.has(t.id) && t.phase !== 'over').sort((a, b) => a.createdAt - b.createdAt);
        if (!open.length) return { text: 'No open tables.' };
        return {
          text: open
            .map((t) => {
              const who = t.seats.map((x) => x.name).join(' vs ');
              return `${t.id}  ${t.game}  ${t.rounds ? `${t.game === 'blackjack' ? 'hand' : 'turn'} ${t.round}/${t.rounds}` : `load ${t.round}`}  ${t.phase}  ${who}${t.id === last ? '  (last)' : ''}`;
            })
            .join('\n'),
        };
      }
      case 'verify': {
        // Re-run the whole game from the revealed seed and check every logged card.
        const s = await tableState(opts.table);
        await ensureServer();
        const reveal = await api(`/api/tables/${s.id}/reveal`);
        const ok = commitOf(reveal.seed) === s.commit;
        // Re-run every action against a fresh engine on the revealed seed: same log, same game.
        const again = KINDS[reveal.game].Game.replay(reveal.seed, reveal.seats, reveal.log, reveal);
        const replay = sameLog(again.log, reveal.log);
        const moves = reveal.log.filter((e) => e.seat && e.type !== 'quit').length;
        const what = reveal.game === 'roulette' ? 'shell' : reveal.game === 'yacht' ? 'die' : 'card';
        return {
          text: [
            `commit ${s.commit}\nseed   ${reveal.seed}\nsha256(seed) ${ok ? 'matches' : 'DOES NOT match'} the commit given at the start.`,
            replay ? `All ${moves} moves and every ${what} follow from the seed.` : 'The game does NOT follow from the seed.',
          ].join('\n'),
          failed: !ok || !replay,
        };
      }
      default:
        return null;
    }
  }

  return { run, tableState, roomState };
}
