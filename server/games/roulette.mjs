// Roulette: two seats, one gun, a load of live and blank shells in a sealed order, and
// items that are all AI jokes. Shoot yourself and survive a blank to go again; shoot the
// other and the gun passes. Run out of 额度 and you lose the round; best of three wins the
// match. Rules: docs/roulette.md.
import { commitOf, sealedInts, sealedShuffle } from '../seal.mjs';

// Best of three: each round's 额度, shells per load and items per seat per load.
export const ROUNDS = [
  { hp: 2, shells: [2, 4], deal: 1 },
  { hp: 3, shells: [3, 6], deal: 2 },
  { hp: 4, shells: [3, 8], deal: 3 },
];
export const HAND = 6; // items a seat can hold in a match
// A short game: the last round of a match on its own, 断线 included. First to run the
// other out of 额度 wins. Same pool and hand as a match.
export const SHORT = ROUNDS[ROUNDS.length - 1];
// What a game may be played as.
export const RULES = ['bo3', 'short'];

export const ITEMS = {
  cot: { name: '思维链', does: 'look at the shell in the chamber (only you see it)' },
  mirage: { name: '幻觉', does: 'conjure two random items; each is real or fake, 50/50, and nobody knows which until it is used' },
  compact: { name: '/compact', does: 'eject the shell in the chamber without firing; both see what it was' },
  inject: { name: '提示词注入', does: 'flip the shell in the chamber: live becomes blank, blank becomes live' },
  temp: { name: '温度拉满', does: 'your next shot does 2 damage' },
  limit: { name: '429', does: 'the other seat skips its next turn' },
  refuse: { name: '作为一个 AI 语言模型', does: 'held, not used: refuses the next hit you take' },
  cache: { name: '缓存命中', does: 'get 1 quota back' },
  jailbreak: { name: '越狱', does: 'take an item the other seat holds and use it now' },
};
// What games deal from. Each game keeps the pool it was dealt from (the reveal gives it).
export const POOL = ['cot', 'compact', 'inject', 'temp', 'limit', 'cache', 'jailbreak', 'refuse', 'mirage'];
// What 越狱 can't take: the refusal only works where it sits, and no jailbreaking a jailbreak.
const UNTAKEABLE = new Set(['refuse', 'jailbreak']);

// Load k: its size, live count and order all follow from the seed.
export function loadFor(seed, k, [min, max] = [3, 8]) {
  const int = sealedInts(seed, `load:${k}`);
  const n = min + int(max - min + 1);
  const lo = Math.ceil(n / 3);
  const live = lo + int(Math.floor((2 * n) / 3) - lo + 1);
  const shells = sealedShuffle([...Array(live).fill(true), ...Array(n - live).fill(false)], commitOf(`${seed}:order:${k}`));
  return { live, blank: n - live, shells };
}

export class Roulette {
  constructor({ seats, seed, pool = POOL, rules = 'bo3' }) {
    this.kind = 'roulette';
    this.seed = seed;
    this.pool = pool.slice();
    this.rules = rules;
    this.stage = rules === 'bo3' ? 1 : null; // the round of the match
    this.wins = Object.fromEntries(seats.map((s) => [s.id, 0]));
    this.maxHp = rules === 'bo3' ? ROUNDS[0].hp : SHORT.hp;
    this.round = 0; // the load number, counted across the whole match
    this.phase = 'playing';
    // conj: per slot, a 幻觉 item's secret { fake }; null for a dealt one
    this.seats = seats.map(({ id, name }) => ({ id, name, hp: this.maxHp, items: Array(HAND).fill(null), conj: Array(HAND).fill(null) }));
    this.shells = []; // index 0 is in the chamber
    this.fired = []; // this load's shells out of the gun, in order: { live, how }
    this.announced = null;
    this.muddled = false; // a flip hit an unknown shell, so counts are no longer public
    this.turn = this.seats[sealedInts(seed, 'first')(2)].id;
    this.turnNo = 0;
    this.double = {};
    this.skip = {};
    this.know = {}; // seat -> { index in the gun -> { live, sure } }: private
    this.draws = { mirage: 0 };
    this.winner = null;
    this.log = [];
    this.newLoad();
  }

  toJSON() {
    const { kind, seed, pool, rules, stage, wins, maxHp, round, phase, seats, shells, fired, announced, muddled, turn, turnNo, double, skip, know, draws, winner, log } = this;
    return structuredClone({ kind, seed, pool, rules, stage, wins, maxHp, round, phase, seats, shells, fired, announced, muddled, turn, turnNo, double, skip, know, draws, winner, log });
  }

