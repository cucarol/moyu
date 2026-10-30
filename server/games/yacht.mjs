// Yacht dice, the original rules: five dice, up to three rolls a turn keeping any between
// them, twelve categories each filled once, +35 when the upper six reach 63. No bets:
// the higher total wins. Rules: docs/yacht.md.
import { commitOf, sealedInts } from '../seal.mjs';

export const CATEGORIES = {
  ones: { name: '1 点', upper: 1 },
  twos: { name: '2 点', upper: 2 },
  threes: { name: '3 点', upper: 3 },
  fours: { name: '4 点', upper: 4 },
  fives: { name: '5 点', upper: 5 },
  sixes: { name: '6 点', upper: 6 },
  choice: { name: '全选', does: 'sum of all dice' },
  four: { name: '四条', does: 'four the same: sum of all dice' },
  house: { name: '葫芦', does: 'three and two: sum of all dice' },
  small: { name: '小顺', does: 'four in a row: 15' },
  large: { name: '大顺', does: 'five in a row: 30' },
  yacht: { name: '快艇', does: 'five the same: 50' },
};
const CAT_IDS = Object.keys(CATEGORIES);
const UPPER = CAT_IDS.slice(0, 6);
export const BONUS_AT = 63;
export const BONUS = 35;
const ROLLS = 3;

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

export function scoreFor(category, dice) {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dice) counts[d]++;
  const run = (n) => [1, 2, 3, 4, 5, 6].some((start) => start + n - 1 <= 6 && [...Array(n).keys()].every((i) => counts[start + i] > 0));
  const c = CATEGORIES[category];
  if (c.upper) return counts[c.upper] * c.upper;
  switch (category) {
    case 'choice': return sum(dice);
    case 'four': return counts.some((n) => n >= 4) ? sum(dice) : 0;
    case 'house': return counts.includes(3) && counts.includes(2) ? sum(dice) : 0;
    case 'small': return run(4) ? 15 : 0;
    case 'large': return run(5) ? 30 : 0;
    case 'yacht': return counts.includes(5) ? 50 : 0;
  }
}

export function sheetTotals(sheet) {
  const upper = sum(UPPER.map((c) => sheet[c] ?? 0));
  const bonus = upper >= BONUS_AT ? BONUS : 0;
  return { upper, bonus, total: sum(CAT_IDS.map((c) => sheet[c] ?? 0)) + bonus };
}

// Turn t's dice: one stream per turn, read in order. The first roll takes five values,
// each reroll the next ones, one per rerolled die.
function diceFor(seed, t, count) {
  const int = sealedInts(seed, `dice:${t}`);
  return Array.from({ length: count }, () => 1 + int(6));
}

export class Yacht {
  constructor({ seats, seed }) {
    this.seed = seed;
    this.rounds = CAT_IDS.length;
    this.phase = 'playing';
    this.seats = seats.map(({ id, name }) => ({ id, name, sheet: Object.fromEntries(CAT_IDS.map((c) => [c, null])) }));
    this.turn = this.seats[sealedInts(seed, 'first')(2)].id;
    this.turnNo = 0; // turns played so far, both seats
    this.dice = [];
    this.kept = [false, false, false, false, false];
    this.rollsLeft = 0;
    this.drawn = 0; // values taken from this turn's stream
    this.winner = null;
    this.log = [];
    this.startTurn();
  }

  toJSON() {
    const { seed, rounds, phase, seats, turn, turnNo, dice, kept, rollsLeft, drawn, winner, log } = this;
    return structuredClone({ seed, rounds, phase, seats, turn, turnNo, dice, kept, rollsLeft, drawn, winner, log });
  }

  static fromJSON(data) {
    const g = Object.create(Yacht.prototype);
    Object.assign(g, structuredClone(data));
    return g;
  }

  // The seat's own turn number, 1 to 12; shown as the round.
  get round() {
    return Math.min(this.rounds, Math.floor(this.turnNo / 2) + 1);
  }

  seat(id) {
    return this.seats.find((s) => s.id === id);
  }

  other(id) {
    return this.seats.find((s) => s.id !== id).id;
  }

  emit(type, data = {}) {
    this.log.push({ seq: this.log.length, round: this.round, type, ...data });
  }

  startTurn() {
    this.dice = [0, 0, 0, 0, 0];
    this.kept = [false, false, false, false, false];
    this.drawn = 0;
    this.rollsLeft = ROLLS;
    this.roll([]);
  }

  // Reroll every die not kept, left to right, from the turn's stream.
  roll(keep) {
    const values = diceFor(this.seed, this.turnNo, this.drawn + 5);
    this.kept = this.dice.map((_, i) => keep.includes(i));
    for (let i = 0; i < 5; i++) if (!this.kept[i]) this.dice[i] = values[this.drawn++];
    this.rollsLeft--;
    this.emit('roll', { seat: this.turn, dice: this.dice.slice(), kept: keep.slice().sort(), rollNo: ROLLS - this.rollsLeft });
  }

  waitingOn() {
    return this.phase === 'playing' ? [this.turn] : [];
  }

  legalActions(seatId) {
    if (this.phase !== 'playing' || this.turn !== seatId) return [];
    return this.rollsLeft > 0 ? ['roll', 'score'] : ['score'];
  }

