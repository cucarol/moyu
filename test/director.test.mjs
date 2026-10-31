import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Roulette } from '../server/games/roulette.mjs';
import { ScriptedRoulette } from '../web/play/director/roulette.js';
import { Blackjack } from '../server/games/blackjack.mjs';
import { ScriptedBlackjack } from '../web/play/director/blackjack.js';
import { Yacht } from '../server/games/yacht.mjs';
import { ScriptedYacht } from '../web/play/director/yacht.js';
import sample from '../web/play/director/scripts/sample.js';

const seats = [{ id: 'you', name: '你' }, { id: 'opp', name: '小摸' }];
const seedOf = (k) => (k * 7919).toString(16).padStart(64, '0');
const letters = (shells) => shells.map((x) => (x ? 'L' : 'B')).join('');

// A real game that writes down what its seed drew, as a script would: each load's shells
// (before any move touches them) and the first seat.
class Recorded extends Roulette {
  newLoad() {
    super.newLoad();
    (this.drawn ??= []).push(letters(this.shells));
  }
}

// Plays a real game out with a little policy, and returns it with the script that tells
// the same game: its loads, who went first, and every move with what a 幻觉 made.
function realGame(seed, rules, pick) {
  const g = new Recorded({ seats, seed, rules });
  const first = g.turn;
  const moves = [];
  for (let i = 0; g.phase !== 'over' && i < 500; i++) {
    const who = g.turn;
    const me = g.seat(who);
    const from = g.log.length;
    const slot = me.items.findIndex((x, s) => x && x !== 'refuse' && (pick(i) + s) % 3 !== 0);
    let ok = false;
    if (slot >= 0 && pick(i) % 2) ok = !!g.apply(who, { action: 'use', slot, pick: pick(i) % 4 === 1 ? undefined : g.seat(g.other(who)).items.findIndex((x) => x && x !== 'refuse' && x !== 'jailbreak') }).ok;
    if (ok) {
      const e = g.log.slice(from).find((x) => x.type === 'use');
      const m = { who, use: e.slot };
      if (e.took) m.pick = e.took.slot;
      if (e.made) m.makes = [...e.made.map((x) => `${x.item}:${me.conj[x.slot].fake ? 'fake' : 'real'}`), ...Array(e.lost).fill('cot:real')];
      moves.push(m);
      continue;
    }
    const target = pick(i) % 3 ? 'other' : 'self';
    assert.equal(g.apply(who, { action: 'shoot', target }).ok, true);
    moves.push({ who, shoot: target });
  }
  // the deals, from each load event; items lost to a full hand only count, so any will do
  const loadEvents = g.log.filter((e) => e.type === 'load');
  const loads = g.drawn.map((shells, k) => ({
    shells,
    deal: Object.fromEntries(['you', 'opp'].map((id) => [id, [...loadEvents[k].dealt[id].map((d) => d.item), ...Array(loadEvents[k].lost[id]).fill('cot')]])),
  }));
  return { g, script: { rules, seats: { you: '你', opp: '小摸' }, first, loads }, moves };
}

const strip = (v) => ({ ...v, commit: null, seed: null });

test('a scripted game tells exactly the game the server would, given the same luck', () => {
  const seen = new Set();
  for (let k = 1; k <= 40; k++) {
    for (const rules of ['bo3', 'short']) {
      const { g, script, moves } = realGame(seedOf(k), rules, (i) => i * k + (k >> 1));
      const d = new ScriptedRoulette(script);
      for (const m of moves) d.move(m);
      assert.deepEqual(d.log, g.log, `seed ${k} ${rules}`);
      assert.deepEqual(strip(d.view('you')), strip(g.view('you')));
      assert.deepEqual(strip(d.view('opp')), strip(g.view('opp')));
      for (const e of g.log) {
        if (e.type === 'use') seen.add(e.fake ? 'fake' : e.took ? 'took' : e.item);
        if (e.refused !== undefined) seen.add('refused');
        if (e.type === 'skip' || e.type === 'round_over') seen.add(e.type);
      }
    }
  }
  // every item, a fake, a 越狱 ('took'), a refusal, a 429 skip and a match's rounds came up
  assert.deepEqual([...seen].sort(), ['cache', 'compact', 'cot', 'fake', 'inject', 'limit', 'mirage', 'refused', 'round_over', 'skip', 'temp', 'took']);
});

