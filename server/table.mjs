// A table: one game, its seats and tokens, the table chat, and who gets told what.
// Human seats get the full seat view as JSON on every change. Agent seats get short
// text on every move the other seat makes: at once for their turn, a chat line or the
// end, and otherwise a moment later, so a run of moves comes as one wake.
import { randomBytes } from 'node:crypto';
import * as blackjack from './games/blackjack.mjs';
import * as roulette from './games/roulette.mjs';
import * as yacht from './games/yacht.mjs';
import { Waiter } from './next.mjs';
import { newSeed } from './seal.mjs';

const token = () => randomBytes(16).toString('hex');

// How the agent's avatar can look on its own moves and lines (moyu ... --mood).
export const MOODS = ['happy', 'smug', 'flat', 'angry', 'wide', 'sad', 'squint', 'shut', 'sleep'];
export const moodError = (mood) => (mood && !MOODS.includes(mood) ? { error: `unknown mood: ${mood}; one of ${MOODS.join(', ')}` } : null);

// The human's page language (a BCP 47 tag the page reports). Until a page has said, the
// machine's own locale stands in. The agent's text names things the way that page does.
export const DEFAULT_LANG = Intl.DateTimeFormat().resolvedOptions().locale;
export const cleanLang = (lang) => (/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(String(lang ?? '')) ? String(lang) : null);

// The human's seat has no name of its own: the page calls it "you", the agent's text "Human".
export const HUMAN = 'Human';
// Only the human renames, and only the agent's seat. The new name lands in chat as a line
// of its own, so the agent hears it and the page can show it.
export function renameError(seat, who, name) {
  if (seat.kind !== 'human') return { error: 'only the human renames seats' };
  if (who !== 'agent') return { error: 'only the agent seat takes a name' };
  const clean = String(name ?? '').trim();
  if (!clean || [...clean].length > 24) return { error: 'a name is 1 to 24 characters' };
  return null;
}
export const renameLine = (c, viewer) => `${c.name} renamed ${c.rename.who === viewer ? 'you' : c.rename.from} to ${c.rename.to}.`;

// The games a table can host: each brings its engine, the text its agent seats read, and
// the rule sets a new game may pick (the first is the default; none means rules are ignored).
export const KINDS = {
  blackjack: { Game: blackjack.Blackjack, text: blackjack.text },
  roulette: { Game: roulette.Roulette, text: roulette.text, rules: roulette.RULES },
  yacht: { Game: yacht.Yacht, text: yacht.text },
};

// Why these rules can't open this game, or null when they can.
export function rulesError(game, rules) {
  const sets = KINDS[game]?.rules;
  if (rules == null || !sets || sets.includes(rules)) return null;
  return `unknown rules for ${game}: ${rules}; one of ${sets.join(', ')}`;
}

export class Table {
  // How long a move that isn't the agent's cue waits for more before it is told.
  static BATCH_MS = 1500;
  // After game over: how long the agent's seat stays open while the table is quiet, and
  // how long after the human's page closes. Listeners follow a finished table as long.
  static LINGER_MS = Number(process.env.MOYU_LINGER_MS ?? 10 * 60 * 1000);
  static GRACE_MS = Number(process.env.MOYU_GRACE_MS ?? 60 * 1000);

  // A table in a room takes the room's seats, tokens and all, so the room's link and
  // the agent's room token work at every table played in it.
  constructor({ game = 'roulette', agentName = 'Clawd', room = null, seats = null, lang = null, rules = null }) {
    if (!KINDS[game]) throw new Error(`unknown game: ${game}`);
    if (rulesError(game, rules)) throw new Error(rulesError(game, rules));
    this.kind = game;
    this.id = randomBytes(4).toString('hex');
    this.room = room;
    this.lang = lang;
    this.createdAt = Date.now();
    this.updatedAt = this.createdAt;
    this.seats = seats ? structuredClone(seats) : [
      { id: 'human', name: HUMAN, kind: 'human', token: token() },
      { id: 'agent', name: agentName, kind: 'agent', token: token() },
    ];
    this.game = new KINDS[game].Game({ seats: this.seats, seed: newSeed(), ...(rules && KINDS[game].rules && { rules }) });
    this.chat = [];
    this.subs = new Set();
    this.waiters = {}; // per agent seat, once it asks with moyu next
    // Per agent seat: log and chat already told, and the last turn it was prompted for.
    this.told = Object.fromEntries(this.seats.filter((s) => s.kind === 'agent').map((s) => [s.id, { log: 0, chat: 0, promptKey: null }]));
    this.onChange = null; // set by the server to persist the table
  }