  // { action: 'roll', keep: [die indexes 0-4] } · { action: 'score', category } · { action: 'quit' }
  apply(seatId, input) {
    if (input.action === 'quit') return this.quit(seatId);
    if (this.phase !== 'playing') return { error: 'the game is over' };
    if (this.turn !== seatId) return { error: 'not your turn' };
    if (input.action === 'roll') {
      if (this.rollsLeft <= 0) return { error: 'no rolls left: score the dice' };
      const keep = [...new Set((input.keep ?? []).map(Number))];
      if (keep.some((i) => !(Number.isInteger(i) && i >= 0 && i < 5))) return { error: 'keep takes die positions' };
      if (keep.length === 5) return { error: 'keeping all five rolls nothing: score instead' };
      this.roll(keep);
      return { ok: true };
    }
    if (input.action === 'score') {
      const me = this.seat(seatId);
      const c = input.category;
      if (!(c in CATEGORIES)) return { error: `no category ${c}; one of ${CAT_IDS.join(', ')}` };
      if (me.sheet[c] !== null) return { error: `${c} is already filled` };
      const points = scoreFor(c, this.dice);
      me.sheet[c] = points;
      this.emit('score', { seat: seatId, category: c, points, dice: this.dice.slice(), total: sheetTotals(me.sheet).total });
      this.turnNo++;
      if (this.seats.every((s) => CAT_IDS.every((x) => s.sheet[x] !== null))) return this.finish('done');
      this.turn = this.other(seatId);
      this.startTurn();
      return { ok: true };
    }
    return { error: `unknown action: ${input.action}` };
  }

  quit(seatId) {
    if (this.phase === 'over') return { error: 'the game is over' };
    this.emit('quit', { seat: seatId });
    return this.finish('quit');
  }

  finish(reason) {
    this.phase = 'over';
    this.turn = null;
    const totals = Object.fromEntries(this.seats.map((s) => [s.id, sheetTotals(s.sheet).total]));
    const [a, b] = this.seats;
    this.winner = totals[a.id] > totals[b.id] ? a.id : totals[b.id] > totals[a.id] ? b.id : null;
    this.emit('game_over', { reason, winner: this.winner, totals });
    return { ok: true };
  }

  // Everything is public except the dice not rolled yet.
  view(seatId) {
    const over = this.phase === 'over';
    const mover = this.turn && this.seat(this.turn);
    return {
      game: 'yacht',
      you: seatId,
      round: this.round,
      rounds: this.rounds,
      phase: this.phase,
      turn: this.turn,
      turnNo: this.turnNo,
      dice: this.dice.slice(),
      kept: this.kept.slice(),
      rollsLeft: this.rollsLeft,
      // what the dice would score in each open category of the seat to move
      options: mover ? Object.fromEntries(CAT_IDS.filter((c) => mover.sheet[c] === null).map((c) => [c, scoreFor(c, this.dice)])) : {},
      seats: this.seats.map((s) => ({ id: s.id, name: s.name, sheet: { ...s.sheet }, ...sheetTotals(s.sheet) })),
      winner: this.winner,
      waitingOn: this.waitingOn(),
      legal: this.legalActions(seatId),
      commit: commitOf(this.seed),
      seed: over ? this.seed : null,
      log: this.log,
    };
  }

  // Re-run a whole game from the seed and the logged actions; verify compares logs.
  static replay(seed, seats, log) {
    const g = new Yacht({ seats, seed });
    for (const e of log) {
      if (e.type === 'roll' && e.rollNo > 1) g.apply(e.seat, { action: 'roll', keep: e.kept });
      else if (e.type === 'score') g.apply(e.seat, { action: 'score', category: e.category });
      else if (e.type === 'quit') g.apply(e.seat, { action: 'quit' });
    }
    return g;
  }
}

// ---- text for agent seats ----------------------------------------------------

const sheetLine = (s) =>
  CAT_IDS.map((c) => `${c} ${s.sheet[c] ?? '-'}`).join(' · ') + ` | upper ${s.upper}/${BONUS_AT}${s.bonus ? ` +${BONUS}` : ''} · total ${s.total}`;

export const text = {
  board(g, viewer, name) {
    const v = g.view(viewer);
    const lines = [`Turn ${v.round}/${v.rounds}`];
    for (const s of v.seats) lines.push(`${name(s.id)}: ${sheetLine(s)}`);
    if (v.turn) {
      lines.push(`Dice (${name(v.turn)}): ${v.dice.map((d, i) => `${i + 1}:${d}${v.kept[i] ? '*' : ''}`).join(' ')} · ${v.rollsLeft} reroll${v.rollsLeft === 1 ? '' : 's'} left`);
      if (v.turn === viewer) lines.push(`Would score: ${Object.entries(v.options).map(([c, p]) => `${c} ${p}`).join(', ')}`);
    }
    return lines.join('\n');
  },

  prompt(g, viewer, tableId) {
    const roll = g.rollsLeft > 0 ? 'moyu keep <positions 1-5 to keep, rerolls the rest> | ' : '';
    return `Your move: ${roll}moyu score <category>  (--table ${tableId} [--say "..."])`;
  },

  describe(g, e, viewer, name) {
    const s = (id) => (id === viewer ? '' : 's');
    switch (e.type) {
      case 'roll':
        return e.rollNo === 1
          ? `${name(e.seat)} roll${s(e.seat)}: ${e.dice.join(' ')}.`
          : `${name(e.seat)} keep${s(e.seat)} ${e.kept.length ? e.kept.map((i) => e.dice[i]).join(' ') : 'nothing'} and reroll${s(e.seat)}: ${e.dice.join(' ')}.`;
      case 'score': return `${name(e.seat)} score${s(e.seat)} ${e.points} in ${e.category} (${CATEGORIES[e.category].name}) with ${e.dice.join(' ')} → ${e.total}.`;
      case 'quit': return `${name(e.seat)} ended the game.`;
      case 'game_over': return `${e.winner ? `${name(e.winner)} win${s(e.winner)}` : 'A draw'}: ${Object.entries(e.totals).map(([id, n]) => `${name(id)} ${n}`).join(', ')}.`;
      default: return null;
    }
  },
};
