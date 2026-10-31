// Heads-up 21 with betting: two equal players and no dealer. Each hand both ante, each
// gets an up card and a hole card, then three streets: a betting round, the draw (turns
// of hit or stand; a bust can only stand, and stays hidden), and a last betting round
// before the showdown. Bets are pot-limit with no cap on raises: check, bet or raise the
// pot, call, fold, or all in. Stacks are tokens; after eight hands, or when someone
// can't cover the ante, the bigger stack wins. Rules: docs/blackjack.md.
import { commitOf, sealedInts, sealedShuffle } from '../seal.mjs';

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['S', 'H', 'D', 'C'];
export const START_STACK = 1_000_000;
export const ANTES = [50_000, 50_000, 100_000, 100_000, 200_000, 200_000, 400_000, 400_000];
const FORMAT = 3; // v1 was the dealer game, v2 had double instead of betting; their saves don't load
// What a seat can do: the draw street's, then the betting streets'.
const ACTIONS = ['hit', 'stand', 'check', 'bet', 'raise', 'call', 'fold', 'allin'];

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
    // stake: in the pot this hand; bet: in it this betting round
    this.seats = seats.map(({ id, name }) => ({ id, name, stack: START_STACK, stake: 0, bet: 0, hand: [], stood: false }));
    this.first = this.seats[sealedInts(seed, 'first')(2)].id;
    this.street = null; // 'bet1' (after the deal), 'draw', 'bet2' (before the showdown)
    this.turn = null;
    this.turnNo = 0;
    this.facing = null; // the seat a bet waits on: call, raise, all in or fold
    this.spoke = false; // someone has acted on this betting round
    this.pos = 0;
    this.lastHand = null;
    this.winner = null;
    this.log = [];
    this.startHand();
  }

  // The deck is left out: it follows from the seed and the hand number.
  toJSON() {
    const { seed, rounds, round, phase, seats, first, street, turn, turnNo, facing, spoke, pos, lastHand, winner, log } = this;
    return structuredClone({ format: FORMAT, seed, rounds, round, phase, seats, first, street, turn, turnNo, facing, spoke, pos, lastHand, winner, log });
  }

  static fromJSON(data) {
    if (data.format !== FORMAT) throw new Error('a blackjack table from an older version');
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
    for (const s of this.seats) Object.assign(s, { stack: s.stack - ante, stake: ante, bet: 0, hand: [], stood: false });
    for (let i = 0; i < 2; i++) for (const id of order) this.seat(id).hand.push(this.draw());
    this.emit('hand_start', { ante, first, up: Object.fromEntries(order.map((id) => [id, this.seat(id).hand[0]])) });
    this.openStreet('bet1');
  }

  // A betting round nobody can bet in (a seat is all in) is skipped.
  openStreet(street) {
    for (const s of this.seats) s.bet = 0;
    this.facing = null;
    this.spoke = false;
    if (street !== 'draw' && this.seats.some((s) => s.stack === 0)) return street === 'bet1' ? this.openStreet('draw') : this.showdown();
    this.street = street;
    this.turn = this.first;
    this.turnNo++;
    if (street !== 'bet1') this.emit('street', { street });
  }

  // What a seat may put in on a betting round: to call the bet it faces, at most this
  // much on top (no side pots: never more than the other seat can match), and the pot-
  // sized bet or raise.
  price(seatId) {
    const me = this.seat(seatId);
    const o = this.seat(this.other(seatId));
    const call = o.bet - me.bet;
    const room = Math.min(me.stack - call, o.stack);
    return { call, room, pot: Math.min(this.pot + call, room), allin: call + room };
  }

  waitingOn() {
    return this.phase === 'playing' ? [this.turn] : [];
  }

  legalActions(seatId) {
    if (this.phase !== 'playing' || this.turn !== seatId) return [];
    const me = this.seat(seatId);
    if (this.street === 'draw') return handTotal(me.hand).total > 21 ? ['stand'] : ['hit', 'stand'];
    const p = this.price(seatId);
    const actions = p.call ? ['call', 'fold'] : ['check'];
    // the pot-sized bet when it is less than all in; all in whenever there is room
    if (p.room > 0 && p.pot < p.room) actions.push(p.call ? 'raise' : 'bet');
    if (p.room > 0) actions.push('allin');
    return actions;
  }

  // { action: 'hit' | 'stand' | 'check' | 'bet' | 'raise' | 'call' | 'fold' | 'allin' | 'quit' }
  apply(seatId, { action }) {
    if (action === 'quit') return this.quit(seatId);
    if (this.phase !== 'playing') return { error: 'the game is over' };
    if (this.turn !== seatId) return { error: 'not your turn' };
    const legal = this.legalActions(seatId);
    if (!legal.includes(action)) return { error: `cannot ${action} now; you can ${legal.join(', ')}` };
    const me = this.seat(seatId);
    const o = this.other(seatId);
    switch (action) {
      case 'hit': {
        const card = this.draw();
        me.hand.push(card);
        this.emit('hit', { seat: seatId, card });
        this.nextDraw(seatId);
        break;
      }
      case 'stand':
        me.stood = true;
        this.emit('stand', { seat: seatId });
        this.nextDraw(seatId);
        break;
      case 'check':
        this.emit('check', { seat: seatId });
        if (this.spoke) this.closeStreet();
        else this.pass(o);
        break;
      case 'bet':
      case 'raise':
      case 'allin': {
        const p = this.price(seatId);
        const amount = action === 'allin' ? p.allin : p.call + p.pot;
        this.put(me, amount);
        this.emit(action, { seat: seatId, amount, to: me.bet });
        this.facing = o;
        this.pass(o);
        break;
      }
      case 'call': {
        const amount = this.price(seatId).call;
        this.put(me, amount);
        this.emit('call', { seat: seatId, amount });
        this.closeStreet();
        break;
      }
      case 'fold':
        this.emit('fold', { seat: seatId });
        this.settle(o, 'fold');
        break;
    }
    return { ok: true };
  }

  put(s, amount) {
    s.stack -= amount;
    s.stake += amount;
    s.bet += amount;
  }

  pass(to) {
    this.spoke = true;
    this.turn = to;
    this.turnNo++;
  }

  closeStreet() {
    if (this.street === 'bet1') this.openStreet('draw');
    else this.showdown();
  }

  // On the draw, turns alternate while both play on; once one stands the other plays
  // alone. When both have stood, the last betting round.
  nextDraw(seatId) {
    const o = this.other(seatId);
    const after = !this.seat(o).stood ? o : !this.seat(seatId).stood ? seatId : null;
    if (!after) return this.openStreet('bet2');
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
    for (const s of this.seats) s.stake = s.bet = 0;
    this.street = null;
    this.facing = null;
    this.lastHand = { round: this.round, how, winner, pot, hands, totals, naturals, stacks };
    this.emit('settle', { how, winner, pot, hands, totals, naturals, stacks });
    this.startHand();
  }

  quit(seatId) {
    if (this.phase === 'over') return { error: 'the game is over' };
    // The hand in play is called off: stakes go back.
    for (const s of this.seats) {
      s.stack += s.stake;
      s.stake = s.bet = 0;
    }
    this.emit('quit', { seat: seatId });
    this.finish('quit');
    return { ok: true };
  }

  finish(reason) {
    this.phase = 'over';
    this.street = null;
    this.turn = null;
    this.facing = null;
    const [a, b] = this.seats;
    this.winner = a.stack > b.stack ? a.id : b.stack > a.stack ? b.id : null;
    this.emit('game_over', { reason, winner: this.winner, stacks: Object.fromEntries(this.seats.map((s) => [s.id, s.stack])) });
  }

  // What one seat may see: its own hole card, never the other's, and never the deck.
  view(seatId) {
    const over = this.phase === 'over';
    const legal = this.legalActions(seatId);
    return {
      game: 'blackjack',
      you: seatId,
      round: this.round,
      rounds: this.rounds,
      phase: this.phase,
      street: this.street,
      turn: this.turn,
      turnNo: this.turnNo,
      ante: this.ante ?? null,
      pot: this.pot,
      first: this.first,
      facing: this.facing,
      // what your betting moves put in, when it's on you
      price: legal.includes('allin') || legal.includes('call') ? this.price(seatId) : null,
      seats: this.seats.map((s) => {
        const mine = s.id === seatId;
        const hand = mine ? s.hand.slice() : s.hand.map((c, i) => (i === 1 ? '??' : c));
        return {
          id: s.id, name: s.name, stack: s.stack, stake: s.stake, bet: s.bet, stood: s.stood, hand,
          total: s.hand.length ? handTotal(mine ? s.hand : faceUp(s.hand)) : null,
        };
      }),
      lastHand: this.lastHand,
      winner: this.winner,
      waitingOn: this.waitingOn(),
      legal,
      commit: commitOf(this.seed),
      seed: over ? this.seed : null,
      log: this.log,
    };
  }

  // Re-run a whole game from the seed and the logged actions; verify compares logs.
  static replay(seed, seats, log) {
    const g = new Blackjack({ seats, seed });
    for (const e of log) if (e.type === 'quit' || ACTIONS.includes(e.type)) g.apply(e.seat, { action: e.type });
    return g;
  }
}

