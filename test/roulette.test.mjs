import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Roulette, loadFor, ROUNDS, HAND, POOL, SHORT, text } from '../server/games/roulette.mjs';
import { Table } from '../server/table.mjs';

const seats = [{ id: 'human', name: 'H' }, { id: 'agent', name: 'A' }];
const SEED = 'ab'.repeat(32);
const seedOf = (k) => k.toString(16).padStart(64, '0');
const short = (seed) => new Roulette({ seats, seed, rules: 'short' });

// Plays a whole game with a fixed little policy: use the first item if any, else shoot.
function playOut(g, pick = (i) => i) {
  for (let i = 0; g.phase !== 'over' && i < 500; i++) {
    const me = g.seat(g.turn);
    const slot = me.items.findIndex((x) => x && x !== 'refuse');
    // An item that can't be used right now (越狱 with nothing to take) says so; then shoot.
    if (slot >= 0 && pick(i) % 2 && g.apply(g.turn, { action: 'use', slot }).ok) continue;
    assert.equal(g.apply(g.turn, { action: 'shoot', target: pick(i) % 3 ? 'other' : 'self' }).ok, true);
  }
}

test('loads follow the seed and stay within the rules', () => {
  for (let k = 1; k < 60; k++) {
    const { live, blank, shells } = loadFor(SEED, k);
    assert.ok(shells.length >= 3 && shells.length <= 8);
    assert.ok(live >= 1 && blank >= 1);
    assert.equal(shells.filter(Boolean).length, live);
    assert.deepEqual(loadFor(SEED, k), { live, blank, shells });
  }
});

test('a whole game ends with one seat out of 额度, and replays exactly from the seed', () => {
  const g = new Roulette({ seats, seed: SEED });
  playOut(g);
  for (let k = 1; k < 30; k++) {
    // Many seeds and policies, so every item turns up and gets used somewhere.
    const h = new Roulette({ seats, seed: k.toString(16).padStart(64, '0') });
    playOut(h, (i) => i * k + (k >> 1));
    assert.deepEqual(Roulette.replay(h.seed, seats, h.log).log, h.log);
  }
  assert.equal(g.phase, 'over');
  const loser = g.seats.find((s) => s.hp === 0);
  assert.ok(loser);
  assert.equal(g.winner, g.other(loser.id));
  const again = Roulette.replay(SEED, seats, g.log);
  assert.deepEqual(again.log, g.log);
});

test('a match is best of three: each round deals and loads by its table, and the loser opens the next', () => {
  for (let k = 1; k < 40; k++) {
    const g = new Roulette({ seats, seed: seedOf(k) });
    playOut(g, (i) => i * k + (k >> 1));
    const rounds = g.log.filter((e) => e.type === 'round_over');
    assert.equal(Math.max(...Object.values(g.wins)), 2);
    assert.ok(rounds.length === 2 || rounds.length === 3);
    assert.equal(rounds.at(-1).winner, g.winner);
    assert.deepEqual(g.log.at(-1).wins, g.wins);
    let stage = 1;
    for (const [i, e] of g.log.entries()) {
      if (e.type === 'round_over') stage++;
      if (e.type !== 'load') continue;
      const r = ROUNDS[e.stage - 1];
      assert.equal(e.stage, stage);
      assert.ok(e.live + e.blank >= r.shells[0] && e.live + e.blank <= r.shells[1]);
      for (const s of seats) assert.equal(e.dealt[s.id].length + e.lost[s.id], r.deal);
      // A new round: the loser of the last one has the gun.
      const prev = g.log[i - 1];
      if (prev?.type === 'round_over') {
        const next = g.log.slice(i + 1).find((x) => x.seat);
        assert.equal(next.seat, g.other(prev.winner));
      }
    }
    assert.deepEqual(Roulette.replay(g.seed, seats, g.log).log, g.log);
  }
});