test('a script that breaks the rules stops with why', () => {
  const base = { start: { turn: 'opp', items: { opp: ['refuse', 'temp:fake'] }, shells: 'LB' } };
  assert.throws(() => new ScriptedRoulette(base).move({ who: 'you', shoot: 'self' }), /turn/);
  assert.throws(() => new ScriptedRoulette(base).move({ who: 'opp', use: 'refuse' }), /never used/);
  assert.throws(() => new ScriptedRoulette(base).move({ who: 'opp', use: 'cot' }), /holds no/);
  assert.throws(() => new ScriptedRoulette({ start: { shells: 'LX' } }), /neither/);
  // a fake one vanishes; the gun runs dry with no load left to come
  const d = new ScriptedRoulette(base);
  d.move({ who: 'opp', use: 'temp' });
  assert.equal(d.log.at(-1).fake, true);
  d.move({ who: 'opp', shoot: 'self' });
  assert.throws(() => d.move({ who: 'you', shoot: 'other' }), /no load/);
});

test('the sample script plays to its end within the rules', () => {
  const d = new ScriptedRoulette(sample);
  for (const b of sample.beats) {
    if (b.say !== undefined) d.say(b.who ?? 'opp', b.say, b.mood);
    if (b.use !== undefined || b.shoot) d.move(b);
  }
  assert.equal(d.phase, 'over');
  assert.equal(d.winner, 'you');
  const used = d.log.filter((e) => e.type === 'use');
  assert.ok(used.some((e) => e.fake) && used.some((e) => e.took) && d.log.some((e) => e.refused !== undefined));
});

// ---- 21 ----------------------------------------------------------------------

// A real 21 game that writes down each hand's deck and who acted first in it.
class RecordedBlackjack extends Blackjack {
  startHand() {
    const before = this.round;
    super.startHand();
    if (this.round > before) (this.drawn ??= []).push({ deck: this.deck.slice(), first: this.first });
  }
}

function realBlackjack(seed, pick) {
  const g = new RecordedBlackjack({ seats, seed });
  const first = g.first;
  const moves = [];
  for (let i = 0; g.phase !== 'over' && i < 500; i++) {
    const who = g.turn;
    const legal = g.legalActions(who);
    // a hand of six stops hitting: busts stay hidden, so a hitter alone would empty the deck
    const act = g.seat(who).hand.length >= 6 && legal.includes('stand') ? 'stand' : legal[pick(i) % legal.length];
    assert.equal(g.apply(who, { action: act }).ok, true);
    moves.push({ who, act });
  }
  // half the hands written as each seat's cards and the draws, half as the raw deck
  const hands = g.drawn.map(({ deck, first: f }, n) => {
    if (n % 2) return { deck };
    const o = f === 'you' ? 'opp' : 'you';
    return { [f]: [deck[0], deck[2]], [o]: [deck[1], deck[3]], draws: deck.slice(4) };
  });
  return { g, script: { seats: { you: '你', opp: '小摸' }, first, hands }, moves };
}

test('a scripted 21 game tells exactly the game the server would', () => {
  const seen = new Set();
  for (let k = 1; k <= 60; k++) {
    const { g, script, moves } = realBlackjack(seedOf(k), (i) => (i * k + (k >> 2)) % 7);
    const d = new ScriptedBlackjack(script);
    for (const m of moves) d.move(m);
    assert.deepEqual(d.log, g.log, `seed ${k}`);
    assert.deepEqual(strip(d.view('you')), strip(g.view('you')));
    assert.deepEqual(strip(d.view('opp')), strip(g.view('opp')));
    for (const e of g.log) seen.add(e.type === 'game_over' ? e.reason : e.type === 'settle' ? e.how : e.type);
  }
  // every act, a fold and a showdown, and a game ended by the hands and by a stack gone
  assert.deepEqual([...seen].sort(), ['allin', 'bet', 'broke', 'call', 'check', 'fold', 'hand_start', 'hands', 'hit', 'raise', 'showdown', 'stand', 'street']);
});

