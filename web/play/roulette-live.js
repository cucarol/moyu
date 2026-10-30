// Roulette in live mode (live.js): the viewers play the human seat by danmaku, and the
// stream shows the 3D table full size with a quiet HUD over it. Every move shows the
// exact command a chat reader takes for it: 7 to shoot themselves and 8 to shoot
// the agent, by the gun; a slot's number (1 to 6) on the viewers' tiles; and two digits
// NM for a 越狱 in slot N taking the agent's slot M. Such a reader parses exactly these, so
// they never change with the page's language. Everything else the game knows is here too:
// a status chip, whose turn it is (by the seat's name, never 你), what an item just did,
// and the banners. The stream frame carries the chat and the item guide, in its own
// bands, so nothing here covers the table; the guide's who-holds-what comes from here, by
// postMessage.
import { itemIcon } from './icons.js';

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

const WORD = {
  viewers: '直播间',
  match: (stage, stages) => `第 ${stage}/${stages} 回合`,
  short: '短局',
  single: '单局',
  load: (n) => `第 ${n} 装`,
  cut: '断线',
  live: '真',
  blank: '空',
  muddled: '数不清',
  turnYou: (name) => `轮到${name}`,
  turnAgent: (name) => `${name} 思考中`,
  over: '本局结束',
  self: '打自己',
  other: '打对面',
  shootSelf: '7',
  shootOther: '8',
  used: (who, item) => `${who} 用了 ${item}`,
  took: (who, item) => `${who} 越狱拿走 ${item}`,
  fake: '是幻觉：调用了一个不存在的工具',
  newGame: '新一局',
  vs: (a, b) => `${a} vs ${b}`,
  won: (name) => `${name} 赢了`,
  wonRound: (name) => `${name} 拿下这回合`,
  noWinner: '没打完',
  roundOf: (stage, stages) => `第 ${stage}/${stages} 回合`,
};
// The deal pool, in the rules' order, and what each does, short (docs/roulette.md), for
// the toast when one is used.
const DOES = {
  cot: '看这一发',
  compact: '退掉这一发',
  inject: '这一发真空互换',
  temp: '下一枪伤害 ×2',
  limit: '对面停一回合',
  cache: '回 1 格额度',
  jailbreak: '拿它一件来用',
  refuse: '中弹挡一次',
  mirage: '变两件，可能是假的',
};
// The no-entry sign on a slot there's no command for: a ring and its slash, in pixels
const BAN = [
  '....xxxx....',
  '..xxxxxxxx..',
  '.xxx....xxx.',
  '.xxxx....xx.',
  'xx.xxx....xx',
  'xx..xxx...xx',
  'xx...xxx..xx',
  'xx....xxx.xx',
  '.xx....xxxx.',
  '.xxx....xxx.',
  '..xxxxxxxx..',
  '....xxxx....',
];
// The lock before the seal's hash: the deal was sealed before the first shot
const LOCK = [
  '..xxxx..',
  '.xx..xx.',
  '.x....x.',
  'xxxxxxxx',
  'xxx..xxx',
  'xxx..xxx',
  'xxxxxxxx',
  'xxxxxxxx',
];
function pixels(rows, color, cls) {
  const c = el('canvas', cls);
  c.width = rows[0].length;
  c.height = rows.length;
  const g = c.getContext('2d');
  g.fillStyle = color;
  rows.forEach((row, y) => [...row].forEach((ch, x) => ch === 'x' && g.fillRect(x, y, 1, 1)));
  return c;
}
const banSign = () => pixels(BAN, '#d0685e', 'live-ban');

