// A room: the one link the human keeps open, like a lofi stream in a pinned tab. One
// stage and one HUD for the life of the page. The scene (the casino hall, the machine room)
// is built once and stays, with the agent seated in it; a game runs in place on its
// table and is taken off again when the human leaves it or starts another. Between games
// the room is still alive: the agent idles, the bed plays, chat goes to the room.
// The server (server/room.mjs) pushes the room's state on every change.
import { lang, t } from './i18n.js';
import { serverUp } from './sleep.js';
import { createStage, layer, pixelEmoji } from './stage.js';
import { createHud, GAMES } from './hud.js';
import { setVibe, sfx, openSettings, placeSound } from './audio.js';
import { fitType } from './fit.js';
import { SCENES, GAME_NAMES, sceneOf } from './scenes.js';
import { setAgain } from './ending.js';
import { greet } from './avatar/cues.js'; // avatar

fitType();
await document.fonts.load('12px FusionPixel');

const $ = (s) => document.querySelector(s);
const roomId = location.pathname.split('/')[2];
const k = new URLSearchParams(location.search).get('k');
const NUDGE = { roulette: t('ui.nudge.roulette'), blackjack: t('ui.nudge.blackjack'), yacht: t('ui.nudge.yacht') };
const EMOJI_ONLY = /^\p{Extended_Pictographic}[\p{Extended_Pictographic}‍️]*$/u;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// A finished table the human walked away from stays walked away from across reloads.
const LEFT = `moyu-left-${roomId}`;
let left = null;
try {
  left = sessionStorage.getItem(LEFT);
} catch {}

let state = null; // the room as last pushed
let sceneName = null;
let sceneLayer = null;
let scene = null; // what the scene's build returned: { opp, casino } or { opp, room }
let game = null; // the game on the table: { id, game, layer }
let dirty = false; // the machine room has had a game in it: rebuild before the next
let played = false; // a game has been on the table since the page opened

const stage = createStage($('#view'), SCENES.raft.options);
openSettings(false); // made now, so no layer takes the ⚙ window with it

// The agent, in whichever scene it sits: the HUD pins the bubble and throws emotes at it.
const far = { x: -999, y: -999 };
const opp = {
  mouthScreen: () => scene?.opp.mouthScreen() ?? far,
  headScreen: () => scene?.opp.headScreen() ?? far,
  emote: (e) => scene?.opp.emote(e),
};