  // What a restart needs to resume the table exactly, told cursors included, so a
  // re-armed agent is owed the same things it was owed before. Holds the seed and
  // the seat tokens: never send it to a client.
  toJSON() {
    const { id, kind, room, lang, createdAt, updatedAt, seats, game, chat, told } = this;
    return { v: 1, id, kind, room, lang, createdAt, updatedAt, seats, game: game.toJSON(), chat, told };
  }

  static fromJSON(data) {
    const t = Object.create(Table.prototype);
    const { v, game, ...rest } = structuredClone(data);
    Object.assign(t, rest);
    t.kind ??= 'blackjack'; // tables saved before there was a choice
    t.room ??= null;
    t.lang ??= null;
    t.game = KINDS[t.kind].Game.fromJSON(game);
    // saved when the human's seat could have a name
    for (const s of [...t.seats, ...t.game.seats]) if (s.id === 'human') s.name = HUMAN;
    t.subs = new Set();
    t.waiters = {};
    t.onChange = null;
    return t;
  }

  get kindOf() {
    return KINDS[this.kind];
  }

  changed() {
    this.updatedAt = Date.now();
    this.onChange?.(this);
  }

  seatByToken(k) {
    return this.seats.find((s) => s.token === k) ?? null;
  }

  // ---- actions -------------------------------------------------------------

  // mood: how the seat's avatar looks doing it, kept on the move's first event.
  act(seat, { say, mood, ...input }) {
    const bad = moodError(mood);
    if (bad) return bad;
    const from = this.game.log.length;
    const result = this.game.apply(seat.id, input);
    if (result.error) return result;
    if (mood && this.game.log[from]) this.game.log[from].mood = mood;
    if (say) this.addChat(seat, say);
    return this.afterChange(seat);
  }

  say(seat, text, mood) {
    if (!text?.trim()) return { error: 'empty message' };
    const bad = moodError(mood);
    if (bad) return bad;
    this.addChat(seat, text, mood);
    return this.afterChange(seat);
  }

  rename(seat, who, name) {
    const bad = renameError(seat, who, name);
    if (bad) return bad;
    this.renameSeat(seat, who, String(name).trim());
    return this.afterChange(seat);
  }

  renameSeat(seat, who, to) {
    const target = this.seats.find((s) => s.id === who);
    const rename = { who, from: target.name, to };
    target.name = to;
    this.chat.push({ seq: this.chat.length, seat: seat.id, name: seat.name, text: `${rename.from} → ${to}`, rename, round: this.game.round, at: Date.now() });
  }

  setLang(lang) {
    lang = cleanLang(lang);
    if (!lang || lang === this.lang) return;
    this.lang = lang;
    this.changed();
  }

  addChat(seat, text, mood) {
    this.chat.push({ seq: this.chat.length, seat: seat.id, name: seat.name, text: String(text).slice(0, 500), round: this.game.round, at: Date.now(), ...(mood && { mood }) });
  }

  // After any change: the actor gets its update in the response; everyone else by push.
  afterChange(actor) {
    const response = actor.kind === 'agent' ? { ok: true, text: this.agentUpdate(actor, { force: true }) } : { ok: true };
    for (const sub of this.subs) {
      if (sub.seat.kind === 'human') sub.send(JSON.stringify(this.humanState(sub.seat)));
      else {
        clearTimeout(sub.batch);
        sub.batch = null;
        if (sub.seat.id === actor.id) continue; // told in its own response
        if (!Table.BATCH_MS || this.cue(sub.seat)) this.push(sub);
        else {
          sub.batch = setTimeout(() => {
            sub.batch = null;
            this.push(sub);
            this.changed();
          }, Table.BATCH_MS);
          sub.batch.unref?.();
        }
      }
    }
    this.changed();
    this.linger();
    return response;
  }

  // After game over the agent's socket stays open for talk about the game: until the
  // table has been quiet for LINGER_MS, or no human page has been open for GRACE_MS
  // (a reload is not leaving). Then it closes with 1000 and listeners stop following.
  linger() {
    clearTimeout(this.lingerTimer);
    const agents = [...this.subs].filter((s) => s.seat.kind === 'agent');
    if (this.game.phase !== 'over' || !agents.length) return;
    const now = Date.now();
    const human = [...this.subs].some((s) => s.seat.kind === 'human');
    if (human || this.humanSeenAt === undefined) this.humanSeenAt = now;
    const deadline = Math.min(this.updatedAt + Table.LINGER_MS, human ? Infinity : this.humanSeenAt + Table.GRACE_MS);
    if (deadline <= now) {
      for (const sub of agents) sub.close();
      return;
    }
    this.lingerTimer = setTimeout(() => this.linger(), deadline - now);
    this.lingerTimer.unref?.();
  }

  // ---- what each seat is told ---------------------------------------------

