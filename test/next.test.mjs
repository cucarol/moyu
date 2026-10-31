import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Waiter } from '../server/next.mjs';
import { Room } from '../server/room.mjs';
import { Table } from '../server/table.mjs';

Table.BATCH_MS = 0;
Waiter.HOLD_MS = 50;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function listener(seat) {
  const got = [];
  return { got, sub: { seat, send: (x) => (got.push(x), true), close: () => got.push('<closed>') } };
}

// A blackjack table where the human is to move.
function humanToMove() {
  const t = new Table({ game: 'blackjack' });
  const [human, agent] = t.seats;
  if (t.game.turn === 'agent') t.act(agent, { action: 'hit' });
  return { t, human, agent };
}

test('while the agent asks with next, its frames go there; the listener gets nothing until it stops', async () => {
  const { t, human, agent } = humanToMove();
  const ear = listener(agent);
  t.subs.add(ear.sub);
  assert.ok(await t.next(agent, 1000)); // what was owed, at once

  // Between two requests: held, so the line stays owed instead of waking the listener.
  t.say(human, 'hi');
  assert.match(await t.next(agent, 1000), /Human says: hi/);
  // A waiting request gets the next one as it comes.
  const p = t.next(agent, 1000);
  t.say(human, 'again');
  assert.match(await p, /Human says: again/);
  assert.equal(ear.got.length, 0);

  // Nothing new: the request ends empty after its wait.
  assert.equal(await t.next(agent, 20), null);

  // It stops asking: once the hold runs out, the listener gets what is still owed.
  t.say(human, 'later');
  assert.equal(ear.got.length, 0);
  await sleep(100);
  assert.equal(ear.got.length, 1);
  assert.match(ear.got[0], /Human says: later/);
});

test('a request whose caller hung up loses no frame', async () => {
  const { t, human, agent } = humanToMove();
  await t.next(agent, 1000);
  const ac = new AbortController();
  const p = t.next(agent, 1000, ac.signal);
  ac.abort();
  assert.equal(await p, null);
  t.say(human, 'still here?');
  assert.match(await t.next(agent, 1000), /still here\?/);
});

test('game over lets the listener have the seat again, and the closing seat ends a waiting request', async () => {
  const { t, human, agent } = humanToMove();
  const ear = listener(agent);
  t.subs.add(ear.sub);
  await t.next(agent, 1000);
  const p = t.next(agent, 1000);
  t.act(human, { action: 'quit' });
  assert.match(await p, /Game over/);
  assert.equal(t.waiters.agent.active, false);
  t.say(human, 'gg');
  assert.match(ear.got.at(-1), /Human says: gg/); // the talk after it wakes the agent as usual

  const waiting = t.next(agent, 1000);
  const linger = Table.LINGER_MS;
  Table.LINGER_MS = 0;
  t.linger();
  Table.LINGER_MS = linger;
  assert.equal(await waiting, Waiter.CLOSED);
});

test('in a room, next hears the game open and the table after it, and the room socket stays quiet', async () => {
  const room = new Room();
  const tables = new Map();
  room.getTable = (id) => tables.get(id);
  room.addTable = (t) => tables.set(t.id, t);
  const ear = listener(room.agent);
  room.subs.add(ear.sub);

  const opened = room.next(1000);
  room.start(room.human, 'blackjack');
  assert.match(await opened, /A Blackjack table is open/);
  const p = room.next(1000);
  room.say(room.human, 'your move?');
  assert.match(await p, /Human says: your move\?/);
  assert.equal(ear.got.length, 0);

  // The game ends; between games the room socket wakes the agent again.
  const over = room.next(1000);
  room.quit(room.human);
  assert.match(await over, /Game over/);
  room.say(room.human, 'one more?');
  assert.match(ear.got.at(-1), /Human says: one more\?/);
});