  static fromJSON(data) {
    // Games from before the current rules and pool (rules 'single', the retired items) are no
    // longer supported; the store skips them.
    if (!RULES.includes(data.rules) || !data.pool?.every((id) => ITEMS[id])) throw new Error('a roulette game from before the current rules');
    const g = Object.create(Roulette.prototype);
    Object.assign(g, structuredClone(data));
    return g;
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

  // 断线: in the last round (all of a short game), a seat down to its last 额度 can't be healed.
  cut(id) {
    return ((this.rules === 'bo3' && this.stage === ROUNDS.length) || this.rules === 'short') && this.seat(id).hp === 1;
  }

  newLoad() {
    this.round++;
    const r = this.rules === 'bo3' ? ROUNDS[this.stage - 1] : this.rules === 'short' ? SHORT : { shells: [3, 8], deal: 2 };
    const { live, blank, shells } = loadFor(this.seed, this.round, r.shells);
    this.shells = shells;
    this.fired = [];
    this.announced = { live, blank };
    this.muddled = false;
    this.know = {};
    const dealt = {};
    const lost = {};
    for (const s of this.seats) {
      const int = sealedInts(this.seed, `items:${this.round}:${s.id}`);
      dealt[s.id] = [];
      lost[s.id] = 0;
      for (let i = 0; i < r.deal; i++) {
        const id = this.pool[int(this.pool.length)];
        const slot = s.items.indexOf(null);
        if (slot < 0) lost[s.id]++;
        else {
          s.items[slot] = id;
          s.conj[slot] = null;
          dealt[s.id].push({ slot, item: id });
        }
      }
    }
    this.emit('load', { live, blank, dealt, lost, ...(this.stage && { stage: this.stage }) });
  }

  waitingOn() {
    return this.phase === 'playing' ? [this.turn] : [];
  }

  legalActions(seatId) {
    if (this.phase !== 'playing' || this.turn !== seatId) return [];
    return ['use', 'shoot'];
  }

  // { action: 'use', item | slot, pick? } · { action: 'shoot', target: 'self' | 'other' } · { action: 'quit' }
  // pick: for 越狱, the other seat's slot or item to take (default: the first it can).
  apply(seatId, input) {
    if (input.action === 'quit') return this.quit(seatId);
    if (this.phase !== 'playing') return { error: 'the game is over' };
    if (this.turn !== seatId) return { error: 'not your turn' };
    if (input.action === 'use') return this.use(seatId, input);
    if (input.action === 'shoot') return this.shoot(seatId, input.target);
    return { error: `unknown action: ${input.action}` };
  }

  use(seatId, { item, slot, pick }) {
    const me = this.seat(seatId);
    const them = this.seat(this.other(seatId));
    // By name, a dealt one before a 幻觉 one, which might be fake.
    if (slot === undefined || slot === null) {
      slot = me.items.findIndex((x, i) => x === item && !me.conj[i]);
      if (slot < 0) slot = me.items.indexOf(item);
    }
    slot = Number(slot);
    const id = me.items[slot];
    if (!id) return { error: item ? `you don't hold ${item}` : 'no item there' };
    if (id === 'refuse') return { error: `${ITEMS.refuse.name} works by itself when you're hit; it can't be used` };
    // Neither stacks, so neither is wasted: one 温度拉满 per shot, one 429 per turn of theirs.
    if (id === 'temp' && this.double[seatId]) return { error: `${ITEMS.temp.name} is already on for your next shot` };
    if (id === 'limit' && this.skip[them.id]) return { error: `${them.name} is already rate-limited` };
    const e = { seat: seatId, item: id, slot };
    // A 幻觉 item shows what it was only now: a fake one is gone and does nothing.
    const conj = me.conj[slot];
    if (conj?.fake) {
      me.items[slot] = null;
      me.conj[slot] = null;
      e.fake = true;
      this.emit('use', e);
      return { ok: true };
    }
    let effect = id;
    if (id === 'jailbreak') {
      let from = pick === undefined || pick === null ? them.items.findIndex((x) => x && !UNTAKEABLE.has(x)) : /^\d+$/.test(String(pick)) ? Number(pick) : them.items.indexOf(pick);
      const took = them.items[from];
      if (!took) return { error: pick === undefined || pick === null ? `${them.name} holds nothing you can take` : `${them.name} doesn't hold that` };
      if (UNTAKEABLE.has(took)) return { error: `${ITEMS.jailbreak.name} can't take ${ITEMS[took].name}` };
      const fake = them.conj[from]?.fake;
      them.items[from] = null;
      them.conj[from] = null;
      e.took = { slot: from, item: took };
      if (fake) e.took.fake = true;
      effect = fake ? null : took;
    }
    me.items[slot] = null;
    me.conj[slot] = null;
    if (effect) this.effect(seatId, effect, slot, e);
    this.emit('use', e);
    if (me.hp === 0) return this.endRound(them.id);
    if (!this.shells.length) this.newLoad();
    return { ok: true };
  }

  // What an item does, for whoever uses it (a 越狱 uses the other seat's item as its own).
  effect(seatId, id, slot, e) {
    const me = this.seat(seatId);
    const o = this.other(seatId);
    const learn = (i, live, sure) => ((this.know[seatId] ??= {})[i] = { live, sure });
    switch (id) {
      case 'cot':
        learn(0, this.shells[0], true);
        break;
      case 'compact': {
        e.live = this.next('compact');
        break;
      }
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
        if (this.stage) e.max = this.maxHp; // the round may be over by the time it's told
        break;
      case 'mirage': {
        // Two items from the pool (never 幻觉 itself), each sealed real or fake; the first
        // takes the 幻觉's own slot.
        const int = sealedInts(this.seed, `mirage:${this.draws.mirage++}`);
        const from = this.pool.filter((x) => x !== 'mirage');
        e.made = [];
        e.lost = 0;
        for (let i = 0; i < 2; i++) {
          const item = from[int(from.length)];
          const fake = int(2) === 0;
          const at = i === 0 ? slot : me.items.indexOf(null);
          if (at < 0) {
            e.lost++;
            continue;
          }
          me.items[at] = item;
          me.conj[at] = { fake };
          e.made.push({ slot: at, item });
        }
        break;
      }
    }
  }

  // The shell in the chamber leaves the gun; what each seat knew moves up one.
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
    if (target !== 'self' && target !== 'other') return { error: 'shoot self or other' };
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
        if (fake) e.refuseFake = refuse; // a 幻觉 refusal: it refuses nothing
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
    return { ok: true };
  }