test('a short game is round 3 on its own: 4 额度, first to run the other out wins, and it replays from the seed', () => {
  for (let k = 1; k < 40; k++) {
    const g = new Roulette({ seats, seed: seedOf(k), rules: 'short' });
    assert.deepEqual(SHORT, ROUNDS[2]);
    assert.equal(g.maxHp, 4);
    assert.equal(g.stage, null);
    assert.deepEqual(g.pool, POOL); // 幻觉 is the mirage one
    for (const s of g.seats) assert.equal(s.items.length, HAND);
    playOut(g, (i) => i * k + (k >> 1));
    assert.equal(g.phase, 'over');
    assert.equal(g.log.filter((e) => e.type === 'round_over').length, 0);
    const loser = g.seats.find((s) => s.hp <= 0);
    assert.equal(g.winner, g.other(loser.id));
    assert.equal(g.log.at(-1).wins, undefined);
    for (const e of g.log.filter((x) => x.type === 'load')) {
      assert.equal(e.stage ?? null, null);
      assert.ok(e.live + e.blank >= SHORT.shells[0] && e.live + e.blank <= SHORT.shells[1]);
      for (const s of seats) assert.equal(e.dealt[s.id].length + e.lost[s.id], SHORT.deal);
    }
    // Verify replays it with its own rules (the reveal carries them); as a match it would differ.
    assert.deepEqual(Roulette.replay(g.seed, seats, g.log, g).log, g.log);
    assert.deepEqual(Roulette.replay(g.seed, seats, g.log, { rules: 'short' }).log, g.log);
  }
  // 断线 as in round 3: at 1 额度, 缓存命中 heals nothing; above it, it does.
  const { g, a } = rigged([true, false], ['cache', 'cache'], [], new Roulette({ seats, seed: SEED, rules: 'short' }));
  g.seat(a).hp = 1;
  assert.equal(g.view(a).seats.find((s) => s.id === a).cut, true);
  g.apply(a, { action: 'use', slot: 0 });
  assert.equal(g.seat(a).hp, 1);
  g.seat(a).hp = 2;
  g.apply(a, { action: 'use', slot: 1 });
  assert.equal(g.seat(a).hp, 3);
});

test("a short game's agent text never talks of rounds", () => {
  for (let k = 1; k < 12; k++) {
    const t = new Table({ game: 'roulette', rules: 'short' });
    assert.equal(t.game.rules, 'short');
    playOut(t.game, (i) => i * k + 1);
    const name = (id) => (id === 'agent' ? 'You' : 'H');
    const lines = [text.board(t.game, 'agent', name, 'zh-CN'), ...t.game.log.map((e) => text.describe(t.game, e, 'agent', name, 'zh-CN'))].filter(Boolean);
    for (const l of lines) assert.doesNotMatch(l, /round|match/i);
    assert.match(lines.at(-1), /ran out of/);
    assert.match(lines[1], /^— Load 1: /);
  }
  // Unknown rules are refused; games without rule sets ignore them.
  assert.throws(() => new Table({ game: 'roulette', rules: 'long' }), /unknown rules for roulette: long; one of bo3, short/);
  assert.equal(new Table({ game: 'roulette' }).game.rules, 'bo3');
  assert.equal(new Table({ game: 'blackjack', rules: 'short' }).kind, 'blackjack');
});

test('the hand holds six; a new round fills the 额度 and keeps the items', () => {
  const { g, a, b } = rigged([true, false], [], [], new Roulette({ seats, seed: SEED }));
  assert.equal(g.seat(a).items.length, HAND);
  g.seat(a).items = ['cot', 'cot', 'cot', 'cot', 'cot', null];
  g.seat(b).hp = 1;
  g.apply(a, { action: 'shoot', target: 'other' });
  const { stage, winner, wins } = g.log.find((e) => e.type === 'round_over');
  assert.deepEqual({ stage, winner, wins }, { stage: 1, winner: a, wins: { [a]: 1, [b]: 0 } });
  assert.equal(g.stage, 2);
  assert.equal(g.turn, b);
  for (const s of g.seats) assert.equal(s.hp, ROUNDS[1].hp);
  const load = g.log.at(-1);
  assert.equal(load.dealt[a].length, 1); // one slot was left, the other is lost
  assert.equal(load.lost[a], 1);
  assert.deepEqual(g.seat(a).items.slice(0, 5), ['cot', 'cot', 'cot', 'cot', 'cot']);
  assert.equal(g.view(a).maxHp, ROUNDS[1].hp);
});