  // Worth telling at once: its turn, a chat line for it, or the end.
  cue(seat) {
    const g = this.game;
    return g.phase === 'over' || g.waitingOn().includes(seat.id) || this.chat.slice(this.told[seat.id].chat).some((c) => c.seat !== seat.id);
  }

  push(sub) {
    // While the agent asks with moyu next, its frames go there and nowhere else.
    if (!sub.waiter && this.waiters[sub.seat.id]?.active) return;
    // A socket already closing must not mark the update as told, or a re-armed
    // listener would never get it.
    const before = { ...this.told[sub.seat.id] };
    const text = this.agentUpdate(sub.seat);
    if (text && sub.send(text) === false) this.told[sub.seat.id] = before;
  }

  // moyu next: the agent's next frame, at once if one is owed, else when one comes or
  // after ms (null). The seat stays held while the game is on (see Waiter).
  async next(seat, ms, signal) {
    let w = this.waiters[seat.id];
    if (!w) {
      w = this.waiters[seat.id] = new Waiter(seat, () => {
        for (const sub of this.subs) if (sub.seat.id === seat.id && !sub.waiter) this.push(sub);
        this.changed();
      });
      this.subs.add(w);
    }
    const now = this.agentUpdate(seat);
    if (now) w.hold();
    const text = now ?? (await w.wait(ms, signal));
    if (this.game.phase === 'over') w.release(); // the talk after it wakes the agent as usual
    this.changed();
    return text;
  }

  humanState(seat) {
    return { type: 'state', table: this.id, view: this.game.view(seat.id), chat: this.chat, seats: this.seats.map(({ id, name, kind }) => ({ id, name, kind })) };
  }

  // Text for an agent seat, or null when nothing is new. Every move the other seat makes
  // wakes it, so it sees the game as it happens, not only when the turn comes round.
  // force: the agent itself just acted, so always answer with what happened.
  agentUpdate(seat, { force = false } = {}) {
    const told = this.told[seat.id];
    const g = this.game;
    const waiting = g.waitingOn().includes(seat.id);
    const promptKey = this.promptKey(seat);
    const newTurn = promptKey && promptKey !== told.promptKey;
    const over = g.phase === 'over';
    const chatIn = this.chat.slice(told.chat).filter((c) => c.seat !== seat.id);
    const moved = g.log.length > told.log;
    if (!force && !newTurn && !moved && chatIn.length === 0) return null;

    const lines = [];
    const events = g.log.slice(told.log).map((e) => this.describe(e, seat.id)).filter(Boolean);
    if (events.length) lines.push(...events);
    for (const c of chatIn) lines.push(c.rename ? renameLine(c, seat.id) : `${c.name} says: ${c.text}`);
    told.log = g.log.length;
    told.chat = this.chat.length;
    if (promptKey) told.promptKey = promptKey;

    if (over && moved) {
      lines.push(`Game over. Seed ${g.seed} (commit ${g.view(seat.id).commit.slice(0, 12)}…). Verify: moyu verify --table ${this.id}`);
    } else if (over) {
      // Talk after the game: the seat stays open a while for it (see linger).
      lines.push(chatIn.length ? `Game over; reply with: moyu say "<text>" --table ${this.id}` : 'Said. The game is over.');
    } else if (waiting) {
      lines.push('', this.board(seat.id), '', this.prompt(seat.id));
    } else if (force || moved) {
      lines.push('', this.board(seat.id), '', `Waiting on ${g.waitingOn().map((id) => this.name(id, seat.id)).join(', ')}.`);
    }
    return `[moyu ${this.id}] ` + lines.join('\n');
  }

  // Which turn a prompt is for, or null when the seat isn't being waited on.
  promptKey(seat) {
    const g = this.game;
    return g.waitingOn().includes(seat.id) ? `${g.round}:${g.phase}:${g.turn}:${g.turnNo ?? ''}` : null;
  }

  // The seat has seen the table as it stands, so nothing is owed to it until the next
  // change. For the opening board, which the command that opened the table shows.
  caughtUp(seat) {
    const told = this.told[seat.id];
    told.log = this.game.log.length;
    told.chat = this.chat.length;
    told.promptKey = this.promptKey(seat);
  }

  name(id, viewer) {
    return id === viewer ? 'You' : this.seats.find((s) => s.id === id)?.name ?? id;
  }

  board(viewer) {
    return this.kindOf.text.board(this.game, viewer, (id) => this.name(id, viewer), this.lang ?? DEFAULT_LANG);
  }

  // Commands carry the table id so an agent with several tables open copies the right one.
  prompt(viewer) {
    return this.kindOf.text.prompt(this.game, viewer, this.id);
  }

  describe(e, viewer) {
    return this.kindOf.text.describe(this.game, e, viewer, (id) => this.name(id, viewer), this.lang ?? DEFAULT_LANG);
  }
}