test('a 21 script that breaks the rules stops with why', () => {
  const hand = { you: ['10S', '7H'], opp: ['9D', '8C'], draws: ['2S'] };
  assert.throws(() => new ScriptedBlackjack({ hands: [{ you: ['10S', '7H'], opp: ['9D', '1C'] }] }), /not a card/);
  assert.throws(() => new ScriptedBlackjack({ hands: [{ you: ['10S', '7H'], opp: ['10S', '8C'] }] }), /twice/);
  assert.throws(() => new ScriptedBlackjack({ hands: [hand] }).move({ who: 'opp', act: 'hit' }), /turn/);
  const d = new ScriptedBlackjack({ hands: [hand] });
  d.move({ who: 'you', act: 'bet' });
  assert.throws(() => d.move({ who: 'opp', act: 'hit' }), /can't hit now \(can: call, fold, raise, allin\)/);
  d.move({ who: 'opp', act: 'call' });
  d.move({ who: 'you', act: 'stand' });
  d.move({ who: 'opp', act: 'hit' });
  assert.throws(() => d.move({ who: 'opp', act: 'hit' }), /out of cards/);
  d.move({ who: 'opp', act: 'stand' });
  // the written hands run out: the table waits on a hand that never comes
  d.move({ who: 'you', act: 'check' });
  d.move({ who: 'opp', act: 'check' });
  assert.equal(d.lastHand.winner, 'opp');
  assert.equal(d.turn, null);
  assert.equal(d.phase, 'playing');
});

// ---- Yacht -------------------------------------------------------------------

function realYacht(seed, pick) {
  const g = new Yacht({ seats, seed });
  for (let i = 0; g.phase !== 'over' && i < 500; i++) {
    const who = g.turn;
    const p = pick(i);
    if (g.rollsLeft > 0 && p % 3) {
      const keep = [0, 1, 2, 3].filter((j) => (p >> j) & 1);
      assert.equal(g.apply(who, { action: 'roll', keep }).ok, true);
    } else {
      const open = Object.keys(g.seat(who).sheet).filter((c) => g.seat(who).sheet[c] === null);
      assert.equal(g.apply(who, { action: 'score', category: open[p % open.length] }).ok, true);
    }
  }
  // the script: each turn's first roll, each reroll's new dice, and the scores
  const turns = [];
  const moves = [];
  for (const e of g.log) {
    if (e.type === 'roll' && e.rollNo === 1) turns.push(e.dice);
    else if (e.type === 'roll') moves.push({ who: e.seat, keep: e.kept, roll: e.dice.filter((_, j) => !e.kept.includes(j)) });
    else if (e.type === 'score') moves.push({ who: e.seat, score: e.category });
  }
  return { g, script: { seats: { you: '你', opp: '小摸' }, first: g.log[0].seat, turns }, moves };
}

test('a scripted Yacht game tells exactly the game the server would', () => {
  for (let k = 1; k <= 40; k++) {
    const { g, script, moves } = realYacht(seedOf(k), (i) => (i * 37 + k * 11) % 97);
    const d = new ScriptedYacht(script);
    for (const m of moves) d.move(m);
    assert.deepEqual(d.log, g.log, `seed ${k}`);
    assert.deepEqual(strip(d.view('you')), strip(g.view('you')));
    assert.deepEqual(strip(d.view('opp')), strip(g.view('opp')));
  }
});

test('a Yacht script that breaks the rules stops with why', () => {
  assert.throws(() => new ScriptedYacht({ turns: [[1, 2, 3, 4, 7]] }), /1 to 6/);
  assert.throws(() => new ScriptedYacht({ turns: [[1, 2, 3]] }), /five/);
  const d = new ScriptedYacht({ turns: [[6, 6, 2, 3, 6], [1, 1, 1, 1, 1]] });
  assert.throws(() => d.move({ who: 'opp', score: 'sixes' }), /turn/);
  assert.throws(() => d.move({ who: 'you', keep: [0, 1, 4], roll: [6] }), /needs 2/);
  d.move({ who: 'you', keep: [0, 1, 4], roll: [6, 1] });
  d.move({ who: 'you', keep: [0, 1, 2, 4], roll: [6] });
  assert.throws(() => d.move({ who: 'you', keep: [], roll: [1, 1, 1, 1, 1] }), /no rolls left/);
  assert.throws(() => d.move({ who: 'you', score: 'pairs' }), /no category/);
  d.move({ who: 'you', score: 'yacht' });
  assert.equal(d.log.find((e) => e.type === 'score').points, 50);
  d.move({ who: 'opp', score: 'yacht' });
  // the written turns run out: the table waits on the next
  assert.equal(d.turn, 'you');
  assert.deepEqual(d.view().legal, []);
});