test('幻觉 conjures two items; each is real or fake, and nobody sees which until it is used', () => {
  const state = (g) => JSON.stringify({ know: g.know, double: g.double, skip: g.skip, shells: g.shells, hp: g.seats.map((s) => s.hp) });
  const kinds = new Set();
  for (let k = 0; k < 40; k++) {
    const g = new Roulette({ seats, seed: seedOf(k) });
    const { a, b } = rigged([true, false, true], ['mirage'], [], g);
    g.seat(a).hp = 1;
    g.apply(a, { action: 'use', item: 'mirage' });
    const made = g.log.at(-1).made;
    assert.equal(made.length, 2);
    assert.equal(made[0].slot, 0);
    for (const m of made) {
      assert.ok(POOL.includes(m.item) && m.item !== 'mirage');
      assert.equal(g.seat(a).items[m.slot], m.item);
    }
    assert.ok(!JSON.stringify([g.view(a), g.view(b)]).includes('fake'));
    assert.equal(g.view(b).seats.find((s) => s.id === a).conjured.filter(Boolean).length, 2);
    // Use the first: a fake one vanishes and changes nothing else.
    if (made[0].item === 'refuse' || made[0].item === 'jailbreak') continue;
    const fake = g.seat(a).conj[0].fake;
    const before = state(g);
    assert.equal(g.apply(a, { action: 'use', slot: 0 }).ok, true);
    assert.equal(!!g.log.at(-1).fake, fake);
    assert.equal(g.seat(a).items[0], null);
    assert.equal(g.seat(a).conj[0], null);
    if (fake) assert.equal(state(g), before);
    kinds.add(fake);
  }
  assert.equal(kinds.size, 2);
});

test('a 幻觉 refusal may refuse nothing; 越狱 on a fake takes a 幻觉', () => {
  const g = new Roulette({ seats, seed: SEED });
  const { a, b } = rigged([true, true, false], ['jailbreak'], ['refuse', 'cot'], g);
  g.seat(b).conj[0] = { fake: true };
  g.seat(b).conj[1] = { fake: true };
  g.apply(a, { action: 'use', item: 'jailbreak', pick: 'cot' });
  assert.equal(g.log.at(-1).took.fake, true);
  assert.equal(g.view(a).know, null);
  g.apply(a, { action: 'shoot', target: 'other' });
  const shot = g.log.at(-1);
  assert.equal(shot.refuseFake, 0);
  assert.equal(shot.damage, 1);
  assert.equal(g.seat(b).items[0], null);
});

test('断线: in the last round, at 1 额度, 缓存命中 heals nothing', () => {
  const g = new Roulette({ seats, seed: SEED });
  g.stage = 3;
  g.maxHp = ROUNDS[2].hp;
  const { a } = rigged([true, false], ['cache', 'cache'], [], g);
  g.seat(a).hp = 2;
  g.apply(a, { action: 'use', item: 'cache' });
  assert.equal(g.seat(a).hp, 3);
  g.seat(a).hp = 1;
  assert.equal(g.view(a).seats.find((s) => s.id === a).cut, true);
  g.apply(a, { action: 'use', item: 'cache' });
  assert.equal(g.seat(a).hp, 1);
  assert.equal(g.log.at(-1).cut, true);
});

test('a game from before the current rules or pool is refused, so the store skips it', () => {
  const g = new Roulette({ seats, seed: SEED });
  assert.equal(Roulette.fromJSON(JSON.parse(JSON.stringify(g))).rules, 'bo3');
  const single = { ...JSON.parse(JSON.stringify(g)), rules: 'single' };
  assert.throws(() => Roulette.fromJSON(single), /before the current rules/);
  const retired = { ...JSON.parse(JSON.stringify(g)), pool: [...POOL, 'halluc'] };
  assert.throws(() => Roulette.fromJSON(retired), /before the current rules/);
});

