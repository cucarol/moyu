// Tables and rooms on disk, so a server restart resumes every game exactly: one JSON
// file per table under ~/.moyu/server/tables, one per room under ~/.moyu/server/rooms.
// The files hold seeds and seat tokens, so they live outside the web root and no HTTP
// route ever reads them.
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Room } from './room.mjs';
import { Table } from './table.mjs';

// MOYU_HOME moves everything (CLI state and server tables) elsewhere, e.g. for tests.
export const HOME = process.env.MOYU_HOME ?? join(homedir(), '.moyu');
export const TABLES_DIR = join(HOME, 'server', 'tables');
export const ROOMS_DIR = join(HOME, 'server', 'rooms');
export const KEEP_FINISHED_MS = 7 * 24 * 60 * 60 * 1000;

const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// Temp file + rename, so a crash mid-write never leaves half a table. On Windows the
// rename can fail for a moment while something (an indexer, antivirus) holds the target.
export function writeAtomic(path, text) {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  for (let i = 0; ; i++) {
    try {
      return renameSync(tmp, path);
    } catch (err) {
      if (i >= 5 || (err.code !== 'EPERM' && err.code !== 'EBUSY')) {
        rmSync(tmp, { force: true });
        throw err;
      }
      pause(20 * (i + 1));
    }
  }
}

export function saveTable(table, dir = TABLES_DIR) {
  mkdirSync(dir, { recursive: true });
  writeAtomic(join(dir, `${table.id}.json`), JSON.stringify(table));
}

// Every saved table, except finished ones untouched for a week, which are deleted.
export function loadTables(dir = TABLES_DIR, now = Date.now()) {
  const tables = [];
  const pruned = [];
  let names = [];
  try {
    names = readdirSync(dir);
  } catch {
    return { tables, pruned };
  }
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const path = join(dir, name);
    try {
      const data = JSON.parse(readFileSync(path, 'utf8'));
      if (data.game.phase === 'over' && now - data.updatedAt > KEEP_FINISHED_MS) {
        rmSync(path, { force: true });
        pruned.push(data.id);
        continue;
      }
      tables.push(Table.fromJSON(data));
    } catch (err) {
      console.error(`moyu: skipping unreadable table file ${name}: ${err.message}`);
    }
  }
  return { tables, pruned };
}

export function saveRoom(room, dir = ROOMS_DIR) {
  mkdirSync(dir, { recursive: true });
  writeAtomic(join(dir, `${room.id}.json`), JSON.stringify(room));
}

// Rooms are kept: one is meant to stay open for as long as the human likes.
export function loadRooms(dir = ROOMS_DIR) {
  let names = [];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const rooms = [];
  for (const name of names.filter((n) => n.endsWith('.json'))) {
    try {
      rooms.push(Room.fromJSON(JSON.parse(readFileSync(join(dir, name), 'utf8'))));
    } catch (err) {
      console.error(`moyu: skipping unreadable room file ${name}: ${err.message}`);
    }
  }
  return rooms;
}
