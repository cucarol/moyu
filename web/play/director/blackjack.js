// Heads-up 21 with its cards written down: the director's stand-in for the server's game
// (server/games/blackjack.mjs). Same rules, log and view; only what the seed would draw
// (each hand's deck, who acts first) comes from the script. test/director.test.mjs runs
// games through both and checks they agree. Pure: no DOM.
//
// Each hand's cards, in the order they're dealt: { you: [up, hole], opp: [up, hole],
// draws: [...] } (draws go to the hits in play order, either seat's), or the
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
    this.seats = ['you', 'opp'].map((id) => ({ id, name: script.seats?.[id] ?? (id === 'you' ? '你' : 'Clawd'), stack: st.stacks?.[id] ?? START_STACK, stake: 0, bet: 0, hand: [], stood: false }));
    // the seat to act first in the opening hand; past hand 1, startHand takes the other
    // seat from the hand before, so that one is kept here
    this.first = this.round === 0 ? (script.first ?? 'you') : this.other(script.first ?? 'you');
    this.street = null;
    this.turn = null;
    this.turnNo = 0;
    this.facing = null;
    this.spoke = false;
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
    for (const s of this.seats) Object.assign(s, { stack: s.stack - ante, stake: ante, bet: 0, hand: [], stood: false });
    for (let i = 0; i < 2; i++) for (const id of order) this.seat(id).hand.push(this.draw());
    this.emit('hand_start', { ante, first, up: Object.fromEntries(order.map((id) => [id, this.seat(id).hand[0]])) });
    this.openStreet('bet1');
  }

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

  price(seatId) {
    const me = this.seat(seatId);
    const o = this.seat(this.other(seatId));
    const call = o.bet - me.bet;
    const room = Math.min(me.stack - call, o.stack);
    return { call, room, pot: Math.min(this.pot + call, room), allin: call + room };
  }

  legalActions(seatId) {
    if (this.phase !== 'playing' || this.turn !== seatId) return [];
    const me = this.seat(seatId);
    if (this.street === 'draw') return handTotal(me.hand).total > 21 ? ['stand'] : ['hit', 'stand'];
    const p = this.price(seatId);
    const actions = p.call ? ['call', 'fold'] : ['check'];
    if (p.room > 0 && p.pot < p.room) actions.push(p.call ? 'raise' : 'bet');
    if (p.room > 0) actions.push('allin');
    return actions;
  }

  // { who, act: 'hit' | 'stand' | 'check' | 'bet' | 'raise' | 'call' | 'fold' | 'allin', mood }
  move(m) {
    const seatId = m.who ?? 'opp';
    const action = m.act;
    if (this.phase !== 'playing') throw new Error('the game is over');
    if (this.turn !== seatId) throw new Error(`it is ${this.turn}'s turn, not ${seatId}'s`);
    if (!this.legalActions(seatId).includes(action)) throw new Error(`${seatId} can't ${action} now (can: ${this.legalActions(seatId).join(', ')})`);
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
        this.emit('hit', { seat: seatId, card });
        return this.nextDraw(seatId);
      }
      case 'stand':
        me.stood = true;
        this.emit('stand', { seat: seatId });
        return this.nextDraw(seatId);
      case 'check':
        this.emit('check', { seat: seatId });
        return this.spoke ? this.closeStreet() : this.pass(o);
      case 'bet':
      case 'raise':
      case 'allin': {
        const p = this.price(seatId);
        const amount = action === 'allin' ? p.allin : p.call + p.pot;
        this.put(me, amount);
        this.emit(action, { seat: seatId, amount, to: me.bet });
        this.facing = o;
        return this.pass(o);
      }
      case 'call': {
        const amount = this.price(seatId).call;
        this.put(me, amount);
        this.emit('call', { seat: seatId, amount });
        return this.closeStreet();
      }
      case 'fold':
        this.emit('fold', { seat: seatId });
        return this.settle(o, 'fold');
    }
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
    this.street = null;
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
      price: legal.includes('allin') || legal.includes('call') ? this.price(seatId) : null,
      seats: this.seats.map((s) => {
        const mine = s.id === seatId;
        const hand = mine ? s.hand.slice() : s.hand.map((c, i) => (i === 1 ? '??' : c));
        return { id: s.id, name: s.name, stack: s.stack, stake: s.stake, bet: s.bet, stood: s.stood, hand, total: s.hand.length ? handTotal(mine ? s.hand : faceUp(s.hand)) : null };
      }),
      lastHand: this.lastHand,
      winner: this.winner,
      waitingOn: this.phase === 'playing' && this.turn ? [this.turn] : [],
      legal,
      commit: this.commit,
      seed: null,
      log: this.log.slice(),
    };
  }

  state() {
    return { type: 'state', table: 'director', view: this.view('you'), chat: this.chat.slice(), seats: this.seats.map(({ id, name }) => ({ id, name, kind: id === 'you' ? 'human' : 'agent' })) };
  }
}