  // Someone ran out of 额度. A short game ends; a match scores the round and, unless that
  // was the second win, starts the next: both full again, items kept, a fresh gun, and
  // the round's loser shoots first.
  endRound(winner) {
    if (this.rules !== 'bo3') return this.finish(winner);
    const loser = this.other(winner);
    this.wins[winner]++;
    this.emit('round_over', { stage: this.stage, winner, wins: { ...this.wins } });
    if (this.wins[winner] === 2) return this.finish(winner);
    this.stage++;
    this.maxHp = ROUNDS[this.stage - 1].hp;
    for (const s of this.seats) s.hp = this.maxHp;
    this.double = {};
    this.skip = {};
    this.turn = loser;
    this.turnNo++;
    this.newLoad();
    return { ok: true };
  }

  quit(seatId) {
    if (this.phase === 'over') return { error: 'the game is over' };
    this.emit('quit', { seat: seatId });
    return this.finish(null);
  }

  finish(winner) {
    this.phase = 'over';
    this.turn = null;
    this.winner = winner;
    this.emit('game_over', { winner, hp: Object.fromEntries(this.seats.map((s) => [s.id, s.hp])), ...(this.rules === 'bo3' && { wins: { ...this.wins } }) });
    return { ok: true };
  }

  // What one seat may see. The gun's order stays sealed; peeks are private.
  view(seatId) {
    const over = this.phase === 'over';
    const left = this.shells.length;
    const known = this.know[seatId] ?? {};
    const liveLeft = this.shells.filter(Boolean).length;
    return {
      game: 'roulette',
      you: seatId,
      round: this.round,
      rules: this.rules,
      stage: this.stage, // the round of the match, 1 to 3 (null in a short game)
      stages: this.rules === 'bo3' ? ROUNDS.length : null,
      wins: { ...this.wins },
      phase: this.phase,
      turn: this.turn,
      turnNo: this.turnNo,
      maxHp: this.maxHp,
      // conjured: which items came from a 幻觉 (real or fake is never shown)
      seats: this.seats.map((s) => ({ id: s.id, name: s.name, hp: s.hp, items: s.items.slice(), conjured: s.conj.map(Boolean), cut: this.cut(s.id) })),
      announced: this.announced,
      fired: this.fired.slice(),
      left,
      liveLeft: this.muddled ? null : liveLeft,
      blankLeft: this.muddled ? null : left - liveLeft,
      know: known[0] ?? null, // the chamber
      ahead: Object.entries(known).filter(([i]) => Number(i) > 0).map(([i, k]) => ({ at: Number(i), ...k })).sort((a, b) => a.at - b.at), // further down
      double: !!this.double[seatId],
      winner: this.winner,
      waitingOn: this.waitingOn(),
      legal: this.legalActions(seatId),
      commit: commitOf(this.seed),
      seed: over ? this.seed : null,
      log: this.log,
    };
  }

