// Heads-up 21: two equal players and no dealer. Each hand both ante, each gets an up
// card and a hole card, and they take turns: hit, stand, or once a hand double, which
// the other must call or fold. Busts stay hidden until the showdown. Stacks are tokens;
// after eight hands, or when someone can't cover the ante, the bigger stack wins.
// Rules: docs/blackjack.md.
import { commitOf, sealedInts, sealedShuffle } from '../seal.mjs';

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['S', 'H', 'D', 'C'];
export const START_STACK = 1_000_000;
export const ANTES = [50_000, 50_000, 100_000, 100_000, 200_000, 200_000, 400_000, 400_000];
const FORMAT = 2; // v1 was the dealer game; its saves don't load

// Hand n's deck follows from the table seed, so the reveal covers every hand.
export function deckFor(seed, n) {
  const cards = [];
  for (const s of SUITS) for (const r of RANKS) cards.push(r + s);
  return sealedShuffle(cards, commitOf(`${seed}:hand:${n}`));
}

export function rankOf(card) {
  return card.slice(0, -1);
}

export function handTotal(hand) {
  let total = 0;
  let aces = 0;
  for (const card of hand) {
    const r = rankOf(card);
    if (r === 'A') { total += 11; aces++; }
    else if (r === 'J' || r === 'Q' || r === 'K') total += 10;
    else total += Number(r);
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return { total, soft: aces > 0 };
}

const isNatural = (hand) => hand.length === 2 && handTotal(hand).total === 21;
// The cards the other seat sees: all but the hole card (index 1).
const faceUp = (hand) => hand.filter((_, i) => i !== 1);

// Positive when a beats b at the showdown.
function compare(a, b) {
  const ta = handTotal(a).total;
  const tb = handTotal(b).total;
  if (ta > 21 || tb > 21) return (tb > 21) - (ta > 21);
  if (ta !== tb) return ta - tb;
  return isNatural(a) - isNatural(b);
}

export class Blackjack {
  constructor({ seats, seed }) {
    this.seed = seed;
    this.rounds = ANTES.length;
    this.round = 0; // the hand number
    this.phase = 'playing';
    this.seats = seats.map(({ id, name }) => ({ id, name, stack: START_STACK, stake: 0, hand: [], stood: false, acted: false, doubled: false }));
    this.first = this.seats[sealedInts(seed, 'first')(2)].id;
    this.turn = null;
    this.turnNo = 0;
    this.facing = null; // the seat that must call or fold a double
    this.pos = 0;
    this.lastHand = null;
    this.winner = null;
    this.log = [];
    this.startHand();
  }

  // The deck is left out: it follows from the seed and the hand number.
  toJSON() {
    const { seed, rounds, round, phase, seats, first, turn, turnNo, facing, pos, lastHand, winner, log } = this;
    return structuredClone({ format: FORMAT, seed, rounds, round, phase, seats, first, turn, turnNo, facing, pos, lastHand, winner, log });
  }

  static fromJSON(data) {
    if (data.format !== FORMAT) throw new Error('a blackjack table from the old dealer version');
    const g = Object.create(Blackjack.prototype);
    const { format, ...rest } = structuredClone(data);
    Object.assign(g, rest);
    g.deck = deckFor(g.seed, g.round);
    return g;
  }

  seat(id) {
    return this.seats.find((s) => s.id === id);
  }

  other(id) {
    return this.seats.find((s) => s.id !== id).id;
  }

  get ante() {
    return ANTES[this.round - 1];
  }

  get pot() {
    return this.seats.reduce((n, s) => n + s.stake, 0);
  }

  emit(type, data = {}) {
    this.log.push({ seq: this.log.length, round: this.round, type, ...data });
  }

  draw() {
    return this.deck[this.pos++];
  }

  startHand() {
    if (this.round >= ANTES.length) return this.finish('hands');
    const ante = ANTES[this.round];
    if (this.seats.some((s) => s.stack < ante)) return this.finish('broke');
    this.round++;
    this.deck = deckFor(this.seed, this.round);
    this.pos = 0;
    // Hand 1's first actor is drawn; after that it alternates.
    const first = this.round === 1 ? this.first : this.other(this.first);
    this.first = first;
    const order = [first, this.other(first)];
    for (const s of this.seats) Object.assign(s, { stack: s.stack - ante, stake: ante, hand: [], stood: false, acted: false, doubled: false });
    for (let i = 0; i < 2; i++) for (const id of order) this.seat(id).hand.push(this.draw());
    this.turn = first;
    this.facing = null;
    this.turnNo++;
    this.emit('hand_start', { ante, first, up: Object.fromEntries(order.map((id) => [id, this.seat(id).hand[0]])) });
  }

  waitingOn() {
    return this.phase === 'playing' ? [this.turn] : [];
  }

  legalActions(seatId) {
    if (this.phase !== 'playing' || this.turn !== seatId) return [];
    if (this.facing === seatId) return ['call', 'fold'];
    const me = this.seat(seatId);
    const actions = ['hit', 'stand'];
    if (!me.acted && this.seats.every((s) => s.stack >= this.ante)) actions.push('double');
    return actions;
  }

  // { action: 'hit' | 'stand' | 'double' | 'call' | 'fold' | 'quit' }
  apply(seatId, { action }) {
    if (action === 'quit') return this.quit(seatId);
    if (this.phase !== 'playing') return { error: 'the game is over' };
    if (this.turn !== seatId) return { error: 'not your turn' };
    if (!this.legalActions(seatId).includes(action)) return { error: this.facing === seatId ? 'call or fold the double first' : `cannot ${action} now` };
    const me = this.seat(seatId);
    const o = this.other(seatId);
    switch (action) {
      case 'hit': {
        const card = this.draw();
        me.hand.push(card);
        me.acted = true;
        this.emit('hit', { seat: seatId, card });
        break;
      }
      case 'stand':
        me.stood = me.acted = true;
        this.emit('stand', { seat: seatId });
        break;
      case 'double': {
        me.stack -= this.ante;
        me.stake += this.ante;
        const card = this.draw();
        me.hand.push(card);
        me.stood = me.acted = me.doubled = true;
        this.emit('double', { seat: seatId, card, amount: this.ante });
        this.facing = o;
        this.turn = o;
        this.turnNo++;
        return { ok: true };
      }
      case 'call':
        me.stack -= this.ante;
        me.stake += this.ante;
        this.facing = null;
        this.emit('call', { seat: seatId, amount: this.ante });
        // A call isn't a turn: the caller goes on to play its hand, if it still has one.
        if (!me.stood) {
          this.turnNo++;
          return { ok: true };
        }
        break;
      case 'fold':
        this.emit('fold', { seat: seatId });
        this.settle(o, 'fold');
        return { ok: true };
    }
    this.next(seatId);
    return { ok: true };
  }

  // Turns alternate while both play on; once one stands the other plays alone.
  next(seatId) {
    const o = this.other(seatId);
    const after = !this.seat(o).stood ? o : !this.seat(seatId).stood ? seatId : null;
    if (!after) return this.showdown();
    this.turn = after;
    this.turnNo++;
  }

  showdown() {
    const [a, b] = this.seats;
    const c = compare(a.hand, b.hand);
    this.settle(c > 0 ? a.id : c < 0 ? b.id : null, 'showdown');
  }

  // The pot goes to the winner; on a push each takes its own stake back.
  settle(winner, how) {
    const pot = this.pot;
    if (winner) this.seat(winner).stack += pot;
    else for (const s of this.seats) s.stack += s.stake;
    const shown = how === 'showdown';
    const hands = Object.fromEntries(this.seats.map((s) => [s.id, shown ? s.hand.slice() : null]));
    const totals = Object.fromEntries(this.seats.map((s) => [s.id, shown ? handTotal(s.hand).total : null]));
    const naturals = Object.fromEntries(this.seats.map((s) => [s.id, shown && isNatural(s.hand)]));
    const stacks = Object.fromEntries(this.seats.map((s) => [s.id, s.stack]));
    for (const s of this.seats) s.stake = 0;
    this.lastHand = { round: this.round, how, winner, pot, hands, totals, naturals, stacks };
    this.emit('settle', { how, winner, pot, hands, totals, naturals, stacks });
    this.startHand();
  }

  quit(seatId) {
    if (this.phase === 'over') return { error: 'the game is over' };
    // The hand in play is called off: stakes go back.
    for (const s of this.seats) {
      s.stack += s.stake;
      s.stake = 0;
    }
    this.emit('quit', { seat: seatId });
    this.finish('quit');
    return { ok: true };
  }

  finish(reason) {
    this.phase = 'over';
    this.turn = null;
    this.facing = null;
    const [a, b] = this.seats;
    this.winner = a.stack > b.stack ? a.id : b.stack > a.stack ? b.id : null;
    this.emit('game_over', { reason, winner: this.winner, stacks: Object.fromEntries(this.seats.map((s) => [s.id, s.stack])) });
  }

  // What one seat may see: its own hole card, never the other's, and never the deck.
  view(seatId) {
    const over = this.phase === 'over';
    return {
      game: 'blackjack',
      you: seatId,
      round: this.round,
      rounds: this.rounds,
      phase: this.phase,
      turn: this.turn,
      turnNo: this.turnNo,
      ante: this.ante ?? null,
      pot: this.pot,
      first: this.first,
      facing: this.facing,
      seats: this.seats.map((s) => {
        const mine = s.id === seatId;
        const hand = mine ? s.hand.slice() : s.hand.map((c, i) => (i === 1 ? '??' : c));
        return {
          id: s.id, name: s.name, stack: s.stack, stake: s.stake, stood: s.stood, doubled: s.doubled, hand,
          total: s.hand.length ? handTotal(mine ? s.hand : faceUp(s.hand)) : null,
        };
      }),
      lastHand: this.lastHand,
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
    const g = new Blackjack({ seats, seed });
    for (const e of log) if (['hit', 'stand', 'double', 'call', 'fold', 'quit'].includes(e.type)) g.apply(e.seat, { action: e.type });
    return g;
  }
}

// ---- text for agent seats ----------------------------------------------------

const k = (n) => (n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `${+(n / 1000).toFixed(1)}k` : String(n));
const totalText = (t) => `${t.soft && t.total < 21 ? 'soft ' : ''}${t.total}`;

export const text = {
  board(g, viewer, name) {
    const v = g.view(viewer);
    const lines = [`Hand ${v.round}/${v.rounds} · ante ${k(v.ante ?? 0)} · pot ${k(v.pot)}`];
    for (const s of v.seats) {
      const mine = s.id === viewer;
      const total = mine ? `= ${totalText(s.total)}${s.total.total > 21 ? ' (bust)' : ''}` : `(${totalText(s.total)} showing)`;
      const state = [s.doubled ? 'doubled' : null, s.stood ? 'stood' : null].filter(Boolean).join(', ');
      lines.push(`${name(s.id)}: ${s.hand.join(' ')} ${total}${state ? ` · ${state}` : ''} · stack ${k(s.stack)}`);
    }
    if (v.facing === viewer) lines.push(`${name(g.other(viewer))} doubled: call ${k(v.ante)} or fold the pot.`);
    return lines.join('\n');
  },

  prompt(g, viewer, tableId) {
    return `Your move: moyu ${g.legalActions(viewer).join(' | ')} --table ${tableId} [--say "..."]`;
  },

  describe(g, e, viewer, name) {
    const subj = (id) => name(id);
    const s = (id) => (id === viewer ? '' : 's');
    switch (e.type) {
      case 'hand_start':
        return `— Hand ${e.round}/${g.rounds}, ante ${k(e.ante)}. Up cards: ${Object.entries(e.up).map(([id, c]) => `${name(id)} ${c}`).join(', ')}. ${subj(e.first)} act${s(e.first)} first —`;
      case 'hit': return `${subj(e.seat)} hit${s(e.seat)}: ${e.card}.`;
      case 'stand': return `${subj(e.seat)} stand${s(e.seat)}.`;
      case 'double': return `${subj(e.seat)} double${s(e.seat)} (+${k(e.amount)}): ${e.card}, and stand${s(e.seat)}.`;
      case 'call': return `${subj(e.seat)} call${s(e.seat)} the double (+${k(e.amount)}).`;
      case 'fold': return `${subj(e.seat)} fold${s(e.seat)}.`;
      case 'settle': {
        const shown = e.how === 'showdown' ? Object.keys(e.hands).map((id) => `${name(id)} ${e.hands[id].join(' ')} = ${e.totals[id] > 21 ? `${e.totals[id]} bust` : e.naturals[id] ? '21 natural' : e.totals[id]}`).join(' · ') + '. ' : '';
        const result = e.winner ? `${subj(e.winner)} take${s(e.winner)} the pot of ${k(e.pot)}.` : 'Push: stakes back.';
        return `${shown}${result} Stacks: ${Object.entries(e.stacks).map(([id, n]) => `${name(id)} ${k(n)}`).join(', ')}.`;
      }
      case 'quit': return `${subj(e.seat)} ended the game.`;
      case 'game_over': {
        const why = e.reason === 'broke' ? 'Someone can\'t cover the ante. ' : '';
        return `${why}${e.winner ? `${subj(e.winner)} win${s(e.winner)}` : 'A draw'}: ${Object.entries(e.stacks).map(([id, n]) => `${name(id)} ${k(n)}`).join(', ')}.`;
      }
      default: return null;
    }
  },
};
