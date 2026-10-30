import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANTES, Blackjack, START_STACK, deckFor, handTotal } from '../server/games/blackjack.mjs';
import { Table } from '../server/table.mjs';
import { commitOf, newSeed } from '../server/seal.mjs';

const SEATS = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];

test('hand totals count aces soft', () => {
  assert.deepEqual(handTotal(['AS', 'KD']), { total: 21, soft: true });
  assert.deepEqual(handTotal(['AS', 'AD', '9C']), { total: 21, soft: true });
  assert.equal(handTotal(['KS', 'QD', '5C']).total, 25);
});

test('each hand gets a fresh 52-card deck fixed by the seed', () => {
  const seed = newSeed();
  const a = deckFor(seed, 1);
  assert.equal(new Set(a).size, 52);
  assert.deepEqual(a, deckFor(seed, 1));
  assert.notDeepEqual(a, deckFor(seed, 2));
});

test("a seat sees its own hole card, never the other's, and busts stay hidden", () => {
  const g = new Blackjack({ seats: SEATS, seed: newSeed() });
  const id = g.turn;
  const other = g.other(id);
  const hole = g.seat(id).hand[1];
  g.apply(id, { action: 'hit' });
  g.apply(other, { action: 'stand' });
  // id plays alone now: hit to a bust, which ends nothing and tells nobody.
  while (handTotal(g.seat(id).hand).total <= 21) g.apply(id, { action: 'hit' });
  assert.equal(g.turn, id);
  const theirs = g.view(other).seats.find((s) => s.id === id);
  assert.equal(theirs.hand[1], '??');
  assert.equal(g.view(id).seats.find((s) => s.id === id).hand[1], hole);
  assert.equal(theirs.total.total, handTotal(g.seat(id).hand.filter((_, i) => i !== 1)).total);
  assert.ok(!JSON.stringify(g.view(other)).includes(`"${hole}"`), 'the hole card is nowhere in the other seat view');
  assert.equal(g.view(other).seed, null);
});

test('a double must be called or folded; a fold ends the hand without a showdown', () => {
  const g = new Blackjack({ seats: SEATS, seed: newSeed() });
  const a = g.turn;
  const b = g.other(a);
  assert.ok(g.legalActions(a).includes('double'));
  g.apply(a, { action: 'double' });
  assert.deepEqual(g.legalActions(b), ['call', 'fold']);
  assert.equal(g.apply(b, { action: 'hit' }).error, 'call or fold the double first');
  assert.equal(g.pot, ANTES[0] * 3);
  g.apply(b, { action: 'fold' });
  assert.equal(g.round, 2);
  assert.equal(g.lastHand.how, 'fold');
  assert.equal(g.lastHand.winner, a);
  assert.equal(g.lastHand.hands[a], null);
  // a won b's ante; both have posted hand 2's ante since
  assert.equal(g.seat(a).stack, START_STACK + ANTES[0] - ANTES[1]);
  assert.equal(g.seat(b).stack, START_STACK - ANTES[0] - ANTES[1]);
  // the first actor alternates
  assert.equal(g.turn, b);
});

test('after a call the caller plays on; the doubler is done', () => {
  const g = new Blackjack({ seats: SEATS, seed: newSeed() });
  const a = g.turn;
  const b = g.other(a);
  g.apply(a, { action: 'double' });
  g.apply(b, { action: 'call' });
  assert.equal(g.turn, b);
  assert.deepEqual(g.legalActions(b), ['hit', 'stand', 'double']);
  g.apply(b, { action: 'hit' });
  assert.equal(g.turn, b, 'the doubler stood, so b plays alone');
  g.apply(b, { action: 'stand' });
  assert.equal(g.lastHand.how, 'showdown');
  assert.equal(g.lastHand.pot, ANTES[0] * 4);
});

// Whole games with simple strategies: tokens are conserved, the game ends, replay matches.
test('random full games conserve tokens, finish, and replay from the seed', () => {
  for (let n = 0; n < 300; n++) {
    const seed = newSeed();
    const g = new Blackjack({ seats: SEATS, seed });
    let guard = 0;
    while (g.phase !== 'over' && guard++ < 1000) {
      const id = g.turn;
      const legal = g.legalActions(id);
      const t = handTotal(g.seat(id).hand).total;
      const r = Math.random();
      const action = legal.includes('call') ? (r < 0.7 ? 'call' : 'fold') : legal.includes('double') && t >= 9 && t <= 11 && r < 0.6 ? 'double' : t < 17 ? 'hit' : 'stand';
      assert.ok(g.apply(id, { action }).ok);
      assert.equal(g.seats.reduce((x, s) => x + s.stack + s.stake, 0), START_STACK * 2);
    }
    assert.equal(g.phase, 'over');
    assert.equal(commitOf(g.seed), g.view('a').commit);
    assert.deepEqual(Blackjack.replay(seed, SEATS, g.log).log, g.log);
  }
});

test('agent seats are woken by every move, chat, and the end', () => {
  const t = new Table({ game: 'blackjack', agentName: 'Claude', humanName: 'C' });
  const [human, agent] = t.seats;
  // Let the human act first, whoever the seed picked.
  if (t.game.turn === 'agent') t.act(agent, { action: 'hit' });
  const sent = [];
  t.subs.add({ seat: agent, send: (x) => sent.push(x), close: () => sent.push('<closed>') });
  t.agentUpdate(agent);
  t.say(human, '来吧');
  assert.equal(sent.length, 1);
  assert.match(sent[0], /C says: 来吧/);
  t.act(human, { action: 'hit' });
  assert.equal(sent.length, 2, 'the human hitting hands the agent its turn');
  assert.match(sent[1], /Your move: moyu hit \| stand/);
  assert.ok(!sent[1].includes(t.game.seat('human').hand[1]), "the human's hole card never reaches the agent");
});