async function post(path, body) {
  const r = await fetch(`/api/rooms/${roomId}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ k, ...body }) })
    .then((x) => x.json())
    .catch((err) => ({ error: String(err) }));
  if (r.error) hud.toast(r.error, 2000);
  return r;
}

let menuList = null;
const hud = createHud(stage, opp, { game: null, send: (text) => post('say', { text }), menu: (list) => (menuList = list) });
const live = () => !!state?.table && state.table.phase !== 'over';

// ---- the menu: scenes first, then the games in each ----------------------------------
function renderMenu() {
  if (!menuList || !state) return;
  const items = [];
  if (live()) {
    const li = document.createElement('li');
    li.className = 'leave quit';
    li.innerHTML = `<div><div>${t('ui.room.endGame')}</div><div class="desc">${t('ui.room.endGameDesc')}</div></div>`;
    li.onclick = () => endGame();
    items.push(li);
  }
  if (game && !live()) {
    const li = document.createElement('li');
    li.className = 'leave';
    li.innerHTML = `<div><div>${t('ui.room.leaveTable')}</div><div class="desc">${t('ui.room.leaveTableDesc')}</div></div>`;
    li.onclick = () => (hud.toggleGames(false), leave());
    items.push(li);
  }
  for (const [name, def] of Object.entries(SCENES)) {
    const head = document.createElement('li');
    head.className = `scene-head${name === state.scene ? ' here' : ''}`;
    head.textContent = def.name;
    if (name === state.scene) head.insertAdjacentHTML('beforeend', `<span class="tag">${t('ui.room.here')}</span>`);
    items.push(head);
    for (const id of def.games) {
      const g = GAMES.find((x) => x.id === id);
      const on = live() && state.table.game === id;
      const li = document.createElement('li');
      li.className = on ? 'current' : '';
      const icon = pixelEmoji(g?.icon ?? '🐟');
      icon.className = 'icon';
      li.append(icon);
      li.insertAdjacentHTML('beforeend', `<div><div></div><div class="desc"></div></div><div class="tag"></div>`);
      li.querySelector('div > div').textContent = GAME_NAMES[id];
      li.querySelector('.desc').textContent = g?.desc ?? '';
      li.querySelector('.tag').textContent = on ? t('ui.hud.playing') : live() ? t('ui.room.switchTo') : name === state.scene ? '' : t('ui.room.changeScene');
      li.append(hud.rulesButton(id) ?? '');
      li.onclick = () => pick(name, id);
      items.push(li);
    }
  }
  menuList.replaceChildren(...items);
}

// Mid-game, another game (or scene) ends this one first: asked, then sent as a replace.
async function pick(sceneId, gameId) {
  const replace = live();
  if (replace && state.table.game === gameId) return hud.toast(t('ui.room.alreadyPlaying'), 1600);
  hud.toggleGames(false);
  if (replace && !(await ask(t('ui.room.askSwitch', { game: GAME_NAMES[gameId] }), t('ui.room.endAndStart')))) return;
  if (sceneId !== state.scene) {
    if ((await post('scene', { scene: sceneId, replace })).error) return;
    return post('start', { game: gameId });
  }
  await post('start', { game: gameId, replace });
}

// End the game that is on: no winner, the seed revealed; the page then shows that ending.
async function endGame() {
  hud.toggleGames(false);
  if (!live() || !(await ask(t('ui.room.askEnd'), t('ui.room.endGame')))) return;
  await post('quit', {});
}

// A yes/no in a small window over the page: Enter says yes, Esc or a click beside it no.
function ask(text, yes) {
  return new Promise((done) => {
    const veil = document.createElement('div');
    veil.className = 'veil';
    veil.innerHTML = `<section class="window confirm" role="alertdialog">
      <p></p>
      <div class="confirm-row"><button class="pixbtn yes"></button><button class="pixbtn no">${t('ui.common.cancel')}</button></div>
    </section>`;
    veil.querySelector('p').textContent = text;
    veil.querySelector('.yes').textContent = yes;
    const keys = new AbortController();
    const close = (ok) => {
      keys.abort();
      veil.remove();
      done(ok);
    };
    veil.querySelector('.yes').onclick = () => close(true);
    veil.querySelector('.no').onclick = () => close(false);
    veil.addEventListener('click', (e) => e.target === veil && close(false));
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.key !== 'Escape' && e.key !== 'Enter') return;
        e.preventDefault();
        e.stopImmediatePropagation();
        close(e.key === 'Enter');
      },
      { capture: true, signal: keys.signal },
    );
    $('.hud').append(veil);
    veil.querySelector('.yes').focus();
  });
}

// After a game: play the same again, or leave the table for the room.
setAgain(() => {
  const row = document.createElement('div');
  row.className = 'result-again room-again';
  const again = document.createElement('button');
  again.className = 'pixbtn';
  again.textContent = t('ui.ending.again');
  again.onclick = () => game && post('start', { game: game.game });
  const back = document.createElement('button');
  back.className = 'pixbtn';
  back.textContent = t('ui.room.backToRoom');
  back.onclick = () => leave();
  row.append(again, back);
  return row;
});

function leave() {
  if (!game || live()) return;
  left = game.id;
  try {
    sessionStorage.setItem(LEFT, left);
  } catch {}
  apply();
}

// ---- the room between games -------------------------------------------------------
const idleTips = (name) => (name === 'games' ? t('ui.room.pickGame') : null);
function idleStatus() {
  const agent = state.seats.find((s) => s.kind === 'agent').name;
  hud.status(t(scene.casino ? 'ui.room.idleTable' : 'ui.room.idle', { name: agent }));
}
function idle() {
  idleStatus();
  hud.idle(true);
  hud.interact(idleTips, () => {});
  $('#game-name').textContent = SCENES[sceneName].name;
  document.body.dataset.game = SCENES[sceneName].games[0];
  setVibe(SCENES[sceneName].games[0]);
  // the ？ panel opens on the last game played here, or the scene's first
  if (!played) hud.setGame(SCENES[sceneName].games[0]);
}

// Small loops while nobody plays: looking about, a think, now and then a little emote.
setInterval(() => {
  if (game || !scene || document.hidden) return;
  const r = Math.random();
  scene.opp.setState?.(r < 0.65 ? 'idle' : r < 0.82 ? 'watching' : 'thinking');
  if (Math.random() < 0.12) setTimeout(() => !game && scene?.opp.emote(['🐟', '☕', '🎵', '💤'][Math.floor(Math.random() * 4)]), 1800);
}, 9000);

// ---- scenes and games in place ----------------------------------------------------
function curtain(on, ms = 520) {
  $('#curtain').classList.toggle('on', on);
  return wait(ms);
}

function buildScene(name) {
  sceneLayer?.dispose();
  stage.setRoom(SCENES[name].options);
  document.body.dataset.scene = name;
  sceneLayer = layer(stage);
  scene = SCENES[name].build(sceneLayer);
  placeSound(stage.camera, scene.casino?.sound ?? scene.sound); // sound: where its sources are
  sceneName = name;
  dirty = false;
  // between games, the table itself opens the menu
  if (scene.casino) sceneLayer.pickable('games', scene.casino.felt);
}

function unmount() {
  if (!game) return;
  game.layer.dispose();
  game = null;
  $('#tip').hidden = true;
  stage.setHover(null);
  scene.opp.setProps?.({});
  scene.opp.setState?.('idle');
  scene.casino?.print();
}

async function mount(t) {
  const mod = await import(`./${t.game}.js`);
  const L = layer(stage);
  game = { id: t.id, game: t.game, layer: L };
  if (sceneName === 'machine') dirty = true;
  document.body.dataset.game = t.game;
  setVibe(t.game);
  hud.setGame(t.game, NUDGE[t.game]);
  hud.idle(false);
  played = true;
  hud.interact(() => null, () => {});
  $('#game-name').textContent = `${SCENES[sceneName].name} · ${GAME_NAMES[t.game]}`;
  scene.opp.setState?.('idle');
  mod.mount(L, { scene, createHud: () => hud, table: t.id, k });
}

// Bring the page to the latest state: the scene, then what is on its table.
async function sync() {
  const t = state.table;
  const want = t && sceneOf(t.game) === state.scene && (t.phase !== 'over' || left !== t.id) ? t : null;
  if (state.scene !== sceneName) {
    // a new scene: dim, rebuild, come back up
    if (sceneName) await curtain(true);
    unmount();
    buildScene(state.scene);
    if (want) await mount(want);
    else {
      idle();
      greet(scene.opp); // avatar: you came into the room (a game's own seat waves when it opens)
    }
    curtain(false);
  } else if ((want?.id ?? null) !== (game?.id ?? null)) {
    if (dirty) {
      // the machine room keeps one game's lights and shells: a quick flicker and a fresh room
      await curtain(true, 260);
      unmount();
      buildScene(sceneName);
      if (want) await mount(want);
      else idle();
      curtain(false, 260);
    } else {
      // the same scene: only the table changes
      unmount();
      if (want) await mount(want);
      else idle();
    }
  }
  renderMenu();
}

// One sync at a time, always to the latest state.
let syncing = false;
let again = false;
async function apply() {
  if (syncing) return (again = true);
  syncing = true;
  do {
    again = false;
    try {
      await sync();
    } catch (err) {
      console.error(err);
    }
  } while (again);
  syncing = false;
}

// ---- one chat for the room ----------------------------------------------------------
// While a game is live every line goes to its table, and the game's own seat plays them
// (with its sounds and the agent's reactions); everything else shows here. Not every game
// stamps a round on its lines, so liveness is what tells them apart.
let seen = null;
function chat(lines) {
  const key = (c) => `${c.at}|${c.seat}|${c.text}`;
  const me = state.seats.find((s) => s.kind === 'human').id;
  if (!seen) {
    seen = new Set(lines.map(key));
    for (const c of lines.slice(-4)) c.rename ? hud.log(hud.renameLine(c.rename)) : hud.log(c.text, c.seat === me ? 'you' : 'opp');
    return;
  }
  for (const c of lines) {
    const id = key(c);
    if (seen.has(id)) continue;
    seen.add(id);
    // a rename in a live game is the game's line (its seat logs it); otherwise it's the room's
    if (c.rename) {
      if (!(game && (live() || 'round' in c))) hud.log(hud.renameLine(c.rename));
      continue;
    }
    if (c.seat === me) {
      // logged when sent; between games your emoji lands on the agent here (in a game, its seat does that)
      const text = c.text.trim();
      if (!live() && EMOJI_ONLY.test(text)) setTimeout(() => scene?.opp.setState?.('catch', { emoji: text }), 650); // avatar
      continue;
    }
    if (game && (live() || 'round' in c)) continue;
    const text = c.text.trim();
    if (EMOJI_ONLY.test(text)) {
      sfx('emote');
      if (scene?.opp.setState) scene.opp.setState('emote', { emoji: text, mood: c.mood }); // avatar: mood, the face it sends it with
      else scene?.opp.emote(text);
    } else {
      sfx('chat');
      scene?.opp.setState?.('talking', { text, mood: c.mood }); // avatar
      hud.say(text, c.mood);
    }
  }
}

function connect(delay = 500) {
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?room=${roomId}&k=${k}&lang=${lang}`);
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type !== 'room') return;
    state = msg;
    hud.setOppName(msg.seats.find((s) => s.kind === 'agent')?.name);
    if (scene && !game && !syncing) idleStatus(); // a rename between games shows at once
    chat(msg.chat);
    apply();
  };
  ws.onopen = () => (delay = 500);
  ws.onclose = async (e) => {
    if (e.code === 4003) return hud.status(t('ui.room.gone'));
    // The server stops when nobody uses it, and only the agent's next command starts it.
    const up = await serverUp();
    if (!up || !game) hud.status(t(up ? 'ui.table.reconnecting' : 'ui.table.asleep'));
    setTimeout(() => connect(Math.min(delay * 2, 8000)), delay);
  };
}
connect();
