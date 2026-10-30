// The HUD every game shares: status pill, chat log and bubble, toast, emotes, the game
// list, the tab-title nudge, and pointing at things on the table. A game hands in what
// its things are called (tips) and what clicking them does (act).
import { pixelEmoji } from './stage.js';
import { openSettings, settingsBody, speak } from './audio.js';
import { RULES } from './rules.js';
import { t, lang, LANGS, setLang } from './i18n.js';
import { motion, setSway } from './motion.js';

const $ = (s) => document.querySelector(s);

export const GAMES = [
  { id: 'blackjack', icon: '🃏', ready: true },
  { id: 'roulette', icon: '🔫', ready: true },
  { id: 'oldmaid', icon: '👻' },
  { id: 'yacht', icon: '🎲', ready: true },
  { id: 'fortune', icon: '🔮' },
].map((g) => ({ ...g, name: t(`ui.games.${g.id}.name`), desc: t(`ui.games.${g.id}.desc`) }));

// The page's fixed words (play.html and room.html share the markup), in the player's language.
function words() {
  document.title = t('ui.brand');
  $('.brand').firstChild.textContent = t('ui.brand');
  $('#say').placeholder = t('ui.chat.placeholder');
  $('#open-games').textContent = `▦ ${t('ui.hud.games')}`;
  $('#open-games').title = t(document.body.classList.contains('room') ? 'ui.hud.gamesRoomTitle' : 'ui.hud.gamesTitle');
  $('#open-settings').title = t('ui.settings.title');
  $('#games .window-title').firstChild.textContent = t(document.body.classList.contains('room') ? 'ui.room.menuTitle' : 'ui.hud.switchGame');
  $('#pill-text').textContent = t(document.body.classList.contains('room') ? 'ui.room.entering' : 'ui.hud.joining');
}

// send(text): post a chat line to the table. Without it (a mock), the opponent answers
// with canned lines and emotes. menu(list): fill the game list yourself (a room lists its
// scenes and their games) instead of the plain list that reloads with ?game=.
// The band between the top bar and the chat bar, as --win-top and --win-bottom: the
// windows in the middle (?, the games, ⚙) stay inside it at any size and scroll within.
let banded = false;
function band() {
  if (banded) return;
  banded = true;
  const root = document.documentElement.style;
  // only what is shown counts: live mode hides the top bar and the chat bar, and has its
  // own corner of buttons instead
  const shown = (e) => e && e.getClientRects().length > 0;
  const measure = () => {
    const gap = 8;
    const top = Math.max(0, ...[...document.querySelectorAll('.top > *, .live-corner')].filter(shown).map((e) => e.getBoundingClientRect().bottom));
    const bar = shown($('.bar')) ? $('.bar').getBoundingClientRect().top : innerHeight;
    root.setProperty('--win-top', `${Math.round(top + gap)}px`);
    root.setProperty('--win-bottom', `${Math.round(Math.max(0, innerHeight - bar) + gap)}px`);
  };
  measure();
  const ro = new ResizeObserver(measure);
  for (const e of [$('.top'), $('.bar')]) if (e) ro.observe(e);
  window.addEventListener('resize', measure);
}