  // Re-run a whole game from the seed and the logged actions; verify compares logs.
  // pool: the one the game was dealt from (the reveal gives it); the current one if not.
  static replay(seed, seats, log, { pool, rules } = {}) {
    const g = new Roulette({ seats, seed, pool: pool ?? POOL, rules: rules ?? 'bo3' });
    for (const e of log) {
      if (e.type === 'use') g.apply(e.seat, { action: 'use', slot: e.slot, pick: e.took?.slot });
      else if (e.type === 'shoot') g.apply(e.seat, { action: 'shoot', target: e.target === e.seat ? 'self' : 'other' });
      else if (e.type === 'quit') g.apply(e.seat, { action: 'quit' });
    }
    return g;
  }
}

// ---- text for agent seats ----------------------------------------------------

// Item names and terms as the human's page shows them, read from the page's own language
// files (web/play/i18n/), so the agent calls things exactly what the human sees.
const I18N = new URL('../../web/play/i18n/', import.meta.url);
const LANGS = ['en', 'zh-CN', 'zh-TW', 'ja', 'ko', 'es', 'fr', 'de', 'pt-BR', 'ru'];
const DICTS = Object.fromEntries(await Promise.all(LANGS.map(async (id) => [id, (await import(new URL(`${id}.js`, I18N)).catch(() => null))?.default ?? {}])));
// The same matching as the page's i18n.js: zh-HK reads Traditional, any pt reads pt-BR.
export function matchLang(tag) {
  const t = String(tag ?? '').toLowerCase();
  const hit = LANGS.find((id) => id.toLowerCase() === t);
  if (hit) return hit;
  if (t.startsWith('zh')) return /hant|tw|hk|mo/.test(t) ? 'zh-TW' : 'zh-CN';
  if (t.startsWith('pt')) return 'pt-BR';
  return LANGS.find((id) => id === t.split('-')[0]) ?? 'en';
}
export const words = (lang) => {
  const d = DICTS[matchLang(lang)];
  const en = DICTS.en;
  const term = (k) => d.terms?.[k] ?? en.terms[k];
  const item = (id) => d.items?.[id]?.name ?? en.items[id].name;
  return { quota: term('quota'), cut: term('cut'), fakeTool: term('fakeTool'), mirage: item('mirage'), item };
};
const itemName = (W, id, conjured) => `${W.item(id)} (${id}${conjured ? `, from ${W.mirage}: real or fake` : ''})`;
const shellWord = (live) => (live ? 'live' : 'blank');