test('peeks are private and the order stays sealed', () => {
  const g = new Roulette({ seats, seed: SEED });
  g.seat(g.turn).items[0] = 'cot';
  const peeker = g.turn;
  g.apply(peeker, { action: 'use', item: 'cot' });
  assert.equal(g.view(peeker).know.live, g.shells[0]);
  assert.equal(g.view(g.other(peeker)).know, null);
  const v = JSON.stringify(g.view(g.other(peeker)));
  assert.ok(!v.includes('"shells"'));
  assert.equal(g.view(peeker).seed, null);
});

// A fresh game with the turn on a, a known gun, and the given hands.
function rigged(shells, mine, theirs = [], g = short(SEED)) {
  const a = g.turn;
  const b = g.other(a);
  const n = g.seat(a).items.length;
  g.shells = shells;
  g.seat(a).items = [...mine, ...Array(n).fill(null)].slice(0, n);
  g.seat(b).items = [...theirs, ...Array(n).fill(null)].slice(0, n);
  return { g, a, b };
}

test('what you know leaves with the shell; 越狱 takes the one you pick and uses it at once', () => {
  const { g, a, b } = rigged([true, false, false], ['cot', 'compact', 'jailbreak'], ['refuse', 'cot', 'limit']);
  g.apply(a, { action: 'use', item: 'cot' });
  assert.deepEqual(g.view(a).know, { live: true, sure: true });
  g.apply(a, { action: 'use', item: 'compact' }); // the known shell leaves the gun
  assert.equal(g.view(a).know, null);

  assert.match(g.apply(a, { action: 'use', item: 'jailbreak', pick: 'refuse' }).error, /can't take/);
  assert.equal(g.apply(a, { action: 'use', item: 'jailbreak', pick: 'cot' }).ok, true);
  assert.ok(!g.seat(b).items.includes('cot'));
  assert.equal(g.log.at(-1).took.item, 'cot');
  assert.deepEqual(g.view(a).know, { live: false, sure: true });
});

test('温度拉满 and 429 do not stack, so a second one stays in your hand', () => {
  const { g, a } = rigged([true, false, false], ['temp', 'temp', 'limit', 'limit']);
  assert.equal(g.apply(a, { action: 'use', item: 'temp' }).ok, true);
  assert.match(g.apply(a, { action: 'use', item: 'temp' }).error, /already on/);
  assert.equal(g.apply(a, { action: 'use', item: 'limit' }).ok, true);
  assert.match(g.apply(a, { action: 'use', item: 'limit' }).error, /already rate-limited/);
  assert.deepEqual(g.seat(a).items.filter(Boolean), ['temp', 'limit']);
});

test('the refusal soaks a live hit; blanks on yourself keep the gun', () => {
  const { g, a, b } = rigged([true, false, false], [], ['refuse'], new Roulette({ seats, seed: SEED }));
  g.apply(a, { action: 'shoot', target: 'other' });
  assert.equal(g.seat(b).hp, ROUNDS[0].hp);
  assert.equal(g.seat(b).items[0], null);
  assert.equal(g.turn, b);
  g.apply(b, { action: 'shoot', target: 'self' });
  assert.equal(g.turn, b);
});

test('a roulette table wakes the agent on every move, and tells it how to act on its turn', () => {
  const t = new Table({ game: 'roulette', lang: 'zh-CN' }); // the Chinese item names, whatever this machine's locale
  const agent = t.seats[1];
  const human = t.seats[0];
  if (t.game.turn === 'agent') t.act(agent, { action: 'shoot', target: 'other' });
  if (t.game.phase === 'over' || t.game.turn !== 'human') return;
  t.game.shells[0] = false;
  t.act(human, { action: 'shoot', target: 'self' }); // a blank: still the human's turn
  const seen = t.agentUpdate(agent);
  assert.match(seen, /shot themself: blank/);
  assert.match(seen, /Waiting on /);
  assert.equal(t.agentUpdate(agent), null); // nothing new since
  t.act(human, { action: 'shoot', target: 'other' });
  const text = t.agentUpdate(agent);
  assert.match(text, /Your turn: .*moyu shoot me \| moyu shoot you/);
  assert.match(text, /额度/);
});

test('roulette tables survive a save and load', () => {
  const t = new Table({ game: 'roulette', lang: 'zh-CN' });
  const back = Table.fromJSON(JSON.parse(JSON.stringify(t)));
  assert.equal(back.kind, 'roulette');
  assert.deepEqual(back.game.view('human'), t.game.view('human'));
});

test('verify agrees on the fields both logs have, so a field added later passes and a changed one fails', async () => {
  const { sameLog } = await import('../server/seal.mjs');
  const g = new Roulette({ seats, seed: SEED });
  playOut(g);
  const now = Roulette.replay(SEED, seats, g.log).log;
  const before = structuredClone(g.log);
  for (const e of before) delete e.max; // logged before events carried max
  assert.ok(sameLog(now, before));
  const forged = structuredClone(g.log);
  const shot = forged.find((e) => e.type === 'shoot');
  shot.live = !shot.live;
  assert.ok(!sameLog(now, forged));
  assert.ok(!sameLog(now, g.log.slice(1)));
});

test('a run of moves that is not the agent cue comes as one wake, a moment later; its turn comes at once', async () => {
  const was = Table.BATCH_MS;
  Table.BATCH_MS = 30;
  try {
    const t = new Table({ game: 'roulette', lang: 'zh-CN' });
    const [human, agent] = t.seats;
    if (t.game.turn === 'agent') t.act(agent, { action: 'shoot', target: 'other' });
    if (t.game.phase === 'over' || t.game.turn !== 'human') return;
    const sent = [];
    t.subs.add({ seat: agent, send: (x) => sent.push(x), close() {} });
    t.agentUpdate(agent);
    t.game.shells.splice(0, 2, false, false);
    t.game.seat('human').items[0] = 'cot';
    t.act(human, { action: 'use', slot: 0 });
    t.act(human, { action: 'shoot', target: 'self' });
    assert.equal(sent.length, 0);
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(sent.length, 1);
    assert.match(sent[0], /used 思维链[\s\S]*shot themself: blank[\s\S]*Waiting on/);
    t.act(human, { action: 'shoot', target: 'other' });
    assert.equal(sent.length, 2, 'the gun passing to the agent is told at once');
    assert.match(sent[1], /Your turn/);
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(sent.length, 2);
  } finally {
    Table.BATCH_MS = was;
  }
});

test('the agent can set a mood on its moves and lines; the board numbers its hand for --slot', () => {
  const t = new Table({ game: 'roulette', lang: 'zh-CN' });
  const [human, agent] = t.seats;
  if (t.game.turn === 'human') t.act(human, { action: 'shoot', target: 'other' });
  if (t.game.phase === 'over' || t.game.turn !== 'agent') return;
  assert.match(t.act(agent, { action: 'shoot', target: 'self', mood: 'giddy' }).error, /unknown mood: giddy; one of happy/);
  const from = t.game.log.length;
  t.game.seat('agent').items = ['cot', null, 'cot', null, null, null];
  t.game.seat('agent').conj[0] = { fake: false };
  assert.match(t.board('agent'), /You hold: \[1\] 思维链 \(cot, from 幻觉: real or fake\), \[3\] 思维链 \(cot\)/);
  t.act(agent, { action: 'use', slot: 0, mood: 'smug' });
  assert.equal(t.game.log[from].mood, 'smug');
  assert.equal(t.game.log[from].slot, 0);
  t.say(agent, '嘿嘿', 'squint');
  assert.equal(t.chat.at(-1).mood, 'squint');
});
