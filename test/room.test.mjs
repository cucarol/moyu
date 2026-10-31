import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../server/room.mjs';

// A room wired the way the server wires it, with sockets that record what they get.
function newRoom(opts) {
  const room = new Room(opts);
  const tables = new Map();
  room.getTable = (id) => tables.get(id);
  room.addTable = (t) => tables.set(t.id, t);
  return { room, tables };
}

function listen(room, kind) {
  const got = [];
  const sub = { seat: room.seats.find((s) => s.kind === kind), send: (x) => (got.push(x), true) };
  room.subs.add(sub);
  return { got, sub };
}

test('a game the human starts wakes the agent, and the agent socket outlives it', () => {
  const { room } = newRoom();
  const agent = listen(room, 'agent');
  const human = listen(room, 'human');

  assert.match(room.start(room.human, 'roulette').error, /isn't played in the raft scene/);
  const { table: id } = room.start(room.human, 'blackjack');
  const t = room.table;
  assert.equal(t.id, id);
  assert.equal(t.room, room.id);
  assert.equal(t.seatByToken(room.agent.token).id, 'agent'); // the room's tokens sit at its tables
  assert.equal(agent.got.length, 1);
  assert.match(agent.got[0], new RegExp(`^\\[moyu room ${room.id}\\] A Blackjack table is open: ${id}\\. Sealed seed commit: [0-9a-f]{64}\\n\\[moyu ${id}\\]`));
  assert.equal(JSON.parse(human.got.at(-1)).table.id, id);

  // Mid-game: chat goes to the table, the scene stays, no second game.
  room.say(room.human, 'hi');
  assert.equal(t.chat.at(-1).text, 'hi');
  assert.equal(room.chat.length, 0);
  assert.match(agent.got.at(-1), /Human says: hi/);
  assert.ok(room.setScene('machine').error);
  assert.ok(room.start(room.human, 'yacht').error);

  // The game ends; the agent hears it, its socket stays, and the room is free again.
  t.act(room.human, { action: 'quit' });
  assert.match(agent.got.at(-1), /Game over/);
  assert.ok(room.subs.has(agent.sub));
  assert.equal(room.live, false);
  assert.ok(room.setScene('machine').ok);
  const second = room.start(room.agent, 'roulette');
  assert.match(second.text, /A Roulette table is open/);
  assert.deepEqual(room.tables, [id, second.table]);
});

test('chat with no game on wakes the agent, and waits for it when it is not listening', () => {
  const { room } = newRoom();
  room.say(room.human, 'still there?');
  assert.equal(room.told.chat, 0); // nobody listening: still owed

  const agent = listen(room, 'agent');
  room.wake(); // what a re-armed listener gets on connect
  assert.match(agent.got[0], /Human says: still there\?\n\nNo game on\. Reply with: moyu say/);
  room.wake();
  assert.equal(agent.got.length, 1); // told once

  const reply = room.say(room.agent, 'here');
  assert.match(reply.text, /Said\. No game on/);
  assert.equal(agent.got.length, 1); // its own line doesn't wake it
  assert.deepEqual(room.humanState().chat.map((c) => c.text), ['still there?', 'here']);
});

test('a game opened while the agent is away is owed to it on connect', () => {
  const { room } = newRoom();
  room.start(room.human, 'yacht');
  const agent = listen(room, 'agent');
  room.wake();
  assert.match(agent.got[0], /A Yacht table is open/);
});

test('a room survives a save and load, told cursors and all', () => {
  const { room, tables } = newRoom();
  listen(room, 'agent');
  room.say(room.human, 'one');
  room.start(room.human, 'blackjack');
  const back = Room.fromJSON(JSON.parse(JSON.stringify(room)));
  back.getTable = (id) => tables.get(id);
  assert.deepEqual(back.toJSON(), room.toJSON());
  assert.equal(back.seatByToken(room.human.token).id, 'human');
  assert.ok(!JSON.stringify(back.humanState()).includes(room.agent.token));
  assert.ok(!JSON.stringify(back.humanState()).includes(room.human.token));
});

test('a room saved under the old terrace scene loads into the raft, and the old id still works', () => {
  const { room } = newRoom();
  const back = Room.fromJSON({ ...JSON.parse(JSON.stringify(room)), scene: 'terrace' });
  assert.equal(back.scene, 'raft');
  assert.equal(newRoom({ scene: 'terrace' }).room.scene, 'raft');
  assert.ok(room.setScene('terrace', room.human).ok);
  assert.equal(room.scene, 'raft');
});

test('a game can be ended or swapped mid-way: it finishes as a quit and still verifies', async () => {
  const { sameLog } = await import('../server/seal.mjs');
  const { KINDS } = await import('../server/table.mjs');
  const { room } = newRoom();
  const agent = listen(room, 'agent');
  room.start(room.human, 'blackjack');
  const first = room.table;
  assert.match(room.start(room.human, 'yacht').error, /still on/);
  const { table: id } = room.start(room.human, 'yacht', { replace: true });
  assert.equal(first.game.phase, 'over');
  assert.equal(first.game.log.at(-1).type, 'game_over');
  assert.ok(sameLog(KINDS.blackjack.Game.replay(first.game.seed, first.seats, first.game.log).log, first.game.log));
  assert.equal(room.table.id, id);
  assert.ok(agent.got.some((f) => /ended the game/.test(f)));
  assert.match(agent.got.at(-1), /A Yacht table is open/);

  // Switching scene ends it too; then quit with no game on says so.
  assert.match(room.setScene('machine', room.human).error, /still on/);
  assert.equal(room.setScene('machine', room.human, { replace: true }).ok, true);
  assert.equal(room.table.game.phase, 'over');
  room.start(room.human, 'roulette');
  assert.equal(room.quit(room.human).ok, true);
  assert.equal(room.live, false);
  assert.match(room.quit(room.human).error, /no game on/);
});

test('the room keeps a quiet history: the agent hears its record when a game opens, the page sees none of it', () => {
  const { room } = newRoom();
  const agent = listen(room, 'agent');
  const human = listen(room, 'human');
  room.setScene('machine', room.human);
  room.start(room.human, 'roulette');
  const t = room.table;
  // The human wins round 1 and round 2; a 幻觉 item of the agent's comes up fake twice on the way.
  for (const stage of [1, 2]) {
    if (t.game.turn !== 'human') t.act(room.agent, { action: 'shoot', target: 'self' });
    if (t.game.phase === 'over' || t.game.stage !== stage) continue;
    const g = t.game;
    g.seat('agent').hp = 1;
    g.shells[0] = true;
    if (g.turn !== 'human') continue;
    g.log.push({ type: 'use', seat: 'agent', item: 'cot', slot: 0, fake: true });
    t.act(room.human, { action: 'shoot', target: 'other' });
  }
  if (t.game.phase !== 'over') room.quit(room.human);
  const before = agent.got.length;
  room.start(room.human, 'roulette', { replace: true });
  const opened = agent.got.slice(before).join('\n');
  assert.equal(room.history.length, 1);
  assert.match(opened, /Your Roulette record with Human here: Human \d, you \d/);
  assert.match(opened, /Last time: /);
  assert.match(opened, /Only you see this/);
  assert.ok(!human.got.some((x) => x.includes('record with')));
  assert.ok(!JSON.stringify(room.humanState()).includes('history'));
  // It survives a save and load.
  const back = Room.fromJSON(JSON.parse(JSON.stringify(room)));
  assert.equal(back.history.length, 1);
});

test('the human renames the agent: the room keeps the name, a game on takes it, and the agent hears it', () => {
  const { room } = newRoom({ agentName: 'Claude' });
  const agent = listen(room, 'agent');
  assert.match(room.rename(room.agent, 'agent', 'X').error, /only the human/);
  assert.match(room.rename(room.human, 'agent', '').error, /1 to 24/);
  assert.ok(room.rename(room.human, 'agent', '小克').ok);
  assert.equal(room.agent.name, '小克');
  assert.deepEqual(room.chat.at(-1).rename, { who: 'agent', from: 'Claude', to: '小克' });
  assert.match(agent.got.at(-1), /Human renamed you to 小克\./);

  room.start(room.human, 'blackjack');
  assert.equal(room.table.seats.find((s) => s.id === 'agent').name, '小克');
  // The human's seat has no name to change.
  assert.match(room.rename(room.human, 'human', 'Mei').error, /only the agent/);
  assert.equal(room.human.name, 'Human');
});

test("the agent's text names roulette items the way the human's page does", () => {
  const { room } = newRoom({ scene: 'machine' });
  room.setLang('en-US');
  room.start(room.human, 'roulette');
  const t = room.table;
  assert.equal(t.lang, 'en-US');
  t.game.seats.forEach((s) => (s.items[0] = 'cot'));
  assert.match(t.board('agent'), /Chain of Thought \(cot\)/);
  assert.match(t.board('agent'), /\d\/\d quota/);
  room.setLang('zh-CN');
  assert.match(t.board('agent'), /思维链 \(cot\)/);
  assert.match(t.board('agent'), /\d\/\d 额度/);
  room.setLang('ja-JP');
  assert.match(t.board('agent'), /思考の連鎖 \(cot\)/);
  room.setLang('zh-CN');
  room.setLang('not a tag!');
  assert.equal(room.lang, 'zh-CN');
});
