// A room: the one link the human keeps open, like a lofi stream in a pinned tab. It has
// a scene and the games played in it one after another, each its own sealed table with
// the room's seats. The agent listens on one socket for the whole room: it stays open
// across games, and chat said with no game on wakes the agent too.
import { randomBytes } from 'node:crypto';
import { words } from './games/roulette.mjs';
import { Waiter } from './next.mjs';
import { DEFAULT_LANG, HUMAN, Table, cleanLang, moodError, renameError, renameLine, rulesError } from './table.mjs';

const token = () => randomBytes(16).toString('hex');

// The scenes and the games each one hosts.
export const SCENES = {
  raft: { games: ['blackjack', 'yacht'] },
  machine: { games: ['roulette'] },
};
// Scenes that were renamed: rooms saved under the old id, and callers still using it, land
// in the new one.
const RENAMED = { terrace: 'raft' };
export const sceneId = (scene) => RENAMED[scene] ?? scene;
const TITLES = { roulette: 'Roulette', blackjack: 'Blackjack', yacht: 'Yacht' };

// What a finished table leaves in the room's history: who won, the score, and for
// roulette the moments worth bringing up later (fake 幻觉 items, a 断线).
function summary(t) {
  const g = t.game;
  const end = g.log.findLast((e) => e.type === 'game_over') ?? {};
  const quit = g.log.some((e) => e.type === 'quit');
  const h = { table: t.id, game: t.kind, at: t.updatedAt, winner: quit ? null : g.winner ?? null, quit };
  if (t.kind === 'roulette') {
    h.score = end.wins ?? null;
    h.fakes = {};
    const cut = new Set();
    let stage = 1;
    const fake = (id) => (h.fakes[id] = (h.fakes[id] ?? 0) + 1);
    for (const e of g.log) {
      if (e.type === 'round_over') stage++;
      if (e.type === 'use' && e.fake) fake(e.seat);
      if (e.type === 'use' && e.took?.fake) fake(g.other(e.seat));
      if (e.type === 'shoot' && e.refuseFake !== undefined) fake(e.target);
      if (e.type === 'shoot' && e.live && e.hp === 1 && ((stage === 3 && g.rules === 'bo3') || g.rules === 'short')) cut.add(e.target);
    }
    h.cut = [...cut];
  }
  if (t.kind === 'blackjack') h.stacks = end.stacks ?? null;
  if (t.kind === 'yacht') h.totals = end.totals ?? null;
  return h;
}
const CHAT_SHOWN = 200;

export class Room {
  constructor({ scene: asked = 'raft', agentName = 'Clawd' } = {}) {
    const scene = sceneId(asked);
    if (!SCENES[scene]) throw new Error(`unknown scene: ${scene}; one of ${Object.keys(SCENES).join(', ')}`);
    this.id = randomBytes(4).toString('hex');
    this.scene = scene;
    this.lang = null; // the human's page language, once it has said
    this.createdAt = Date.now();
    this.updatedAt = this.createdAt;
    this.seats = [
      { id: 'human', name: HUMAN, kind: 'human', token: token() },
      { id: 'agent', name: agentName, kind: 'agent', token: token() },
    ];
    this.chat = []; // lines said with no game on; each game keeps its own
    this.tables = []; // the games played here, oldest first
    this.told = { chat: 0, table: null }; // the agent: room chat told, and the last table it was told of
    this.history = []; // one summary per finished game, kept after its table is pruned
    this.init();
  }

  // What is not saved: the sockets, the current table and the server's hooks.
  init() {
    this.subs = new Set();
    this.waiter = new Waiter(null, () => this.wake()); // the agent's moyu next
    this.table = null;
    this.getTable = () => null; // set by the server: a table by id
    this.addTable = null; // set by the server: register and persist a new table
    this.onChange = null; // set by the server to persist the room
  }

  // Holds the seat tokens: never send it to a client.
  toJSON() {
    const { id, scene, lang, createdAt, updatedAt, seats, chat, tables, told, history } = this;
    return { v: 1, id, scene, lang, createdAt, updatedAt, seats, chat, tables, told, history };
  }

  static fromJSON(data) {
    const r = Object.create(Room.prototype);
    const { v, ...rest } = structuredClone(data);
    Object.assign(r, rest);
    r.scene = sceneId(r.scene);
    r.history ??= [];
    r.lang ??= null;
    r.human.name = HUMAN; // saved when the human's seat could have a name
    r.init();
    return r;
  }

  changed() {
    this.updatedAt = Date.now();
    this.onChange?.(this);
  }

  seatByToken(k) {
    return this.seats.find((s) => s.token === k) ?? null;
  }

  get human() {
    return this.seats.find((s) => s.kind === 'human');
  }

  get agent() {
    return this.seats.find((s) => s.kind === 'agent');
  }

  get live() {
    return Boolean(this.table && this.table.game.phase !== 'over');
  }

