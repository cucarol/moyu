import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handTotal } from '../server/games/blackjack.mjs';
import { Table } from '../server/table.mjs';
import { KEEP_FINISHED_MS, loadTables, saveTable } from '../server/store.mjs';

const roundTrip = (t) => Table.fromJSON(JSON.parse(JSON.stringify(t)));

const newTable = (opts = {}) => new Table({ game: 'blackjack', ...opts });

// Both check the first bets, so the draw is under way.
function toMidHand(t) {
  for (let i = 0; i < 2; i++) step(t);
}

// One move for whoever is owed one: on the draw hit below 17, on a betting round call or check.
function step(t) {
  const id = t.game.waitingOn()[0];
  const seat = t.seats.find((s) => s.id === id);
  if (t.game.street !== 'draw') return t.act(seat, { action: t.game.facing === id ? 'call' : 'check' });
  return t.act(seat, { action: handTotal(t.game.seat(id).hand).total < 17 ? 'hit' : 'stand' });
}

test('a table restored mid-hand shows the same views and deals the same next cards', () => {
  const t = newTable();
  toMidHand(t);
  t.say(t.seats[0], 'hello');
  const r = roundTrip(t);

  for (const id of ['human', 'agent']) {
    assert.deepEqual(r.game.view(id), t.game.view(id));
    assert.equal(r.board(id), t.board(id));
  }
  assert.deepEqual(r.humanState(r.seats[0]), t.humanState(t.seats[0]));
  assert.deepEqual(r.told, t.told);
  assert.deepEqual(r.game.deck, t.game.deck);
  assert.equal(r.seatByToken(t.seats[1].token).id, 'agent');

  // Play both to the end with the same moves: every card and message must match.
  while (t.game.phase !== 'over') {
    assert.deepEqual(step(r), step(t));
    assert.equal(r.agentUpdate(r.seats[1]), t.agentUpdate(t.seats[1]));
  }
  assert.equal(r.game.phase, 'over');
  assert.deepEqual(r.game.log, t.game.log);
});

test('restored told cursors: no duplicate prompt, nothing missed', () => {
  const t = newTable();
  const [human, agent] = t.seats;
  if (t.game.turn === 'human') t.act(human, { action: 'check' });
  assert.match(t.agentUpdate(agent), /Your move/); // told on connect, before the restart
  const r1 = roundTrip(t);
  assert.equal(r1.agentUpdate(r1.seats[1]), null, 'a prompt already told is not told again');

  // While the agent is away it acts, then the human acts and chats: all of it is owed after the restart.
  t.act(agent, { action: 'check' });
  t.act(human, { action: t.game.street === 'draw' ? 'hit' : 'check' });
  t.say(human, 'your turn');
  const r2 = roundTrip(t);
  const owed = r2.agentUpdate(r2.seats[1]);
  assert.match(owed, /Human says: your turn/);
  assert.equal(r2.agentUpdate(r2.seats[1]), null);
  assert.equal(owed, t.agentUpdate(agent));
});

test('agent-facing commands name the table', () => {
  const t = newTable();
  const [human, agent] = t.seats;
  if (t.game.turn === 'human') t.act(human, { action: 'check' });
  assert.ok(t.agentUpdate(agent).includes(`moyu check | bet | allin --table ${t.id} [--say "..."]`));
  t.act(agent, { action: 'check' });
  if (t.game.turn === 'human') t.act(human, { action: t.game.street === 'draw' ? 'stand' : 'check' }); // to the draw, the agent's turn
  assert.match(t.prompt('agent'), new RegExp(`^Your move: moyu hit \\| stand --table ${t.id} \\[--say "\\.\\.\\."\\]$`));
  const end = t.act(agent, { action: 'quit' });
  assert.ok(end.text.includes(`Verify: moyu verify --table ${t.id}`));
});

test('the store saves atomically, restores, and prunes week-old finished tables', () => {
  const dir = mkdtempSync(join(tmpdir(), 'moyu-store-'));
  try {
    const live = newTable();
    toMidHand(live);
    saveTable(live, dir);

    const old = newTable();
    old.act(old.seats[1], { action: 'quit' });
    saveTable(old, dir);
    const recent = newTable();
    recent.act(recent.seats[1], { action: 'quit' });
    saveTable(recent, dir);
    const stale = newTable(); // unfinished: kept however old
    saveTable(stale, dir);
    writeFileSync(join(dir, 'junk.json'), '{ not json');

    for (const t of [old, stale]) {
      const path = join(dir, `${t.id}.json`);
      writeFileSync(path, JSON.stringify({ ...JSON.parse(readFileSync(path, 'utf8')), updatedAt: Date.now() - KEEP_FINISHED_MS - 1000 }));
    }
    const { tables, pruned } = loadTables(dir, Date.now());
    assert.deepEqual(pruned, [old.id]);
    assert.equal(existsSync(join(dir, `${old.id}.json`)), false);
    assert.deepEqual(tables.map((t) => t.id).sort(), [live.id, recent.id, stale.id].sort());
    const back = tables.find((t) => t.id === live.id);
    assert.deepEqual(back.game.view('agent'), live.game.view('agent'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