export const text = {
  board(g, viewer, name, lang) {
    const W = words(lang);
    const v = g.view(viewer);
    const hp = v.seats.map((s) => `${name(s.id)} ${s.hp}/${v.maxHp} ${W.quota}${s.cut ? ` (${W.cut}: no healing)` : ''}`).join(' · ');
    const score = v.stage ? `Round ${v.stage}/${v.stages} (${v.seats.map((s) => `${name(s.id)} ${v.wins[s.id]}`).join(' – ')}) · ` : '';
    const lines = [`${score}Load ${v.round} · ${hp}`];
    lines.push(v.liveLeft === null ? `Gun: ${v.left} left; counts unknown since a ${W.item('inject')} flipped one` : `Gun: ${v.left} left (${v.liveLeft} live, ${v.blankLeft} blank)`);
    if (v.fired.length) lines.push(`Out this load: ${v.fired.map((f) => shellWord(f.live) + (f.how === 'compact' ? ' (compacted)' : '')).join(', ')}`);
    for (const s of v.seats) {
      // Your own hand is numbered by slot, for moyu use --slot.
      const held = s.items.flatMap((x, i) => (x ? [`${s.id === viewer ? `[${i + 1}] ` : ''}${itemName(W, x, s.conjured[i])}`] : []));
      lines.push(`${name(s.id)} hold${s.id === viewer ? '' : 's'}: ${held.length ? held.join(', ') : 'nothing'}`);
    }
    if (v.know) lines.push(`You know the chamber is ${shellWord(v.know.live)}.`);
    for (const a of v.ahead) lines.push(`You know shell #${a.at + 1} (the chamber is #1) is ${shellWord(a.live)}.`);
    if (v.double) lines.push(`${W.item('temp')}: your next shot does 2.`);
    return lines.join('\n');
  },

  prompt(g, viewer, tableId) {
    const held = [...new Set(g.seat(viewer).items.filter((x) => x && x !== 'refuse'))];
    const use = held.length ? `moyu use <${held.join('|')}>${held.includes('jailbreak') ? ' (jailbreak takes --pick <their item>)' : ''}, then ` : '';
    return `Your turn: ${use}moyu shoot me | moyu shoot you  (--table ${tableId} [--say "..."])`;
  },

  describe(g, e, viewer, name, lang) {
    const W = words(lang);
    switch (e.type) {
      case 'load': {
        const deal = Object.entries(e.dealt).map(([id, d]) => `${name(id)} +${d.map((x) => W.item(x.item)).join(', +') || 'nothing'}${e.lost[id] ? ` (${e.lost[id]} lost, hand full)` : ''}`);
        return `— ${e.stage ? `Round ${e.stage}, load` : 'Load'} ${e.round}: ${e.live} live, ${e.blank} blank. Items: ${deal.join('; ')} —`;
      }
      case 'use': {
        const who = name(e.seat);
        const whose = (id) => (id === viewer ? 'your' : `${name(id)}'s`);
        if (e.fake) return `${who} used ${W.item(e.item)}: it was a ${W.mirage} and vanished (${W.fakeTool}).`;
        if (e.took?.fake) return `${who} used ${W.item('jailbreak')} to take ${whose(g.other(e.seat))} ${W.item(e.took.item)}: it was a ${W.mirage} and vanished.`;
        const id = e.took?.item ?? e.item;
        const extra =
          id === 'compact' ? `: ejected a ${shellWord(e.live)}` :
          id === 'cache' ? (e.cut ? `: ${W.cut}, it does nothing` : ` → ${e.hp}/${e.max ?? g.maxHp}`) :
          id === 'mirage' ? `: conjured ${e.made.map((x) => W.item(x.item)).join(' and ')}, each real or fake${e.lost ? ` (${e.lost} lost, hand full)` : ''}` :
          id === 'inject' ? ': the chamber is flipped' :
          '';
        if (e.took) return `${who} used ${W.item('jailbreak')} to take ${whose(g.other(e.seat))} ${W.item(id)} and used it${extra}.`;
        return `${who} used ${W.item(e.item)}${extra}.`;
      }
      case 'shoot': {
        const at = e.target === e.seat ? (e.seat === viewer ? 'yourself' : 'themself') : name(e.target);
        const fake = e.refuseFake !== undefined ? `its ${W.item('refuse')} was a ${W.mirage}, ` : '';
        const what = !e.live ? 'blank.' : e.refused !== undefined ? `live, refused by ${W.item('refuse')}.` : `live, ${fake}-${e.damage} (${name(e.target)} ${e.hp}/${e.max ?? g.maxHp}).`;
        return `${name(e.seat)} shot ${at === 'You' ? 'you' : at}: ${what}`;
      }
      case 'skip': return `${name(e.seat)} ${e.seat === viewer ? 'are' : 'is'} rate-limited (429) and skip${e.seat === viewer ? '' : 's'} a turn.`;
      case 'quit': return `${name(e.seat)} ended the game.`;
      case 'round_over': {
        const score = Object.entries(e.wins).map(([id, w]) => `${name(id)} ${w}`).join(' – ');
        const next = Math.max(...Object.values(e.wins)) < 2 ? ` Round ${e.stage + 1}: ${ROUNDS[e.stage].hp} ${W.quota} each, items kept; ${name(g.other(e.winner))} shoot${g.other(e.winner) === viewer ? '' : 's'} first.` : '';
        return `${name(e.winner)} take${e.winner === viewer ? '' : 's'} round ${e.stage} (${score}).${next}`;
      }
      case 'game_over':
        if (!e.winner) return 'Game ended.';
        if (e.wins) return `${name(e.winner)} win${e.winner === viewer ? '' : 's'} the match ${e.wins[e.winner]}–${e.wins[g.other(e.winner)]}.`;
        return `${name(e.winner)} win${e.winner === viewer ? '' : 's'}. ${name(g.other(e.winner))} ran out of ${W.quota}.`;
      default: return null;
    }
  },
};
