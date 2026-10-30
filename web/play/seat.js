// Your seat at a real table, for the games that came after roulette: the socket, a queue
// that plays each state's new log events out in order, chat, and sending moves. A game
// hands in how to lay the table out at once (sync), how to play one event (play), and
// what to show once it's caught up (settle). With director set there is no socket: a
// script's states come in through push() (web/play/director/).
import { lang, t } from './i18n.js';
import { serverUp } from './sleep.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const EMOJI_ONLY = /^\p{Extended_Pictographic}[\p{Extended_Pictographic}‍️]*$/u;

// Sound and the avatar's cues live on their own branches; until they land, the table is
// silent and the agent just sits there. Hook names: cards card-bcpydqqf and card-0twvw1bk.
const audio = await import('./audio.js').catch(() => null);
export const sfx = (name, opts) => audio?.sfx?.(name, opts);
export const mood = (v) => audio?.setMood?.(v);
export const cues = await import('./avatar/cues.js').catch(() => null);

// opp: the avatar. A state the avatar doesn't know falls back on its side; an older
// opponent without states just ignores it.
export const avatar = (opp, state, detail) => opp.setState?.(state, detail);

export function joinTable({ table, k, hud, opp, sync, play, settle, say = hud.say, director = false }) {
  const state = { v: null, names: {}, busy: false, playing: false };
  const queue = [];
  const idlers = []; // the director, waiting for the room to finish playing
  let shown = null; // how much of the log has been played out
  let chatShown = 0;

  async function send(path, body) {
    const r = await fetch(`/api/tables/${table}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ k, ...body }) });
    return r.json();
  }

  async function drain() {
    if (state.playing) return;
    state.playing = true;
    while (queue.length) {
      const s = queue.shift();
      const first = shown === null;
      state.v = s.view;
      for (const seat of s.seats) state.names[seat.id] = seat.name;
      hud.setOppName?.(s.seats.find((x) => x.id !== state.v.you)?.name);
      // Chat first: a line the agent sent with its move belongs before the move plays.
      for (const c of s.chat.slice(chatShown)) {
        const text = c.text.trim();
        if (c.rename) hud.log(hud.renameLine(c.rename));
        else if (first) hud.log(text, c.seat === state.v.you ? 'you' : 'opp');
        else if (c.seat === state.v.you) {
          // logged when you sent it; an emoji of yours lands on the agent as the thrown
          // one reaches its head (the echo is back well before the throw ends)
          if (EMOJI_ONLY.test(text)) setTimeout(() => avatar(opp, 'catch', { emoji: text }), 650); // avatar
        }
        else if (EMOJI_ONLY.test(text)) {
          sfx('emote');
          avatar(opp, 'emote', { emoji: text, mood: c.mood }) ?? opp.emote(text); // avatar: mood, the face it sends it with
        } else {
          sfx('chat');
          avatar(opp, 'talking', { text, mood: c.mood }); // avatar
          say(text, c.mood);
        }
      }
      chatShown = s.chat.length;
      if (first) {
        sync(state.v);
        shown = state.v.log.length;
        if (state.v.phase !== 'over') cues?.greet?.(opp); // avatar: you sat down, or the game opened
      }
      for (const e of state.v.log.slice(shown)) {
        try {
          await play(e, state.v);
        } catch (err) {
          console.error(err);
        }
      }
      shown = state.v.log.length;
    }
    state.playing = false;
    settle(state.v);
    for (const r of idlers.splice(0)) r();
  }

  let ws = null;
  let closed = false; // the game was taken off the table: no more reconnects
  function connect() {
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?table=${table}&k=${k}&lang=${lang}`);
    ws.onopen = () => {
      // a reconnect lays the table out again from scratch
      shown = null;
      chatShown = 0;
      document.querySelector('#log').replaceChildren();
    };
    ws.onmessage = (m) => {
      const s = JSON.parse(m.data);
      if (s.type !== 'state') return;
      queue.push(s);
      drain();
    };
    ws.onclose = async (e) => {
      if (closed || state.v?.phase === 'over') return;
      if (e.code === 4003) return hud.status(t('ui.table.gone'));
      // The server stops when nobody uses it, and only the agent's next command starts it.
      const up = await serverUp();
      hud.status(t(up ? 'ui.table.reconnecting' : 'ui.table.asleep'));
      setTimeout(connect, up ? 1500 : 5000);
    };
  }
  if (!director) connect();

  return {
    // a state as the socket would bring it, and a promise of the room having played it out
    push(s) {
      queue.push(s);
      drain();
    },
    idle: () => (state.playing || queue.length ? new Promise((r) => idlers.push(r)) : Promise.resolve()),
    state,
    send,
    close() {
      closed = true;
      ws?.close();
    },
    // Your move. Errors come back as a toast and the table settles again.
    async act(body) {
      state.busy = true;
      const r = await send('act', body).catch((err) => ({ error: String(err) }));
      state.busy = false;
      if (r.error) hud.toast(r.error, 1800);
      // the new state may have settled while the move was still on its way
      if (state.v && !state.playing && !queue.length) settle(state.v);
      return r;
    },
    yourTurn: () => !!state.v && state.v.phase === 'playing' && state.v.turn === state.v.you && !state.busy && !queue.length && !state.playing,
    side: (id) => (id === state.v.you ? 'you' : 'opp'),
    nameOf: (id) => (id === state.v.you ? t('ui.common.you') : state.names[id]),
    oppId: () => state.v.seats.find((s) => s.id !== state.v.you).id,
    wait,
  };
}
