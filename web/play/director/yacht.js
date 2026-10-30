// Yacht dice with the dice written down: the director's stand-in for the server's game
// (server/games/yacht.mjs). Same rules, log and view; only what the seed would roll comes
// from the script: each turn's first roll from turns, in order, and each reroll's new
// dice from the move that rolls them. test/director.test.mjs checks it against the
// server's game. Pure: no DOM.

export const CATEGORIES = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes', 'choice', 'four', 'house', 'small', 'large', 'yacht'];
const UPPER = CATEGORIES.slice(0, 6);
export const BONUS_AT = 63;
export const BONUS = 35;
const ROLLS = 3;
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

export function scoreFor(category, dice) {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dice) counts[d]++;
  const run = (n) => [1, 2, 3, 4, 5, 6].some((start) => start + n - 1 <= 6 && [...Array(n).keys()].every((i) => counts[start + i] > 0));
  const up = UPPER.indexOf(category);
  if (up >= 0) return counts[up + 1] * (up + 1);
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
  return { upper, bonus, total: sum(CATEGORIES.map((c) => sheet[c] ?? 0)) + bonus };
}

const dieOf = (d) => {
  if (!Number.isInteger(d) || d < 1 || d > 6) throw new Error(`a die shows 1 to 6, not ${d}`);
  return d;
};

export class ScriptedYacht {
  static isMove = (b) => b.roll !== undefined || b.score !== undefined;

  // script: { seats: { you, opp }, first, turns: [[5 dice], ...], start: { sheets: { you, opp } } }
  constructor(script) {
    this.turns = (script.turns ?? []).slice();
    this.turnScript = 0;
    this.rounds = CATEGORIES.length;
    this.phase = 'playing';
    const st = script.start ?? {};
    this.seats = ['you', 'opp'].map((id) => {
      const sheet = Object.fromEntries(CATEGORIES.map((c) => [c, null]));
      for (const [c, v] of Object.entries(st.sheets?.[id] ?? {})) {
        if (!CATEGORIES.includes(c)) throw new Error(`no category ${c}; one of ${CATEGORIES.join(', ')}`);
        sheet[c] = v;
      }
      return { id, name: script.seats?.[id] ?? (id === 'you' ? '你' : 'Clawd'), sheet };
    });
    this.turn = script.first ?? st.turn ?? 'you';
    this.turnNo = 0;
    this.dice = [];
    this.kept = [false, false, false, false, false];
    this.rollsLeft = 0;
    this.winner = null;
    this.log = [];
    this.chat = [];
    // A game opened part way: the boxes already filled go in the log as the turns that
    // filled them, taking turns, so the page counts its rounds from them as from a real
    // game's (their dice weren't written down: none).
    const filled = Object.fromEntries(this.seats.map((s) => [s.id, CATEGORIES.filter((c) => s.sheet[c] !== null)]));
    const sheets = Object.fromEntries(this.seats.map((s) => [s.id, {}]));
    for (let who = this.other(this.turn); filled.you.length || filled.opp.length; who = this.other(who)) {
      const c = filled[who].shift();
      if (!c) continue;
      sheets[who][c] = this.seat(who).sheet[c];
      this.emit('score', { seat: who, category: c, points: sheets[who][c], dice: [], total: sheetTotals(sheets[who]).total });
      this.turnNo++;
    }
    this.commit = script.commit ?? 'a93f1e07c4d28b5e6f0a1c9d7b3e2f8a5c4d6e1b0f9a8c7d3e2b1a0f6c5d4e3b';
    this.startTurn();
  }

  get round() {
    return Math.min(this.rounds, Math.floor(this.turnNo / 2) + 1);
  }

  seat(id) {
    return this.seats.find((s) => s.id === id);
  }

  other(id) {
    return id === 'you' ? 'opp' : 'you';
  }

  emit(type, data = {}) {
    this.log.push({ seq: this.log.length, round: this.round, type, ...data });
  }

  startTurn() {
    const first = this.turns[this.turnScript++];
    if (!first) throw new Error(`the script has no dice for turn ${this.turnScript} (turns[${this.turnScript - 1}])`);
    if (first.length !== 5) throw new Error(`turns[${this.turnScript - 1}]: a first roll is five dice`);
    this.dice = [0, 0, 0, 0, 0];
    this.kept = [false, false, false, false, false];
    this.rollsLeft = ROLLS;
    this.roll([], first);
  }

