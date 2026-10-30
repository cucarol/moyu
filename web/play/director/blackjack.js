// Heads-up 21 with its cards written down: the director's stand-in for the server's game
// (server/games/blackjack.mjs). Same rules, log and view; only what the seed would draw
// (each hand's deck, who acts first) comes from the script. test/director.test.mjs runs
// games through both and checks they agree. Pure: no DOM.
//
// Each hand's cards, in the order they're dealt: { you: [up, hole], opp: [up, hole],
// draws: [...] } (draws go to the hits and doubles in play order, either seat's), or the
// raw deck { deck: [...] } in draw order (first actor's up, the other's up, first's hole,
// the other's hole, then the draws). Cards are rank and suit: 'AS', '10H', 'KD', '7C'.

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['S', 'H', 'D', 'C'];
export const START_STACK = 1_000_000;
export const ANTES = [50_000, 50_000, 100_000, 100_000, 200_000, 200_000, 400_000, 400_000];

export function cardOf(c) {
  const s = String(c).toUpperCase();
  if (!RANKS.includes(s.slice(0, -1)) || !SUITS.includes(s.slice(-1))) throw new Error(`'${c}' is not a card: a rank (A 2-10 J Q K) and a suit (S H D C), e.g. 'QH'`);
  return s;
}

export function handTotal(hand) {
  let total = 0;
  let aces = 0;
  for (const card of hand) {
    const r = card.slice(0, -1);
    if (r === 'A') {
      total += 11;
      aces++;
    } else if (r === 'J' || r === 'Q' || r === 'K') total += 10;
    else total += Number(r);
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

const isNatural = (hand) => hand.length === 2 && handTotal(hand).total === 21;
const faceUp = (hand) => hand.filter((_, i) => i !== 1);
function compare(a, b) {
  const ta = handTotal(a).total;
  const tb = handTotal(b).total;
  if (ta > 21 || tb > 21) return (tb > 21) - (ta > 21);
  if (ta !== tb) return ta - tb;
  return isNatural(a) - isNatural(b);
}

export class ScriptedBlackjack {
  static isMove = (b) => !!b.act;

  // script: { seats: { you, opp }, first, hands: [...], start: { round, stacks } }
  constructor(script) {
    this.hands = (script.hands ?? []).slice();
    this.handNo = 0;
    this.rounds = ANTES.length;
    const st = script.start ?? {};
    this.round = (st.round ?? 1) - 1; // hands played before this one
    this.phase = 'playing';
    this.seats = ['you', 'opp'].map((id) => ({ id, name: script.seats?.[id] ?? (id === 'you' ? '你' : 'Clawd'), stack: st.stacks?.[id] ?? START_STACK, stake: 0, hand: [], stood: false, acted: false, doubled: false }));
    // the seat to act first in the opening hand; past hand 1, startHand takes the other
    // seat from the hand before, so that one is kept here
    this.first = this.round === 0 ? (script.first ?? 'you') : this.other(script.first ?? 'you');
    this.turn = null;
    this.turnNo = 0;
    this.facing = null;
    this.pos = 0;
    this.lastHand = null;
    this.winner = null;
    this.log = [];
    this.chat = [];
    this.commit = script.commit ?? '4b1d0c7e93a25f8e60d1c7b2a9f3e8d04c6b1a7f5e2d9c3b8a0f4e6d1c7b2a95';
    this.startHand();
  }

  seat(id) {
    return this.seats.find((s) => s.id === id);
  }

  other(id) {
    return id === 'you' ? 'opp' : 'you';
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
    if (this.pos >= this.deck.length) throw new Error(`hand ${this.round} has run out of cards: give it more draws`);
    return this.deck[this.pos++];
  }

  // The hand's deck in draw order, from either way a script writes it.
  deckOf(h, first) {
    if (!h) throw new Error(`the script has no cards for hand ${this.round} (hands[${this.handNo - 1}])`);
    const other = this.other(first);
    const deck = h.deck ? h.deck.map(cardOf) : [h[first]?.[0], h[other]?.[0], h[first]?.[1], h[other]?.[1], ...(h.draws ?? [])].map((c) => {
      if (c === undefined) throw new Error(`hand ${this.round}: each seat needs two cards, [up, hole]`);
      return cardOf(c);
    });
    const seen = new Set();
    for (const c of deck) {
      if (seen.has(c)) throw new Error(`hand ${this.round}: ${c} is dealt twice`);
      seen.add(c);
    }
    return deck;
  }

  startHand() {
    if (this.round >= ANTES.length) return this.finish('hands');
    const ante = ANTES[this.round];
    if (this.seats.some((s) => s.stack < ante)) return this.finish('broke');
    this.round++;
    const first = this.round === 1 ? this.first : this.other(this.first);
    this.first = first;
    this.deck = this.deckOf(this.hands[this.handNo++], first);
    this.pos = 0;
    const order = [first, this.other(first)];
    for (const s of this.seats) Object.assign(s, { stack: s.stack - ante, stake: ante, hand: [], stood: false, acted: false, doubled: false });
    for (let i = 0; i < 2; i++) for (const id of order) this.seat(id).hand.push(this.draw());
    this.turn = first;
    this.facing = null;
    this.turnNo++;
    this.emit('hand_start', { ante, first, up: Object.fromEntries(order.map((id) => [id, this.seat(id).hand[0]])) });
  }

  legalActions(seatId) {
    if (this.phase !== 'playing' || this.turn !== seatId) return [];
    if (this.facing === seatId) return ['call', 'fold'];
    const me = this.seat(seatId);
    const actions = ['hit', 'stand'];
    if (!me.acted && this.seats.every((s) => s.stack >= this.ante)) actions.push('double');
    return actions;
  }

  // { who, act: 'hit' | 'stand' | 'double' | 'call' | 'fold', mood }
  move(m) {
    const seatId = m.who ?? 'opp';
    const action = m.act;
    if (this.phase !== 'playing') throw new Error('the game is over');
    if (this.turn !== seatId) throw new Error(`it is ${this.turn}'s turn, not ${seatId}'s`);
    if (!this.legalActions(seatId).includes(action)) throw new Error(this.facing === seatId ? `${seatId} must call or fold the double first` : `${seatId} can't ${action} now (can: ${this.legalActions(seatId).join(', ')})`);
    const from = this.log.length;
    this.apply(seatId, action);
    if (m.mood && this.log[from]) this.log[from].mood = m.mood;
  }

  apply(seatId, action) {
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
        return;
      }
      case 'call':
        me.stack -= this.ante;
        me.stake += this.ante;
        this.facing = null;
        this.emit('call', { seat: seatId, amount: this.ante });
        if (!me.stood) {
          this.turnNo++;
          return;
        }
        break;
      case 'fold':
        this.emit('fold', { seat: seatId });
        this.settle(o, 'fold');
        return;
    }
    this.next(seatId);
  }

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
    // a script that ends here needs no next hand's cards: the game stops on this hand
    if (this.handNo >= this.hands.length && this.round < ANTES.length && this.seats.every((s) => s.stack >= ANTES[this.round])) return this.pause();
    this.startHand();
  }

  // Out of written hands: the table waits on the next hand that never comes.
  pause() {
    this.turn = null;
    this.paused = true;
  }

  finish(reason) {
    this.phase = 'over';
    this.turn = null;
    this.facing = null;
    const [a, b] = this.seats;
    this.winner = a.stack > b.stack ? a.id : b.stack > a.stack ? b.id : null;
    this.emit('game_over', { reason, winner: this.winner, stacks: Object.fromEntries(this.seats.map((s) => [s.id, s.stack])) });
  }

  say(who, text, mood) {
    this.chat.push({ seq: this.chat.length, seat: who, name: this.seat(who).name, text: String(text), round: this.round, ...(mood && { mood }) });
  }

  view(seatId = 'you') {
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
        return { id: s.id, name: s.name, stack: s.stack, stake: s.stake, stood: s.stood, doubled: s.doubled, hand, total: s.hand.length ? handTotal(mine ? s.hand : faceUp(s.hand)) : null };
      }),
      lastHand: this.lastHand,
      winner: this.winner,
      waitingOn: this.phase === 'playing' && this.turn ? [this.turn] : [],
      legal: this.legalActions(seatId),
      commit: this.commit,
      seed: null,
      log: this.log.slice(),
    };
  }

  state() {
    return { type: 'state', table: 'director', view: this.view('you'), chat: this.chat.slice(), seats: this.seats.map(({ id, name }) => ({ id, name, kind: id === 'you' ? 'human' : 'agent' })) };
  }
}