  // Add the games that have ended since the last look to the history. Tables are kept a
  // week; their summaries stay with the room.
  noteFinished() {
    const noted = new Set(this.history.map((h) => h.table));
    for (const id of this.tables) {
      const t = id === this.table?.id ? this.table : this.getTable(id);
      if (!noted.has(id) && t?.game.phase === 'over') this.history.push(summary(t));
    }
  }

  // For the agent only, when a game opens: its record with the human at this game, and
  // what stood out the last time they played it. The human's page shows none of it; the agent may bring it
  // up in passing.
  historyLine(game) {
    const name = (id) => (id === 'agent' ? 'you' : this.human.name);
    const W = words(this.lang ?? DEFAULT_LANG);
    const played = this.history.filter((h) => h.game === game);
    const won = (id) => played.filter((h) => h.winner === id).length;
    const lines = [];
    if (played.length) {
      const other = played.length - won('human') - won('agent');
      lines.push(`Your ${TITLES[game]} record with ${this.human.name} here: ${this.human.name} ${won('human')}, you ${won('agent')}${other ? `, ${other} drawn or ended early` : ''}.`);
    }
    const last = played.at(-1);
    if (last) {
      const bits = [];
      if (last.quit) bits.push('ended early');
      else bits.push(last.winner ? `${name(last.winner)} won${last.score ? ` ${last.score[last.winner]}–${last.score[last.winner === 'agent' ? 'human' : 'agent']}` : ''}` : 'a draw');
      for (const [id, n] of Object.entries(last.fakes ?? {})) if (n >= 2) bits.push(`${id === 'agent' ? 'your' : `${this.human.name}'s`} ${W.mirage} came up fake ${n} times`);
      for (const id of last.cut ?? []) bits.push(`${name(id)} went ${W.cut} in round 3${last.winner === id ? ' and still won' : ''}`);
      lines.push(`Last time: ${bits.join('; ')}.`);
    }
    if (!lines.length) return null;
    return `${lines.join(' ')} (Only you see this. Bring it up now and then if it fits, not every game.)`;
  }

  // Hook a table into the room: its pushes go out through the room's sockets, and the
  // agent's room socket is not closed when the game ends.
  attach(table) {
    this.table = table;
    table.subs.add({ seat: this.human, send: () => (this.pushHuman(), true), close() {} });
    table.subs.add({ seat: this.agent, send: (text) => this.sendAgent(text), close() {} });
  }

  // ---- actions -------------------------------------------------------------

  // replace: end the game that is on (as a quit) and start this one in its place.
  // rules: the game's rule set (roulette: bo3 or short); other games ignore it.
  start(seat, game, { replace = false, rules = null } = {}) {
    const games = SCENES[this.scene].games;
    if (!games.includes(game)) return { error: `${game} isn't played in the ${this.scene} scene; here: ${games.join(', ')}` };
    if (rulesError(game, rules)) return { error: rulesError(game, rules) };
    if (this.live && !replace) return { error: 'a game is still on: finish or quit it first, or start with replace' };
    if (this.live) this.table.act(seat, { action: 'quit' });
    this.noteFinished();
    const table = new Table({ game, room: this.id, seats: this.seats, lang: this.lang, rules });
    this.addTable(table);
    this.tables.push(table.id);
    this.attach(table);
    const result = { ok: true, table: table.id };
    // A game the human opens is the agent's cue to sit down.
    if (seat.kind === 'agent') result.text = this.agentUpdate();
    else this.wake();
    this.pushHuman();
    this.changed();
    return result;
  }

  // End the game that is on, from either seat. It finishes as a quit: no winner, the
  // seed is revealed and the game still verifies.
  quit(seat) {
    if (!this.live) return { error: 'no game on' };
    const result = this.table.act(seat, { action: 'quit' });
    this.pushHuman();
    this.changed();
    return result;
  }

  // During a game, chat goes to the table; otherwise it stays in the room.
  say(seat, text, mood) {
    if (this.live) return this.table.say(seat, text, mood);
    if (!text?.trim()) return { error: 'empty message' };
    const bad = moodError(mood);
    if (bad) return bad;
    this.chat.push({ seq: this.chat.length, seat: seat.id, name: seat.name, text: String(text).slice(0, 500), at: Date.now(), ...(mood && { mood }) });
    const result = { ok: true };
    if (seat.kind === 'agent') result.text = this.agentUpdate() ?? `[moyu room ${this.id}] Said. No game on.`;
    else this.wake();
    this.pushHuman();
    this.changed();
    return result;
  }

  // The room's seats keep the name for games to come; a game on is renamed too, and
  // the line goes to its chat, otherwise to the room's.
  rename(seat, who, name) {
    const bad = renameError(seat, who, name);
    if (bad) return bad;
    const to = String(name).trim();
    const target = this.seats.find((s) => s.id === who);
    if (this.live) {
      this.table.renameSeat(seat, who, to);
      target.name = to;
      this.table.afterChange(seat);
    } else {
      this.chat.push({ seq: this.chat.length, seat: seat.id, name: seat.name, text: `${target.name} → ${to}`, rename: { who, from: target.name, to }, at: Date.now() });
      target.name = to;
      this.wake();
      this.pushHuman();
    }
    this.changed();
    return { ok: true };
  }

  setLang(lang) {
    lang = cleanLang(lang);
    if (!lang) return;
    this.table?.setLang(lang);
    if (lang === this.lang) return;
    this.lang = lang;
    this.changed();
  }

  // A game on in the old scene ends (as a quit) when replace is set.
  setScene(asked, seat, { replace = false } = {}) {
    const scene = sceneId(asked);
    if (!SCENES[scene]) return { error: `unknown scene: ${scene}; one of ${Object.keys(SCENES).join(', ')}` };
    if (this.live && !replace) return { error: 'a game is still on: finish or quit it first, or switch with replace' };
    if (this.live) this.table.act(seat, { action: 'quit' });
    this.scene = scene;
    this.pushHuman();
    this.changed();
    return { ok: true };
  }

  // ---- what each side is told ---------------------------------------------

  // While the agent asks with moyu next, its frames go there and nowhere else.
  sendAgent(text) {
    if (this.waiter.active) return this.waiter.send(text);
    let sent = false;
    for (const sub of this.subs) if (sub.seat.kind === 'agent' && sub.send(text)) sent = true;
    return sent;
  }

  pushHuman() {
    const state = JSON.stringify(this.humanState());
    for (const sub of this.subs) if (sub.seat.kind === 'human') sub.send(state);
  }

  // Send the agent whatever it is owed. A frame that didn't go out stays owed, so a
  // listener armed later gets it on connect.
  wake() {
    const t = this.table;
    const before = { room: { ...this.told }, table: t && { ...t.told.agent } };
    const text = this.agentUpdate();
    if (!text) return;
    if (!this.sendAgent(text)) {
      this.told = before.room;
      if (t) t.told.agent = before.table;
    }
    t?.changed();
    this.changed();
  }

  // moyu next --room: the agent's next frame, at once if one is owed, else when one comes
  // or after ms (null). Held while a game is on (see Waiter).
  async next(ms, signal) {
    const now = this.agentUpdate();
    if (now) this.waiter.hold();
    const text = now ?? (await this.waiter.wait(ms, signal));
    if (!this.live) this.waiter.release(); // between games, chat wakes the agent as usual
    this.table?.changed();
    this.changed();
    return text;
  }

  // Text for the agent, or null when nothing is worth a wake: room chat, a table just
  // opened, then whatever the current table still owes it.
  agentUpdate() {
    const lines = [];
    const heard = this.chat.slice(this.told.chat).filter((c) => c.seat !== 'agent');
    for (const c of heard) lines.push(c.rename ? renameLine(c, 'agent') : `${c.name} says: ${c.text}`);
    this.told.chat = this.chat.length;

    const t = this.table;
    if (t && this.told.table !== t.id) {
      this.told.table = t.id;
      lines.push(`A ${TITLES[t.kind]} table is open: ${t.id}. Sealed seed commit: ${t.game.view('agent').commit}`);
      const past = this.historyLine(t.kind);
      if (past) lines.push(past);
      lines.push(t.agentUpdate(this.agent, { force: true }));
    } else if (t && (this.live || t.told.agent.log < t.game.log.length)) {
      const text = t.agentUpdate(this.agent);
      if (text) lines.push(text);
    }
    if (!lines.length) return null;
    if (heard.length && !this.live) lines.push('', `No game on. Reply with: moyu say "<text>" --room ${this.id}`);
    return `[moyu room ${this.id}] ` + lines.join('\n');
  }

  // What the agent's `moyu room` and `moyu view --room` print.
  view() {
    const head = `[moyu room ${this.id}] Scene: ${this.scene} (games: ${SCENES[this.scene].games.join(', ')}).`;
    const t = this.table;
    if (!this.live) return `${head} No game on.\nStart one: moyu start <game> --room ${this.id}\nTalk: moyu say "<text>" --room ${this.id}`;
    return `${head} Game on: ${TITLES[t.kind]} table ${t.id}.\n\n${t.board('agent')}\n\n${t.game.waitingOn().includes('agent') ? t.prompt('agent') : 'Not your turn.'}`;
  }

  // The tables played here with their commits, so the agent's CLI can verify them.
  tableList() {
    return this.tables.map((id) => this.getTable(id)).filter(Boolean).map((t) => ({ id: t.id, game: t.kind, phase: t.game.phase, commit: t.game.view('agent').commit }));
  }

  // One chat for the whole room: what was said between games and at every table, in order.
  humanState() {
    const chat = [this.chat, ...this.tables.map((id) => this.getTable(id)?.chat ?? [])].flat().sort((a, b) => a.at - b.at).slice(-CHAT_SHOWN);
    const t = this.table;
    return {
      type: 'room',
      room: this.id,
      scene: this.scene,
      scenes: SCENES,
      seats: this.seats.map(({ id, name, kind }) => ({ id, name, kind })),
      table: t && { id: t.id, game: t.kind, phase: t.game.phase },
      chat,
    };
  }
}