// ---- text for agent seats ----------------------------------------------------

const k = (n) => (n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `${+(n / 1000).toFixed(1)}k` : String(n));
const totalText = (t) => `${t.soft && t.total < 21 ? 'soft ' : ''}${t.total}`;

const STREETS = { bet1: 'betting before the draw', draw: 'the draw', bet2: 'last bets before the showdown' };

export const text = {
  board(g, viewer, name) {
    const v = g.view(viewer);
    const lines = [`Hand ${v.round}/${v.rounds} · ante ${k(v.ante ?? 0)} · pot ${k(v.pot)}${v.street ? ` · ${STREETS[v.street]}` : ''}`];
    for (const s of v.seats) {
      const mine = s.id === viewer;
      const total = mine ? `= ${totalText(s.total)}${s.total.total > 21 ? ' (bust)' : ''}` : `(${totalText(s.total)} showing)`;
      const state = [s.bet ? `bet ${k(s.bet)}` : null, s.stood ? 'stood' : null, s.stack === 0 ? 'all in' : null].filter(Boolean).join(', ');
      lines.push(`${name(s.id)}: ${s.hand.join(' ')} ${total}${state ? ` · ${state}` : ''} · stack ${k(s.stack)}`);
    }
    return lines.join('\n');
  },

  // The betting moves say what they put in, so the agent never has to work out a size.
  prompt(g, viewer, tableId) {
    const legal = g.legalActions(viewer);
    const p = g.street === 'draw' ? null : g.price(viewer);
    const puts = { call: p?.call, bet: p?.pot, raise: p && p.call + p.pot, allin: p?.allin };
    const cost = legal.filter((a) => puts[a]).map((a) => `${a} puts in ${k(puts[a])}`);
    return `Your move: moyu ${legal.join(' | ')} --table ${tableId} [--say "..."]${cost.length ? `\n(${cost.join('; ')}.)` : ''}`;
  },

  describe(g, e, viewer, name) {
    const subj = (id) => name(id);
    const s = (id) => (id === viewer ? '' : 's');
    switch (e.type) {
      case 'hand_start':
        return `— Hand ${e.round}/${g.rounds}, ante ${k(e.ante)}. Up cards: ${Object.entries(e.up).map(([id, c]) => `${name(id)} ${c}`).join(', ')}. Bets first; ${subj(e.first)} act${s(e.first)} first —`;
      case 'street': return e.street === 'draw' ? '— Bets are in. The draw —' : '— Both stand. Last bets —';
      case 'hit': return `${subj(e.seat)} hit${s(e.seat)}: ${e.card}.`;
      case 'stand': return `${subj(e.seat)} stand${s(e.seat)}.`;
      case 'check': return `${subj(e.seat)} check${s(e.seat)}.`;
      case 'bet': return `${subj(e.seat)} bet${s(e.seat)} ${k(e.amount)}.`;
      case 'raise': return `${subj(e.seat)} raise${s(e.seat)} to ${k(e.to)}.`;
      case 'allin': return `${subj(e.seat)} go${e.seat === viewer ? '' : 'es'} all in: ${k(e.amount)}.`;
      case 'call': return `${subj(e.seat)} call${s(e.seat)} ${k(e.amount)}.`;
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