  roll(keep, values) {
    this.kept = this.dice.map((_, i) => keep.includes(i));
    const loose = this.kept.filter((k) => !k).length;
    if (values.length !== loose) throw new Error(`a roll keeping ${keep.length} needs ${loose} new dice, not ${values.length}`);
    let n = 0;
    for (let i = 0; i < 5; i++) if (!this.kept[i]) this.dice[i] = dieOf(values[n++]);
    this.rollsLeft--;
    this.emit('roll', { seat: this.turn, dice: this.dice.slice(), kept: keep.slice().sort(), rollNo: ROLLS - this.rollsLeft });
  }

  // { who, roll: [new dice], keep: [die indexes kept] } · { who, score: category } (+ mood)
  move(m) {
    const seatId = m.who ?? 'opp';
    if (this.phase !== 'playing') throw new Error('the game is over');
    if (this.turn !== seatId) throw new Error(`it is ${this.turn}'s turn, not ${seatId}'s`);
    const from = this.log.length;
    if (m.roll !== undefined) {
      if (this.rollsLeft <= 0) throw new Error('no rolls left: score the dice');
      const keep = [...new Set((m.keep ?? []).map(Number))];
      if (keep.some((i) => !(Number.isInteger(i) && i >= 0 && i < 5))) throw new Error('keep takes die positions 0 to 4');
      if (keep.length === 5) throw new Error('keeping all five rolls nothing: score instead');
      this.roll(keep, [m.roll].flat());
    } else {
      const me = this.seat(seatId);
      const c = m.score;
      if (!CATEGORIES.includes(c)) throw new Error(`no category ${c}; one of ${CATEGORIES.join(', ')}`);
      if (me.sheet[c] !== null) throw new Error(`${c} is already filled`);
      const points = scoreFor(c, this.dice);
      me.sheet[c] = points;
      this.emit('score', { seat: seatId, category: c, points, dice: this.dice.slice(), total: sheetTotals(me.sheet).total });
      this.turnNo++;
      if (this.seats.every((s) => CATEGORIES.every((x) => s.sheet[x] !== null))) this.finish('done');
      else {
        this.turn = this.other(seatId);
        // a script that ends here needs no next turn's dice: the table waits on it
        if (this.turnScript >= this.turns.length) this.pause();
        else this.startTurn();
      }
    }
    if (m.mood && this.log[from]) this.log[from].mood = m.mood;
  }

  pause() {
    this.rollsLeft = 0;
    this.paused = true;
  }

  finish(reason) {
    this.phase = 'over';
    this.turn = null;
    const totals = Object.fromEntries(this.seats.map((s) => [s.id, sheetTotals(s.sheet).total]));
    const [a, b] = this.seats;
    this.winner = totals[a.id] > totals[b.id] ? a.id : totals[b.id] > totals[a.id] ? b.id : null;
    this.emit('game_over', { reason, winner: this.winner, totals });
  }

  say(who, text, mood) {
    this.chat.push({ seq: this.chat.length, seat: who, name: this.seat(who).name, text: String(text), round: this.round, ...(mood && { mood }) });
  }

  view(seatId = 'you') {
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
      options: mover && !this.paused ? Object.fromEntries(CATEGORIES.filter((c) => mover.sheet[c] === null).map((c) => [c, scoreFor(c, this.dice)])) : {},
      seats: this.seats.map((s) => ({ id: s.id, name: s.name, sheet: { ...s.sheet }, ...sheetTotals(s.sheet) })),
      winner: this.winner,
      waitingOn: this.phase === 'playing' ? [this.turn] : [],
      legal: this.phase === 'playing' && this.turn === seatId && !this.paused ? (this.rollsLeft > 0 ? ['roll', 'score'] : ['score']) : [],
      commit: this.commit,
      seed: null,
      log: this.log.slice(),
    };
  }

  state() {
    return { type: 'state', table: 'director', view: this.view('you'), chat: this.chat.slice(), seats: this.seats.map(({ id, name }) => ({ id, name, kind: id === 'you' ? 'human' : 'agent' })) };
  }
}
