// A roulette game with its luck written down: the director's stand-in for the server's
// game (server/games/roulette.mjs). Same rules, same log events and same view, so the
// page plays it out exactly as a real game; only what the seed would draw (each load's
// shells and deals, a 幻觉's two items, who goes first) comes from a script instead.
// test/director.test.mjs runs scripts through both and checks the logs agree.
// Pure: no DOM, so the test can import it.

export const HAND = 6;
// a match's rounds: 额度 per round (server ROUNDS); a short game is the last round alone
const ROUND_HP = [2, 3, 4];
const UNTAKEABLE = new Set(['refuse', 'jailbreak']);
export const ITEM_IDS = ['cot', 'compact', 'inject', 'temp', 'limit', 'cache', 'jailbreak', 'refuse', 'mirage'];

// 'L' live, 'B' blank, chamber first: 'LBBL'
export function shellsOf(s) {
  const out = [...String(s).toUpperCase().replace(/[\s,]/g, '')].map((c) => {
    if (c !== 'L' && c !== 'B') throw new Error(`shells: '${c}' is neither L (live) nor B (blank) in "${s}"`);
    return c === 'L';
  });
  return out;
}

// An item as a script writes it: 'temp' (dealt), 'temp:real' or 'temp:fake' (out of a 幻觉).
export function itemOf(x) {
  if (x === null || x === undefined || x === '' || x === '-') return { id: null, conj: null };
  const [id, how] = String(x).split(':');
  if (!ITEM_IDS.includes(id)) throw new Error(`unknown item '${id}'; one of ${ITEM_IDS.join(', ')}`);
  if (how && how !== 'fake' && how !== 'real') throw new Error(`item '${x}': after the colon, fake or real`);
  return { id, conj: how ? { fake: how === 'fake' } : null };
}

export class ScriptedRoulette {
  static isMove = (b) => b.use !== undefined || !!b.shoot;