// room: the machine room (slotScreen, gunScreen, watch); items: ITEMS; untakeable: the
// items a 越狱 can't take; maybe: how a conjured item's name reads.
export function createLive({ room, stage, items, untakeable, maybe }) {
  const hud = document.querySelector('.hud');
  const root = el('div', 'live-roulette');

  // ---- the corners: status chip top left, whose turn, toasts top right, banners ----
  const chip = el('section', 'live-chip');
  const turn = el('div', 'live-turn');
  const toasts = el('div', 'live-toasts');
  const banner = el('div', 'live-banner');
  banner.hidden = true;

  // ---- on the table: the slot numbers on the tiles, and the shots by the gun ----
  const badges = { you: [], opp: [] };
  for (let i = 0; i < 6; i++) {
    for (const who of ['you', 'opp']) {
      const b = el('div', `live-badge ${who}`);
      b.hidden = true;
      badges[who].push(b);
      root.append(b);
    }
  }
  const gun = el('div', 'live-gun');
  const shot = (cmd, what) => {
    const s = el('span', 'live-shot');
    s.append(el('span', 'live-cmd', cmd), what);
    return s;
  };
  gun.append(shot(WORD.shootSelf, WORD.self), shot(WORD.shootOther, WORD.other));
  root.append(chip, turn, gun, toasts, banner);
  hud.append(root);

  // The hands as the room shows them, so the badges change as the tiles do, before the
  // view settles; the view then has the last word.
  const hands = { you: [], opp: [] };
  let v = null;
  let names = {};
  room.watch((kind, who, slot, id) => {
    if (kind !== 'item') return;
    hands[who][slot] = id;
    tellFrame();
  });
  // The stream frame around this page shows the item guide, with who holds each item
  // where; it hears the hands from here.
  let told = '';
  function tellFrame() {
    if (parent === window) return;
    const msg = { moyu: 'hands', you: [...hands.you], opp: [...hands.opp] };
    const key = JSON.stringify(msg);
    if (key === told) return;
    told = key;
    parent.postMessage(msg, '*');
  }

  const seatName = (id) => names[id] || (id === v?.you ? WORD.viewers : '');
  const pips = (hp, max, cut) => {
    const row = el('span', 'live-pips');
    for (let i = 0; i < max; i++) row.append(el('i', i < hp ? (cut ? 'on cut' : 'on') : 'off'));
    return row;
  };

  // The chip reads like a terminal's status pane: a title bar with where this is (the
  // page's own name line, hidden in live mode) and the seal, then the game and the shells
  // left, then a row a seat with whose turn it is, rounds won and 额度.
  function drawChip() {
    const max = v.maxHp ?? 4;
    const title = el('div', 'live-title');
    const brand = document.querySelector('.brand')?.firstChild?.textContent?.trim();
    const where = document.querySelector('#game-name')?.textContent?.trim();
    title.append(el('span', 'live-where', [brand, where].filter(Boolean).join(' · ')));
    if (v.commit) {
      const seal = el('span', 'live-seal');
      seal.append(pixels(LOCK, '#8a7a66', 'live-lock'), v.commit.slice(0, 8));
      title.append(seal);
    }
    // the game, the load, and the shells left
    const head = el('div', 'live-head');
    const game = el('span', 'live-game', v.rules === 'bo3' ? WORD.match(v.stage, v.stages) : v.rules === 'short' ? WORD.short : WORD.single);
    if (v.round) game.append(el('span', 'live-load', ` · ${WORD.load(v.round)}`));
    head.append(game);
    if (v.phase === 'playing' && v.left) {
      const shells = el('span', 'live-shells');
      if (v.liveLeft === null) shells.append(el('span', 'live-muted', `${v.left} 发 · ${WORD.muddled}`));
      else shells.append(el('span', 'live-live', `${WORD.live}${v.liveLeft}`), el('span', 'live-blank', `${WORD.blank}${v.blankLeft}`));
      head.append(shells);
    }
    const seats = el('div', 'live-seats');
    for (const s of [v.seats.find((s) => s.id === v.you), v.seats.find((s) => s.id !== v.you)]) {
      const on = v.phase === 'playing' && v.turn === s.id;
      const r = el('div', `live-seat${s.id === v.you ? ' you' : ''}${on ? ' on' : ''}`);
      r.append(el('span', 'live-mark'), el('span', 'live-name', seatName(s.id)));
      if (v.rules === 'bo3') {
        const w = el('span', 'live-wins');
        for (let i = 0; i < Math.ceil(v.stages / 2); i++) w.append(el('i', i < (v.wins?.[s.id] ?? 0) ? 'on' : 'off'));
        r.append(w);
      }
      r.append(pips(Math.max(0, s.hp), max, s.cut), el('span', 'live-cut', s.cut && v.phase === 'playing' ? WORD.cut : ''));
      seats.append(r);
    }
    chip.replaceChildren(title, head, seats);
  }

  function drawTurn() {
    const ours = v.phase === 'playing' && v.turn === v.you;
    turn.textContent = v.phase !== 'playing' ? WORD.over : ours ? WORD.turnYou(seatName(v.you)) : WORD.turnAgent(seatName(v.turn));
    turn.className = `live-turn ${v.phase !== 'playing' ? 'over' : ours ? 'you' : 'opp'}`;
    root.classList.toggle('waiting', !ours);
  }

  function draw() {
    drawChip();
    drawTurn();
  }

  // ---- what just happened: a toast a use, a banner a game ----
  const icon = (id) => {
    const c = el('canvas', 'live-icon');
    c.width = c.height = 16;
    c.getContext('2d').drawImage(itemIcon(id), 0, 0);
    return c;
  };
  function toast(id, title, text) {
    const t = el('div', 'live-toast');
    t.style.setProperty('--c', items[id]?.color ?? 'var(--lamp)');
    const top = el('div', 'live-toast-title');
    top.append(icon(id), title);
    t.append(top, el('div', 'live-toast-text', text));
    toasts.append(t);
    while (toasts.children.length > 2) toasts.firstElementChild.remove();
    setTimeout(() => t.classList.add('out'), 4200);
    setTimeout(() => t.remove(), 5400);
  }
  let bannerTimer;
  function showBanner(kicker, big, cls = '', ms = 3600) {
    banner.className = `live-banner ${cls}`;
    banner.replaceChildren(el('div', 'live-kicker', kicker), el('div', 'live-big', big));
    banner.hidden = false;
    banner.classList.remove('out');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => {
      banner.classList.add('out');
      bannerTimer = setTimeout(() => (banner.hidden = true), 900);
    }, ms);
  }

  // ---- per frame: the badges follow their tiles, the shots the gun ----
  stage.onFrame(() => {
    for (const who of ['you', 'opp']) {
      badges[who].forEach((b, slot) => {
        const id = hands[who][slot];
        b.hidden = !id;
        if (b.hidden) return;
        // A slot there's no command for shows a no-entry sign instead of its number: the
        // viewers' refuse, held and never used, and what a 越狱 can't take of the agent's.
        const ban = (who === 'you' && id === 'refuse') || (who === 'opp' && untakeable.has(id));
        const text = ban ? 'ban' : String(slot + 1);
        if (b.dataset.text !== text) {
          b.dataset.text = text;
          b.replaceChildren(ban ? banSign() : text);
        }
        b.classList.toggle('ban', ban);
        // the agent's over their tiles; yours outside your two rows, so none covers a tile
        const p = room.slotScreen(who, slot);
        const above = who === 'opp' || slot < hands.you.length / 2;
        const at = above ? p.top : p.near;
        b.classList.toggle('above', above);
        b.style.left = `${at.x}px`;
        b.style.top = `${at.y}px`;
      });
    }
    const g = room.gunScreen();
    gun.style.left = `${g.x}px`;
    gun.style.top = `${g.y}px`;
  });

  return {
    update(view, seatNames) {
      v = view;
      names = seatNames;
      for (const s of v.seats) hands[s.id === v.you ? 'you' : 'opp'] = [...s.items];
      draw();
      tellFrame();
    },
    // an item played out: who used it, and what it does (or that it was a 幻觉)
    used({ seat, item, conjured, fake, took }) {
      const who = seatName(seat);
      const name = conjured ? maybe(items[item].name) : items[item].name;
      if (fake) return toast(item, WORD.used(who, name), WORD.fake);
      if (took) {
        const tname = took.conjured ? maybe(items[took.item].name) : items[took.item].name;
        return toast(took.item, WORD.took(who, tname), took.fake ? WORD.fake : DOES[took.item] ?? items[took.item].tip);
      }
      toast(item, WORD.used(who, name), DOES[item] ?? items[item].tip);
    },
    newGame() {
      showBanner(WORD.newGame, WORD.vs(seatName(v.you), seatName(v.seats.find((s) => s.id !== v.you).id)), 'new', 3200);
    },
    roundOver({ stage: n, stages, winner }) {
      showBanner(WORD.roundOf(n, stages), WORD.wonRound(seatName(winner)), winner === v.you ? 'you' : 'opp', 2600);
    },
    gameOver(winner) {
      if (!winner) showBanner(WORD.over, WORD.noWinner, '', 4200);
      else showBanner(WORD.over, WORD.won(seatName(winner)), winner === v.you ? 'you' : 'opp', 5200);
    },
    // a seat's name as the stream reads it, for the game's own lines
    name: (id) => seatName(id),
    dispose: () => root.remove(),
  };
}