export function createHud(stage, opp, { game, oppName = 'Clawd', nudge = t('ui.hud.nudge'), replies = [], send = null, menu = null }) {
  words();
  band();
  const pill = $('#pill');
  let yourTurn = false;
  function status(text, whose = null) {
    $('#pill-text').textContent = text;
    pill.classList.toggle('yours', whose === 'you');
    pill.classList.toggle('theirs', whose === 'opp');
    yourTurn = whose === 'you';
  }

  function log(text, who = null) {
    const li = document.createElement('li');
    if (who) {
      li.className = who === 'you' ? 'mine' : '';
      li.innerHTML = '<span class="who"></span><span class="text"></span>';
      li.querySelector('.who').textContent = who === 'you' ? t('ui.common.you') : oppName;
      li.querySelector('.text').textContent = text;
    } else {
      li.className = 'sys';
      li.textContent = text;
    }
    const list = $('#log');
    list.append(li);
    while (list.children.length > 5) list.firstElementChild.remove();
    [...list.children].slice(0, -2).forEach((x) => x.classList.add('old'));
  }

  let bubbleTimer;
  function say(text, mood) {
    speak(text, { voice: opp.voice, mood, onBlip: opp.blip }); // sound: the agent's voice, in the line's mood
    const b = $('#opp-bubble');
    b.textContent = text;
    b.hidden = false;
    log(text, 'opp');
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => (b.hidden = true), 4200);
  }
  // keep the bubble pinned beside the opponent's head as the camera breathes
  (function pin() {
    const p = opp.mouthScreen();
    const b = $('#opp-bubble');
    b.style.left = `${p.x}px`;
    b.style.top = `${p.y}px`;
    requestAnimationFrame(pin);
  })();

  let toastTimer;
  function toast(text, ms = 1400) {
    const box = $('#toast');
    box.textContent = text;
    box.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (box.hidden = true), ms);
  }

  // Between games in a room: what 摸鱼 means, small under the name and in the tab title.
  const tagline = document.createElement('div');
  tagline.className = 'tagline';
  tagline.textContent = t('tagline');
  tagline.hidden = true;
  $('.brand').append(tagline);

  // The tab title calls you back when it's your move and you're off working.
  let titleTick = 0;
  setInterval(() => {
    const rest = tagline.hidden ? t('ui.brand') : `moyu · ${t('tagline')}`;
    document.title = document.hidden && yourTurn && titleTick++ % 2 === 0 ? `${GAMES.find((g) => g.id === game)?.icon ?? '🐟'} ${nudge} · ${t('ui.brand')}` : rest;
  }, 900);

  // emotes: each floats up from its button and fades (the agent's rise from its head).
  // One row: five faces, then a live hit, an AI joke and the fish 摸鱼 is named for.
  const EMOTES = ['😂', '😱', '😏', '🤔', '😭', '💀', '🤖', '🐟'];
  for (const e of EMOTES) {
    const b = document.createElement('button');
    b.className = 'emote';
    b.title = e;
    b.append(pixelEmoji(e));
    b.onclick = () => sendEmote(e, b);
    $('#emotes').append(b);
  }
  function sendEmote(emoji, from) {
    const r = from.getBoundingClientRect();
    const img = pixelEmoji(emoji);
    img.className = 'rising';
    img.style.left = `${r.left + r.width / 2}px`;
    img.style.top = `${r.top}px`;
    document.body.append(img);
    setTimeout(() => img.remove(), 1500);
    log(emoji, 'you');
    if (send) return send(emoji);
    // the mock opponent answers in kind
    setTimeout(() => opp.emote({ '😂': '😤', '😱': '😏', '😏': '😒', '🐟': '🐟', '🤔': '🤔', '😭': '😏', '💀': '💀', '🤖': '🤖' }[emoji]), 1300);
  }

  // chat
  const input = $('#say');
  // another field (the name in settings) keeps its keys
  const elsewhere = () => document.activeElement !== input && document.activeElement?.matches('input:not([type=range]), textarea');
  window.addEventListener('keydown', (e) => {
    if (elsewhere()) return;
    if (e.key === 'Enter' && document.activeElement !== input) {
      e.preventDefault();
      input.focus();
    } else if (e.key === 'Escape') {
      input.blur();
      $('#games').hidden = true;
    } else if ((e.key === 'g' || e.key === 'G') && document.activeElement !== input) {
      toggleGames();
    }
  });
  $('#say-form').onsubmit = (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return input.blur();
    log(text, 'you');
    input.value = '';
    input.blur();
    if (send) return send(text);
    const pool = [t('ui.chat.mock1'), t('ui.chat.mock2'), ...replies];
    setTimeout(() => say(pool[Math.floor(Math.random() * pool.length)]), 900);
  };

  // the game list
  if (menu) menu($('#gamelist'));
  else $('#game-name').textContent = GAMES.find((g) => g.id === game).name;
  for (const g of menu ? [] : GAMES) {
    const li = document.createElement('li');
    li.className = g.ready ? (g.id === game ? 'current' : '') : 'soon';
    const icon = pixelEmoji(g.icon);
    icon.className = 'icon';
    li.append(icon);
    li.insertAdjacentHTML('beforeend', `<div><div>${g.name}</div><div class="desc">${g.desc}</div></div><div class="tag">${g.id === game ? t('ui.hud.playing') : g.ready ? '' : t('ui.hud.soon')}</div>`);
    if (g.ready) li.append(rulesButton(g.id) ?? '');
    li.onclick = () => {
      if (!g.ready) return;
      if (g.id === game) return toggleGames(false);
      location.search = `?game=${g.id}`;
    };
    $('#gamelist').append(li);
  }
  function toggleGames(show = $('#games').hidden) {
    if (show) only('games');
    $('#games').hidden = !show;
  }
  $('#open-games').onclick = () => toggleGames();
  $('[data-close]').onclick = () => toggleGames(false);
  $('#open-settings').onclick = () => {
    if ($('#settings')?.hidden !== false) only('settings');
    openSettings();
    settingsColumns();
  };
  // a wide, short window: the settings in two columns rather than scrolling, whole groups
  // to a column, in their order, the columns as even as they come; they still scroll if
  // even that doesn't fit
  function settingsColumns() {
    const s = $('#settings');
    if (!s || s.hidden) return;
    const body = s.querySelector('.settings-body');
    const cols = [...body.querySelectorAll(':scope > .col')];
    if (cols.length) body.replaceChildren(...cols.flatMap((c) => [...c.children]));
    s.classList.remove('two-col');
    if (body.scrollHeight <= body.clientHeight + 2 || innerWidth < innerHeight * 1.4) return;
    const groups = [...body.children].filter((g) => g.offsetHeight);
    const hs = groups.map((g) => g.getBoundingClientRect().height);
    // every way to deal the groups to two columns, keeping each column in order
    // (a set bit sends a group right; the first always opens the left column)
    let best = null;
    for (let mask = 2; mask < 2 ** groups.length; mask += 2) {
      let left = 0;
      let right = 0;
      hs.forEach((h, i) => (mask & (1 << i) ? (right += h) : (left += h)));
      if (!best || Math.max(left, right) < best.tall) best = { mask, tall: Math.max(left, right) };
    }
    const col = (list) => {
      const c = document.createElement('div');
      c.className = 'col';
      c.append(...list);
      return c;
    };
    body.replaceChildren(col(groups.filter((_, i) => !(best.mask & (1 << i)))), col(groups.filter((_, i) => best.mask & (1 << i))));
    s.classList.add('two-col');
  }
  window.addEventListener('resize', settingsColumns);
  // One window in the middle at a time (?, the games, ⚙): opening one closes the others.
  function only(which) {
    if (which !== 'games') $('#games').hidden = true;
    if (which !== 'rules') $('.hud > .veil.rules-veil')?.setAttribute('hidden', '');
    if (which !== 'settings') openSettings(false);
  }

  // ---- the settings window: the agent's name and the page's language (对局), and how
  // the view moves (画面) ----
  const prefsBody = settingsBody();
  const group = (id) => prefsBody.querySelector(`[data-group="${id}"]`);
  // the language: ‹ its own name ›, the arrows stepping round the list; a step reloads the
  // page in that language
  if (!prefsBody.querySelector('.lang-row')) {
    const ids = Object.keys(LANGS);
    const row = document.createElement('div');
    row.className = 'row lang-row';
    row.innerHTML = `<span class="k">${t('ui.settings.language')}</span><span class="v"><span class="switch"><button class="pixbtn step" data-step="-1">‹</button><span class="pick"></span><button class="pixbtn step" data-step="1">›</button></span></span>`;
    const pick = row.querySelector('.pick');
    pick.lang = lang;
    pick.textContent = LANGS[lang];
    const step = (d) => setLang(ids[(ids.indexOf(lang) + d + ids.length) % ids.length]);
    for (const b of row.querySelectorAll('.step')) {
      b.title = b.dataset.step < 0 ? t('ui.settings.langPrev') : t('ui.settings.langNext');
      b.setAttribute('aria-label', b.title);
      b.onclick = () => step(+b.dataset.step);
    }
    row.querySelector('.switch').addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      step(e.key === 'ArrowLeft' ? -1 : 1);
    });
    group('game').append(row);
  }
  // comfort: the view swaying with the raft, on or off (motion.js)
  if (!prefsBody.querySelector('.sway-row')) {
    const row = document.createElement('div');
    row.className = 'row sway-row';
    row.innerHTML = `<span class="k">${t('ui.settings.sway')}</span><span class="v"><button class="pixbtn toggle"></button></span>`;
    const b = row.querySelector('button');
    const show = () => {
      b.textContent = motion.sway ? t('ui.settings.on') : t('ui.settings.off');
      b.classList.toggle('on', motion.sway);
    };
    b.onclick = () => (setSway(!motion.sway), show());
    show();
    group('view').append(row);
  }
  // A seat's page renames the agent through its own table or room (the human's token).
  const place = location.pathname.match(/^\/(t|r)\/([0-9a-f]+)/);
  if (place && !prefsBody.querySelector('.name-row')) {
    const row = document.createElement('form');
    row.className = 'row name-row';
    row.innerHTML = `<span class="k"></span><span class="v name"><input maxlength="24" autocomplete="off" spellcheck="false"><button class="pixbtn">${t('ui.settings.rename')}</button></span>`;
    const input = row.querySelector('input');
    const label = () => (row.querySelector('.k').textContent = t('ui.settings.agentName'));
    label();
    input.placeholder = oppName;
    row.onsubmit = async (e) => {
      e.preventDefault();
      const name = input.value.trim();
      if (!name || name === oppName) return;
      const k = new URLSearchParams(location.search).get('k');
      const r = await fetch(`/api/${place[1] === 't' ? 'tables' : 'rooms'}/${place[2]}/rename`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ k, who: 'agent', name }),
      })
        .then((x) => x.json())
        .catch((err) => ({ error: String(err) }));
      if (r.error) return toast(r.error, 2000);
      input.value = '';
      input.blur();
    };
    group('game').querySelector('.head').after(row);
  }
  // the agent's name as the seats have it now: chat labels, the rename field
  function setOppName(name) {
    if (!name || name === oppName) return;
    oppName = name;
    const input = prefsBody.querySelector('.name-row input');
    if (input) input.placeholder = name;
  }
  // ---- the game's standing under its name, in the same spot on every game: where the
  // game is (hand, round), then each seat and its count. Roulette builds its own, with pips.
  let standingEl;
  function standing(where, seats) {
    if (!standingEl) {
      standingEl = document.createElement('div');
      standingEl.className = 'match';
      $('.brand').append(standingEl);
    }
    standingEl.hidden = !where;
    if (!where) return;
    const span = (cls, text) => Object.assign(document.createElement('span'), { className: cls, textContent: text });
    standingEl.replaceChildren(
      span('match-round', where),
      ...seats.map(([who, n]) => {
        const r = span('match-seat', '');
        r.append(span('match-name', who), span('match-count', n));
        return r;
      }),
    );
  }
  // A rename lands in the chat as { rename: { who, from, to } }: a small line of its own.
  const renameLine = (r) => (r.who === 'agent' ? t('ui.chat.renamedAgent', { from: r.from, to: r.to }) : t('ui.chat.renamedYou', { to: r.to }));

  // ---- the rules: how each game is played. A ？ beside each game in the games window
  // opens it on that game, and closing it goes back to the games; ? opens it on the game
  // at hand. A veil over the page holds the window, so a click beside it closes it and
  // never reaches the table; Esc closes it before anything else hears the key.
  const veil = document.createElement('div');
  veil.className = 'veil rules-veil';
  veil.hidden = true;
  veil.innerHTML = `<section class="window rules" role="dialog" aria-label="${t('ui.rules.title')}">
    <div class="window-title">${t('ui.rules.title')}<button class="x" title="${t('ui.common.close')}">×</button></div>
    <nav class="rules-tabs"></nav>
    <div class="rules-body"></div>
  </section>`;
  $('.hud').append(veil);
  const tabs = veil.querySelector('.rules-tabs');
  const body = veil.querySelector('.rules-body');
  function showRules(id) {
    for (const t of tabs.children) t.classList.toggle('on', t.dataset.game === id);
    body.replaceChildren();
    for (const sec of RULES[id].sections) {
      const h = document.createElement('h3');
      h.textContent = sec.head;
      const ul = document.createElement('ul');
      for (const line of sec.lines) {
        const li = document.createElement('li');
        li.textContent = line;
        ul.append(li);
      }
      body.append(h, ul);
    }
    body.scrollTop = 0;
  }
  for (const [id, r] of Object.entries(RULES)) {
    const t = document.createElement('button');
    t.dataset.game = id;
    t.textContent = r.title;
    t.onclick = () => showRules(id);
    tabs.append(t);
  }
  let backToGames = false;
  function toggleRules(show = veil.hidden, id = null) {
    if (show) only('rules');
    veil.hidden = !show;
    // that game; else the game at hand; in a room before a game, the first one
    if (show) showRules(RULES[id] ? id : RULES[game] ? game : Object.keys(RULES)[0]);
    const back = backToGames;
    backToGames = show && !!id;
    if (!show && back) toggleGames(true);
  }
  // A game's ？ in the games window: its rules, without picking the game.
  function rulesButton(id) {
    if (!RULES[id]) return null;
    const b = document.createElement('button');
    b.className = 'pixbtn rules-q';
    b.textContent = '？';
    b.title = t('ui.rules.of', { game: RULES[id].title });
    b.setAttribute('aria-label', b.title);
    b.onclick = (e) => {
      e.stopPropagation();
      toggleRules(true, id);
    };
    return b;
  }
  veil.querySelector('.x').onclick = () => toggleRules(false);
  veil.addEventListener('click', (e) => e.target === veil && toggleRules(false));
  window.addEventListener(
    'keydown',
    (e) => {
      if (!veil.hidden && e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        toggleRules(false);
      } else if (e.key === '?' && !document.activeElement?.matches('input, textarea')) {
        e.preventDefault();
        toggleRules();
      }
    },
    true,
  );

  // ---- pointing at things on the table ----
  // tips(name) returns the hint for a thing, or null when it can't be used right now: a
  // line of text, or { title, text, color } for a name over what it does.
  let tips = () => null;
  let act = () => {};
  const canvas = $('#view');
  const tip = $('#tip');
  function showTip(label, x, y) {
    tip.hidden = !label;
    if (!label) return;
    if (typeof label === 'string') tip.textContent = label;
    else {
      const title = document.createElement('div');
      title.className = 'tip-title';
      title.textContent = label.title;
      if (label.color) title.style.color = label.color;
      const text = document.createElement('div');
      text.className = 'tip-text';
      text.textContent = label.text;
      tip.replaceChildren(title, text);
    }
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
    // it reads to the right of the pointer, or to the left where the window ends, and
    // stays above the chat bar
    tip.style.translate = '';
    const r = tip.getBoundingClientRect();
    const floor = ($('.bar')?.getBoundingClientRect().top ?? innerHeight) - 4;
    const dx = r.right > innerWidth - 4 ? -(r.width + 28) : 0;
    const dy = r.bottom > floor ? floor - r.bottom : r.top < 4 ? 4 - r.top : 0;
    if (dx || dy) tip.style.translate = `${dx}px ${dy}px`;
  }
  const pickAt = (e) => stage.pick({ x: (e.clientX / innerWidth) * 2 - 1, y: -(e.clientY / innerHeight) * 2 + 1 });
  canvas.addEventListener('pointermove', (e) => {
    const name = pickAt(e);
    const label = name && tips(name);
    stage.setHover(label ? name : null);
    canvas.classList.toggle('pointing', !!label);
    showTip(label, e.clientX, e.clientY);
  });
  // Pick again on click: a tap or a click without a prior move has no hover state.
  canvas.addEventListener('click', (e) => {
    const name = pickAt(e);
    if (!name || !tips(name)) return;
    tip.hidden = true;
    stage.setHover(null);
    if (name === 'games') return toggleGames(true);
    act(name);
  });

  return {
    status,
    log,
    say,
    toast,
    toggleGames,
    toggleRules,
    rulesButton,
    setOppName,
    renameLine,
    standing,
    idle: (on) => (tagline.hidden = !on),
    tip: showTip,
    interact(t, a) {
      tips = t;
      act = a;
    },
    // a room changes games under the same HUD: what the tab title nudges with
    setGame(g, n = t('ui.hud.nudge')) {
      game = g;
      nudge = n;
    },
  };
}
