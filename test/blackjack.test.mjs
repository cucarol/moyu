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

// Both check the first betting round, so the draw is on.
function toDraw(g) {
  const a = g.turn;
  g.apply(a, { action: 'check' });
  g.apply(g.other(a), { action: 'check' });
  assert.equal(g.street, 'draw');
  return a;
}

test("a seat sees its own hole card, never the other's; a bust can only stand, and stays hidden", () => {
  const g = new Blackjack({ seats: SEATS, seed: newSeed() });
  const id = toDraw(g);
  const other = g.other(id);
  const hole = g.seat(id).hand[1];
  g.apply(id, { action: 'hit' });
  g.apply(other, { action: 'stand' });
  // id plays alone now: hit to a bust, after which standing is all it can do.
  while (handTotal(g.seat(id).hand).total <= 21) g.apply(id, { action: 'hit' });
  assert.equal(g.turn, id);
  assert.deepEqual(g.legalActions(id), ['stand']);
  assert.match(g.apply(id, { action: 'hit' }).error, /cannot hit now; you can stand/);
  const theirs = g.view(other).seats.find((s) => s.id === id);
  assert.equal(theirs.hand[1], '??');
  assert.equal(g.view(id).seats.find((s) => s.id === id).hand[1], hole);
  assert.equal(theirs.total.total, handTotal(g.seat(id).hand.filter((_, i) => i !== 1)).total);
  assert.ok(!JSON.stringify(g.view(other)).includes(`"${hole}"`), 'the hole card is nowhere in the other seat view');
  assert.equal(g.view(other).seed, null);
  // Both stood: the last betting round, first actor first.
  g.apply(id, { action: 'stand' });
  assert.equal(g.street, 'bet2');
  assert.equal(g.turn, g.first);
});

test('bets are the pot, raises have no cap, and a fold ends the hand without a showdown', () => {
  const g = new Blackjack({ seats: SEATS, seed: newSeed() });
  const a = g.turn;
  const b = g.other(a);
  const ante = ANTES[0];
  assert.deepEqual(g.legalActions(a), ['check', 'bet', 'allin']);
  g.apply(a, { action: 'bet' }); // the pot: both antes
  assert.equal(g.seat(a).bet, 2 * ante);
  assert.deepEqual(g.legalActions(b), ['call', 'fold', 'raise', 'allin']);
  assert.equal(g.apply(b, { action: 'hit' }).error, 'cannot hit now; you can call, fold, raise, allin');
  g.apply(b, { action: 'raise' }); // call 2 antes, then the pot of 6 on top
  assert.equal(g.seat(b).bet, 8 * ante);
  // Raising the pot again would cost more than b has left: all in is the raise now.
  assert.deepEqual(g.legalActions(a), ['call', 'fold', 'allin']);
  g.apply(a, { action: 'allin' });
  assert.equal(g.seat(a).stack, 0);
  assert.equal(g.turn, b);
  g.apply(b, { action: 'fold' });
  assert.equal(g.round, 2);
  assert.equal(g.lastHand.how, 'fold');
  assert.equal(g.lastHand.winner, a);
  assert.equal(g.lastHand.hands[a], null);
  // a won b's ante and raise; both have posted hand 2's ante since
  assert.equal(g.seat(a).stack, START_STACK + ante + 8 * ante - ANTES[1]);
  assert.equal(g.seat(b).stack, START_STACK - ante - 8 * ante - ANTES[1]);
  // the first actor alternates
  assert.equal(g.turn, b);
});

test('all in caps at what the other seat can match; the betting rounds after it are skipped', () => {
  const g = new Blackjack({ seats: SEATS, seed: newSeed() });
  const a = g.turn;
  const b = g.other(a);
  g.seat(b).stack = 300_000; // b is short
  assert.equal(g.price(a).allin, 300_000);
  g.apply(a, { action: 'allin' });
  assert.equal(g.seat(a).stack, START_STACK - ANTES[0] - 300_000);
  assert.deepEqual(g.legalActions(b), ['call', 'fold']);
  g.apply(b, { action: 'call' });
  assert.equal(g.seat(b).stack, 0);
  assert.equal(g.street, 'draw');
  // the draw still happens; with b all in there is no last betting round
  g.apply(g.turn, { action: 'stand' });
  g.apply(g.turn, { action: 'stand' });
  assert.equal(g.lastHand.how, 'showdown');
  assert.equal(g.lastHand.pot, 2 * (ANTES[0] + 300_000));
});

test('a check passes; two checks close the round, a call closes it after a bet', () => {
  const g = new Blackjack({ seats: SEATS, seed: newSeed() });
  const a = toDraw(g);
  const b = g.other(a);
  g.apply(a, { action: 'stand' });
  g.apply(b, { action: 'stand' });
  assert.equal(g.street, 'bet2');
  g.apply(a, { action: 'check' });
  assert.equal(g.turn, b);
  g.apply(b, { action: 'bet' });
  g.apply(a, { action: 'call' });
  assert.equal(g.lastHand.how, 'showdown');
  assert.equal(g.lastHand.pot, ANTES[0] * 2 * 3);
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
      const pick = (...xs) => xs.find((x) => legal.includes(x));
      const action = g.street === 'draw'
        ? pick(t < 17 ? 'hit' : 'stand', 'stand')
        : r < 0.08 ? pick('allin', 'call', 'check') : r < 0.25 ? pick('raise', 'bet', 'call', 'check') : r < 0.35 ? pick('fold', 'check') : pick('call', 'check');
      assert.ok(g.apply(id, { action }).ok, `${action} in ${legal}`);
      assert.equal(g.seats.reduce((x, s) => x + s.stack + s.stake, 0), START_STACK * 2);
      assert.ok(g.seats.every((s) => s.stack >= 0));
    }
    assert.equal(g.phase, 'over');
    assert.equal(commitOf(g.seed), g.view('a').commit);
    assert.deepEqual(Blackjack.replay(seed, SEATS, g.log).log, g.log);
  }
});
test('agent seats are woken by every move, chat, and the end', () => {
  const t = new Table({ game: 'blackjack', agentName: 'Claude' });
  const [human, agent] = t.seats;
  // Let the human act first, whoever the seed picked.
  if (t.game.turn === 'agent') t.act(agent, { action: 'check' });
  const sent = [];
  t.subs.add({ seat: agent, send: (x) => sent.push(x), close: () => sent.push('<closed>') });
  t.agentUpdate(agent);
  t.say(human, '来吧');
  assert.equal(sent.length, 1);
  assert.match(sent[0], /Human says: 来吧/);
  t.act(human, { action: 'check' });
  assert.equal(sent.length, 2, 'the human checking hands the agent its turn');
  assert.match(sent[1], /Your move: moyu (hit \| stand|check \| bet \| allin)/);
  assert.ok(!sent[1].includes(t.game.seat('human').hand[1]), "the human's hole card never reaches the agent");
});