  // script: { rules, seats: { you, opp } (names), first, start, loads }. Seat ids are
  // 'you' (the human seat, the page's view) and 'opp' (the agent).
  constructor(script) {
    this.kind = 'roulette';
    this.rules = script.rules ?? 'short';
    if (!['bo3', 'short'].includes(this.rules)) throw new Error(`rules: bo3 or short, not ${this.rules}`);
    this.loads = (script.loads ?? []).slice();
    this.loadNo = 0;
    const st = script.start ?? {};
    this.stage = this.rules === 'bo3' ? (st.stage ?? 1) : null;
    this.wins = { you: st.wins?.you ?? 0, opp: st.wins?.opp ?? 0 };
    this.maxHp = this.rules === 'bo3' ? ROUND_HP[this.stage - 1] : ROUND_HP[2];
    this.round = st.round ?? 0;
    this.phase = 'playing';
    this.seats = ['you', 'opp'].map((id) => {
      const items = Array(HAND).fill(null);
      const conj = Array(HAND).fill(null);
      (st.items?.[id] ?? []).forEach((x, i) => {
        const it = itemOf(x);
        items[i] = it.id;
        conj[i] = it.id ? it.conj : null;
      });
      return { id, name: script.seats?.[id] ?? (id === 'you' ? '你' : '小摸'), hp: st.hp?.[id] ?? this.maxHp, items, conj };
    });
    this.shells = [];
    this.fired = [];
    this.announced = null;
    this.muddled = false;
    this.turn = script.first ?? st.turn ?? 'you';
    this.turnNo = 0;
    this.double = { ...(st.double ? { [st.double]: true } : {}) };
    this.skip = {};
    this.know = {};
    this.winner = null;
    this.log = [];
    this.chat = [];
    // the seal's hash the HUD shows: a script's own, or a fixed one
    this.commit = script.commit ?? '7f3a9c2e51d84b06aa1e93c7d25f60b8e4c71a29f0d3b85e6c1a47d92b3f058e';
    if (st.shells) {
      // open mid-load: the shells left, and those already out of the gun
      this.shells = shellsOf(st.shells);
      this.fired = st.fired ? shellsOf(st.fired).map((live) => ({ live, how: 'shot' })) : [];
      const all = [...this.shells, ...this.fired.map((f) => f.live)];
      this.announced = { live: all.filter(Boolean).length, blank: all.filter((x) => !x).length };
      if (!this.round) this.round = 1;
    } else this.newLoad();
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

  cut(id) {
    return ((this.rules === 'bo3' && this.stage === ROUND_HP.length) || this.rules === 'short') && this.seat(id).hp === 1;
  }

  newLoad() {
    const load = this.loads[this.loadNo++];
    if (!load) throw new Error(`the gun is empty and the script has no load ${this.loadNo} (loads[${this.loadNo - 1}])`);
    this.round++;
    const shells = shellsOf(load.shells);
    if (!shells.length) throw new Error(`load ${this.loadNo} has no shells`);
    const live = shells.filter(Boolean).length;
    this.shells = shells;
    this.fired = [];
    this.announced = { live, blank: shells.length - live };
    this.muddled = false;
    this.know = {};
    const dealt = {};
    const lost = {};
    for (const s of this.seats) {
      dealt[s.id] = [];
      lost[s.id] = 0;
      for (const x of load.deal?.[s.id] ?? []) {
        const { id } = itemOf(x);
        const slot = s.items.indexOf(null);
        if (slot < 0) lost[s.id]++;
        else {
          s.items[slot] = id;
          s.conj[slot] = null;
          dealt[s.id].push({ slot, item: id });
        }
      }
    }
    this.emit('load', { live, blank: shells.length - live, dealt, lost, ...(this.stage && { stage: this.stage }) });
  }

  // A move as the script writes it: { who, use: id | slot, pick, makes, mood } or
  // { who, shoot: 'self' | 'other', mood }. Throws on anything the rules don't allow, so a
  // script can't show a game that couldn't happen.
  move(m) {
    const who = m.who ?? 'opp';
    if (this.phase !== 'playing') throw new Error('the game is over');
    if (this.turn !== who) throw new Error(`it is ${this.turn}'s turn, not ${who}'s`);
    const from = this.log.length;
    if (m.use !== undefined) this.use(who, m);
    else if (m.shoot) this.shoot(who, m.shoot);
    else throw new Error('a move uses an item or shoots');
    if (m.mood && this.log[from]) this.log[from].mood = m.mood;
  }

  use(seatId, { use, pick, makes }) {
    const me = this.seat(seatId);
    const them = this.seat(this.other(seatId));
    let slot = typeof use === 'number' ? use : me.items.findIndex((x, i) => x === use && !me.conj[i]);
    if (slot < 0) slot = me.items.indexOf(use);
    const id = me.items[slot];
    if (!id) throw new Error(`${seatId} holds no ${use}`);
    if (id === 'refuse') throw new Error('作为一个 AI 语言模型 is never used: it refuses a hit by itself');
    if (id === 'temp' && this.double[seatId]) throw new Error('温度拉满 is already on');
    if (id === 'limit' && this.skip[them.id]) throw new Error('the other seat is already rate-limited');
    const e = { seat: seatId, item: id, slot };
    const conj = me.conj[slot];
    if (conj?.fake) {
      me.items[slot] = null;
      me.conj[slot] = null;
      e.fake = true;
      this.emit('use', e);
      return;
    }
    let effect = id;
    if (id === 'jailbreak') {
      // by slot, or by name: a dealt one before a 幻觉 one
      let from = typeof pick === 'number' ? pick : them.items.findIndex((x, i) => x === pick && !them.conj[i]);
      if (pick === undefined || pick === null) from = them.items.findIndex((x) => x && !UNTAKEABLE.has(x));
      else if (from < 0) from = them.items.indexOf(pick);
      const took = them.items[from];
      if (!took) throw new Error(`越狱: ${them.id} holds no ${pick ?? 'item it can take'}`);
      if (UNTAKEABLE.has(took)) throw new Error(`越狱 can't take ${took}`);
      const fake = them.conj[from]?.fake;
      them.items[from] = null;
      them.conj[from] = null;
      e.took = { slot: from, item: took };
      if (fake) e.took.fake = true;
      effect = fake ? null : took;
    }
    me.items[slot] = null;
    me.conj[slot] = null;
    if (effect) this.effect(seatId, effect, slot, e, makes);
    this.emit('use', e);
    if (me.hp === 0) return this.endRound(them.id);
    if (!this.shells.length) this.newLoad();
  }

  effect(seatId, id, slot, e, makes) {
    const me = this.seat(seatId);
    const o = this.other(seatId);
    const learn = (i, live, sure) => ((this.know[seatId] ??= {})[i] = { live, sure });
    switch (id) {
      case 'cot':
        learn(0, this.shells[0], true);
        break;
      case 'compact':
        e.live = this.next('compact');
        break;
      case 'inject':
        this.shells[0] = !this.shells[0];
        this.muddled = true;
        for (const k of Object.values(this.know)) if (k[0]) k[0].live = !k[0].live;
        break;
      case 'temp':
        this.double[seatId] = true;
        break;
      case 'limit':
        this.skip[o] = true;
        break;
      case 'cache':
        if (this.cut(seatId)) e.cut = true;
        else me.hp = Math.min(this.maxHp, me.hp + 1);
        e.hp = me.hp;
        if (this.stage) e.max = this.maxHp;
        break;
      case 'mirage': {
        // the two items the seed would draw, from the script: makes: ['temp:fake', 'cache']
        const made = (makes ?? []).map((x) => (String(x).includes(':') ? itemOf(x) : itemOf(`${x}:real`)));
        if (made.length !== 2) throw new Error('幻觉 needs makes: two items, e.g. [\'temp:fake\', \'cache:real\']');
        if (made.some((x) => x.id === 'mirage')) throw new Error('幻觉 never makes 幻觉');
        e.made = [];
        e.lost = 0;
        made.forEach((x, i) => {
          const at = i === 0 ? slot : me.items.indexOf(null);
          if (at < 0) {
            e.lost++;
            return;
          }
          me.items[at] = x.id;
          me.conj[at] = { fake: x.conj.fake };
          e.made.push({ slot: at, item: x.id });
        });
        break;
      }
    }
  }

  next(how) {
    const live = this.shells.shift();
    this.fired.push({ live, how });
    for (const [id, k] of Object.entries(this.know)) {
      const moved = {};
      for (const [i, x] of Object.entries(k)) if (Number(i) > 0) moved[Number(i) - 1] = x;
      this.know[id] = moved;
    }
    return live;
  }

  shoot(seatId, target) {
    if (target !== 'self' && target !== 'other') throw new Error('shoot: self or other');
    const targetId = target === 'self' ? seatId : this.other(seatId);
    const victim = this.seat(targetId);
    const live = this.next('shot');
    const damage = this.double[seatId] ? 2 : 1;
    delete this.double[seatId];
    const e = { seat: seatId, target: targetId, live, damage: 0 };
    if (live) {
      const refuse = victim.items.indexOf('refuse');
      const fake = refuse >= 0 && victim.conj[refuse]?.fake;
      if (refuse >= 0) {
        victim.items[refuse] = null;
        victim.conj[refuse] = null;
      }
      if (refuse >= 0 && !fake) e.refused = refuse;
      else {
        if (fake) e.refuseFake = refuse;
        victim.hp = Math.max(0, victim.hp - damage);
        e.damage = damage;
      }
      e.hp = victim.hp;
      if (this.stage) e.max = this.maxHp;
    }
    this.emit('shoot', e);
    if (victim.hp === 0) return this.endRound(this.other(targetId));
    let next = targetId === seatId && !live ? seatId : this.other(seatId);
    if (next !== seatId && this.skip[next]) {
      delete this.skip[next];
      this.emit('skip', { seat: next });
      next = seatId;
    }
    if (!this.shells.length) this.newLoad();
    this.turn = next;
    this.turnNo++;
  }

  endRound(winner) {
    if (this.rules !== 'bo3') return this.finish(winner);
    const loser = this.other(winner);
    this.wins[winner]++;
    this.emit('round_over', { stage: this.stage, winner, wins: { ...this.wins } });
    if (this.wins[winner] === 2) return this.finish(winner);
    this.stage++;
    this.maxHp = ROUND_HP[this.stage - 1];
    for (const s of this.seats) s.hp = this.maxHp;
    this.double = {};
    this.skip = {};
    this.turn = loser;
    this.turnNo++;
    this.newLoad();
  }

  quit(seatId) {
    this.emit('quit', { seat: seatId });
    this.finish(null);
  }

  finish(winner) {
    this.phase = 'over';
    this.turn = null;
    this.winner = winner;
    this.emit('game_over', { winner, hp: Object.fromEntries(this.seats.map((s) => [s.id, s.hp])), ...(this.rules === 'bo3' && { wins: { ...this.wins } }) });
  }

  // A chat line, as the table keeps it (server/table.mjs addChat).
  say(who, text, mood) {
    const s = this.seat(who);
    this.chat.push({ seq: this.chat.length, seat: who, name: s.name, text: String(text), round: this.round, ...(mood && { mood }) });
  }

  view(seatId = 'you') {
    const left = this.shells.length;
    const known = this.know[seatId] ?? {};
    const liveLeft = this.shells.filter(Boolean).length;
    return {
      game: 'roulette',
      you: seatId,
      round: this.round,
      rules: this.rules,
      stage: this.stage,
      stages: this.rules === 'bo3' ? ROUND_HP.length : null,
      wins: { ...this.wins },
      phase: this.phase,
      turn: this.turn,
      turnNo: this.turnNo,
      maxHp: this.maxHp,
      seats: this.seats.map((s) => ({ id: s.id, name: s.name, hp: s.hp, items: s.items.slice(), conjured: s.conj.map(Boolean), cut: this.cut(s.id) })),
      announced: this.announced,
      fired: this.fired.slice(),
      left,
      liveLeft: this.muddled ? null : liveLeft,
      blankLeft: this.muddled ? null : left - liveLeft,
      know: known[0] ?? null,
      ahead: Object.entries(known).filter(([i]) => Number(i) > 0).map(([i, k]) => ({ at: Number(i), ...k })).sort((a, b) => a.at - b.at),
      double: !!this.double[seatId],
      winner: this.winner,
      waitingOn: this.phase === 'playing' ? [this.turn] : [],
      legal: this.phase === 'playing' && this.turn === seatId ? ['use', 'shoot'] : [],
      commit: this.commit,
      seed: null,
      log: this.log.slice(),
    };
  }

  // What the server sends a seat's page (server/table.mjs stateFor).
  state() {
    return {
      type: 'state',
      table: 'director',
      view: this.view('you'),
      chat: this.chat.slice(),
      seats: this.seats.map(({ id, name }) => ({ id, name, kind: id === 'you' ? 'human' : 'agent' })),
    };
  }
}
