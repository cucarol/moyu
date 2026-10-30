import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, Yacht, scoreFor, sheetTotals } from '../server/games/yacht.mjs';
import { Table } from '../server/table.mjs';
import { commitOf, newSeed } from '../server/seal.mjs';

const SEATS = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];

test('categories score by the original rules', () => {
  assert.equal(scoreFor('threes', [3, 3, 1, 3, 6]), 9);
  assert.equal(scoreFor('choice', [1, 2, 3, 4, 6]), 16);
  assert.equal(scoreFor('four', [5, 5, 5, 5, 2]), 22);
  assert.equal(scoreFor('four', [5, 5, 5, 2, 2]), 0);
  assert.equal(scoreFor('four', [6, 6, 6, 6, 6]), 30, 'five the same is a four of a kind');
  assert.equal(scoreFor('house', [2, 2, 5, 5, 5]), 19);
  assert.equal(scoreFor('house', [5, 5, 5, 5, 5]), 0, 'but not a full house');
  assert.equal(scoreFor('small', [1, 2, 3, 4, 4]), 15);
  assert.equal(scoreFor('small', [6, 3, 5, 4, 1]), 15);
  assert.equal(scoreFor('small', [1, 2, 3, 5, 6]), 0);
  assert.equal(scoreFor('large', [2, 3, 4, 5, 6]), 30);
  assert.equal(scoreFor('large', [1, 2, 3, 4, 6]), 0);
  assert.equal(scoreFor('yacht', [4, 4, 4, 4, 4]), 50);
  const sheet = { ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18 };
  assert.deepEqual(sheetTotals(sheet), { upper: 63, bonus: 35, total: 98 });
});

test('kept dice stay put and the rest reroll; three rolls at most', () => {
  const g = new Yacht({ seats: SEATS, seed: newSeed() });
  const id = g.turn;
  const first = g.dice.slice();
  g.apply(id, { action: 'roll', keep: [0, 2] });
  assert.equal(g.dice[0], first[0]);
  assert.equal(g.dice[2], first[2]);
  g.apply(id, { action: 'roll', keep: [] });
  assert.deepEqual(g.legalActions(id), ['score']);
  assert.match(g.apply(id, { action: 'roll', keep: [] }).error, /no rolls left/);
  assert.equal(g.apply(g.other(id), { action: 'score', category: 'ones' }).error, 'not your turn');
  const dice = g.dice.slice();
  g.apply(id, { action: 'score', category: 'choice' });
  assert.equal(g.seat(id).sheet.choice, dice.reduce((a, b) => a + b));
  assert.match(g.apply(g.turn, { action: 'score', category: 'nope' }).error, /no category/);
  assert.equal(g.turn, g.other(id));
  assert.equal(g.rollsLeft, 2, 'the next seat starts with its first roll made');
});

test('the dice come from the seed, whoever plays', () => {
  const seed = newSeed();
  const g1 = new Yacht({ seats: SEATS, seed });
  const g2 = new Yacht({ seats: SEATS, seed });
  assert.deepEqual(g1.dice, g2.dice);
  g1.apply(g1.turn, { action: 'roll', keep: [1] });
  g2.apply(g2.turn, { action: 'roll', keep: [1] });
  assert.deepEqual(g1.dice, g2.dice);
});

test('random full games fill every category, finish, and replay from the seed', () => {
  const cats = Object.keys(CATEGORIES);
  for (let n = 0; n < 100; n++) {
    const seed = newSeed();
    const g = new Yacht({ seats: SEATS, seed });
    while (g.phase !== 'over') {
      const id = g.turn;
      if (g.rollsLeft > 0 && Math.random() < 0.6) {
        assert.ok(g.apply(id, { action: 'roll', keep: [0, 1, 2, 3, 4].filter(() => Math.random() < 0.4).slice(0, 4) }).ok);
      } else {
        const open = cats.filter((c) => g.seat(id).sheet[c] === null);
        const best = open.reduce((x, c) => (scoreFor(c, g.dice) > scoreFor(x, g.dice) ? c : x));
        assert.ok(g.apply(id, { action: 'score', category: best }).ok);
      }
    }
    assert.equal(g.turnNo, 24);
    for (const s of g.seats) assert.ok(cats.every((c) => s.sheet[c] !== null));
    assert.equal(commitOf(g.seed), g.view('a').commit);
    assert.deepEqual(Yacht.replay(seed, SEATS, g.log).log, g.log);
  }
});

test('a yacht table restored mid-turn rolls the same dice', () => {
  const t = new Table({ game: 'yacht' });
  const seat = t.seats.find((s) => s.id === t.game.turn);
  t.act(seat, { action: 'roll', keep: [0] });
  const r = Table.fromJSON(JSON.parse(JSON.stringify(t)));
  assert.deepEqual(r.game.view('agent'), t.game.view('agent'));
  t.act(seat, { action: 'roll', keep: [] });
  r.act(r.seats.find((s) => s.id === seat.id), { action: 'roll', keep: [] });
  assert.deepEqual(r.game.dice, t.game.dice);
  assert.match(r.prompt(seat.id), /moyu score <category>/);
});
