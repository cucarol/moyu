// The Claude desktop app's Code tab, dark mode, drawn as pixel art at one texel per frame pixel:
// title bar, the sessions list, the chat (items the scene hands it, each coming in at its time:
// your messages, Claude's, edits, a job's card crawling or done), the input box with what you're
// typing and the little 2D Clawd sitting on it fishing, and the Windows taskbar with its clock.
// The same picture is on every screen in the film: the desk's laptop (cubicle.js), the machine
// room's CRT and the raft's laptop (screen.js). W is fixed, H follows the glass (240 for 16:10,
// 288 for the CRT's 4:3), and everything near the input box hangs from the bottom right, so two
// screens of different heights show the same picture there. draw(t) redraws it.
import { canvasTex, pixelText } from '/web/play/stage.js';

export const W = 384;
// Where a cut between two screens lands: square on to the texel (x, H - up) with rows texels
// down the frame's height: the screen's whole width across the frame (5 frame pixels a texel at
// 1080p), its bottom 216 rows. A screen taller than CUT_H shows the picture CUT_H tall hung from
// its bottom (screen.js), so the frame is the same on every screen.
export const CUT = { x: W / 2, up: 108, rows: 216 };
export const CUT_H = 240;

// the game's window: where it sits on the screen, its title bar, the picture 16:9 under it
const WIN = { x: 10, y: 22, w: 192, bar: 11 };
WIN.h = WIN.bar + Math.round((WIN.w * 9) / 16);

const C = {
  bar: '#141413', side: '#1c1b1a', main: '#262624', line: '#34332f', card: '#2e2d2a',
  text: '#ece9e0', dim: '#9c988d', faint: '#6b6860', orange: '#d97757', green: '#7fb069', red: '#d4675f',
  user: '#3a3935', task: '#0f1013',
};

// The little Clawd, from the CLI's ▐▛███▜▌ logo: its quadrant blocks as square pixels, each
// row twice as tall as a quadrant is wide. 0 empty, 1 body, 2 eye.
const CLAWD = [
  '...111111111111...',
  '...111111111111...',
  '...112111111211...',
  '...112111111211...',
  '.1111111111111111.',
  '.1111111111111111.',
  '...111111111111...',
  '...111111111111...',
  '....1.1....1.1....',
  '....1.1....1.1....',
];

export function createUI({ L, H = 240 }) {
  const tex = canvasTex(W, H, () => {});
  const ctx = tex.image.getContext('2d');
  const cache = new Map();
  // pixel text, cached per string and colour; returns its width
  function txt(s, x, y, color = C.text) {
    const k = s + color;
    if (!cache.has(k)) cache.set(k, pixelText(s, { size: 12, color }));
    const c = cache.get(k);
    ctx.drawImage(c, Math.round(x), Math.round(y));
    return c.width;
  }
  const width = (s) => (cache.get(s + C.text) ?? (cache.set(s + C.text, pixelText(s, { size: 12, color: C.text })), cache.get(s + C.text))).width;
  const rect = (x, y, w, h, c) => ((ctx.fillStyle = c), ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)));
  // a box with its corners knocked off, the pixel way of rounding
  function box(x, y, w, h, fill, edge) {
    if (edge) rect(x + 1, y, w - 2, h, edge), rect(x, y + 1, w, h - 2, edge);
    rect(x + 2, y + 1, w - 4, h - 2, fill), rect(x + 1, y + 2, w - 2, h - 4, fill);
  }
  // the ✻ spinner, a little pixel asterisk that turns
  function spark(x, y, t, c = C.orange) {
    const f = Math.floor(t * 8) % 4;
    const P = [
      [[3, 0], [3, 1], [3, 2], [3, 4], [3, 5], [3, 6], [0, 3], [1, 3], [2, 3], [4, 3], [5, 3], [6, 3]],
      [[1, 1], [2, 2], [4, 4], [5, 5], [5, 1], [4, 2], [2, 4], [1, 5], [3, 0], [3, 6], [0, 3], [6, 3]],
      [[3, 1], [3, 2], [3, 4], [3, 5], [1, 3], [2, 3], [4, 3], [5, 3], [1, 1], [5, 5], [5, 1], [1, 5]],
      [[1, 1], [2, 2], [4, 4], [5, 5], [5, 1], [4, 2], [2, 4], [1, 5], [3, 1], [3, 5], [1, 3], [5, 3]],
    ][f];
    ctx.fillStyle = c;
    for (const [i, j] of P) ctx.fillRect(x + i, y + j, 1, 1);
  }
  // a pixel tick
  function check(x, y, c = C.green) {
    for (const [i, j] of [[0, 3], [1, 4], [2, 5], [3, 4], [4, 3], [5, 2], [6, 1]]) rect(x + i, y + j, 1, 2, c);
  }
  function clawd(x, y, { blink = false, legs = 0, color = C.orange, s = 1 } = {}) {
    CLAWD.forEach((row, j) => {
      [...row].forEach((v, i) => {
        if (v === '.') return;
        let c = v === '2' ? (blink && j === 3 ? color : '#000') : color;
        if (v === '2' && blink && j === 2) c = color;
        // legs patter: one pair up a pixel
        const lift = j >= 8 && ((legs === 1 && i < 9) || (legs === 2 && i >= 9)) ? -1 : 0;
        if (j === 9 && lift) return;
        rect(x + i * s, y + (j + lift) * s, s, s, c);
      });
    });
  }

  const sessions = [
    [L('重构登录模块', 'Refactor login'), 'run'],
    [L('部署到预发', 'Deploy staging'), 'done'],
    [L('修支付回调', 'Payment hook'), 'done'],
    [L('暗色主题', 'Dark theme'), 'wait'],
  ];
  const older = [L('升级依赖', 'Bump deps'), L('补 README', 'README')];

  // what the scene drives: the chat's items ({ kind, at, ... }), the jobs their cards show
  // ({ cmd, label, total, passed, elapsed, done, doneText }), the input box, the clock, where
  // Clawd is, a ripple on the input box ({ k } 0..1, where Clawd went through)
  // a window over the app, top left ({ img, k }: the picture in it, how open 0..1)
  const state = { items: [], jobs: {}, input: '', caret: false, sent: false, clock: '13:42', clawd: { rod: 'up' }, ripple: null, win: null };
  // where Clawd sits, in texels; the bottom right hangs everything near it, so it's known now
  const SX = 98, TOP = 14, BOT = H - 14;
  const IY = BOT - 30;
  const home = { x: W - 92, y: IY - 10 };

  function draw(t) {
    rect(0, 0, W, H, C.main);

    // ---- title bar ----
    rect(0, 0, W, 14, C.bar);
    rect(5, 4, 6, 6, C.orange);
    txt('Claude', 15, 1, C.dim);
    const tabs = [L('聊天', 'Chat'), 'Code'];
    let tx = 168;
    tabs.forEach((s, i) => {
      const w = txt(s, tx, 1, i === 1 ? C.text : C.faint);
      if (i === 1) rect(tx, 12, w, 1, C.orange);
      tx += w + 12;
    });
    // — ▢ ✕
    rect(340, 7, 6, 1, C.dim);
    rect(355, 4, 6, 6, C.dim), rect(356, 5, 4, 4, C.bar);
    for (let i = 0; i < 6; i++) rect(370 + i, 4 + i, 1, 1, C.dim), rect(375 - i, 4 + i, 1, 1, C.dim);

    // ---- sidebar ----
    rect(0, TOP, SX, BOT - TOP, C.side);
    rect(SX, TOP, 1, BOT - TOP, C.line);
    box(5, TOP + 5, SX - 10, 16, C.main, C.line);
    txt('+ ' + L('新会话', 'New session'), 10, TOP + 7, C.text);
    txt(L('今天', 'Today'), 7, TOP + 27, C.faint);
    sessions.forEach(([s, st], i) => {
      const y = TOP + 42 + i * 16;
      if (i === 0) box(3, y - 2, SX - 6, 16, C.user);
      if (st === 'run') spark(8, y + 3, t);
      else if (st === 'done') rect(10, y + 5, 3, 3, C.green);
      else rect(10, y + 5, 3, 3, C.faint);
      txt(s, 18, y, i === 0 ? C.text : C.dim);
    });
    txt(L('昨天', 'Yesterday'), 7, TOP + 110, C.faint);
    older.forEach((s, i) => txt(s, 18, TOP + 125 + i * 16, C.faint));
    // whose machine
    rect(7, BOT - 17, 12, 12, '#5b6b8c');
    txt('C', 10, BOT - 17, C.text);
    txt('cuca', 24, BOT - 17, C.dim);

    // ---- main: header ----
    const MX = SX + 1, MW = W - MX;
    const X = MX + 10;
    txt(sessions[0][0], X, TOP + 4, C.text);
    txt('moyu · main', W - 8 - width('moyu · main'), TOP + 4, C.faint);
    rect(MX, TOP + 18, MW, 1, C.line);

    // ---- the chat: items come in at their times, each growing into place, the list scrolled so
    // the newest sits just over the input box ----
    const CT = TOP + 19, CB = IY - 13; // the chat's top and bottom
    const HT = { user: 24, say: 18, edit: 15, gap: 4, job: 56 };
    const shown = state.items.filter((it) => t >= it.at);
    const grow = (it) => Math.min(1, (t - it.at) / 0.18);
    const total = shown.reduce((h, it) => h + HT[it.kind] * grow(it), 0);
    let y = Math.round(Math.min(CT + 7, CB - total));
    ctx.save();
    ctx.beginPath();
    ctx.rect(MX, CT, MW, CB - CT);
    ctx.clip();
    for (const it of shown) {
      if (y > CT - HT[it.kind]) {
        if (it.kind === 'user') {
          const aw = width(it.text);
          box(W - 10 - aw - 12, y, aw + 12, 17, C.user);
          txt(it.text, W - 10 - aw - 6, y + 2);
        } else if (it.kind === 'say') {
          rect(X, y + 4, 4, 4, C.orange);
          txt(it.text, X + 9, y);
        } else if (it.kind === 'edit') {
          rect(X, y + 4, 4, 4, C.green);
          const w = txt('Edit', X + 9, y, C.text);
          txt(it.file, X + 9 + w + 6, y, C.dim);
          const d = `−${it.del}`;
          const dw = width(d);
          txt(d, W - 10 - dw, y, C.red);
          txt(`+${it.add}`, W - 10 - dw - 6 - width(`+${it.add}`), y, C.green);
        } else if (it.kind === 'job') {
          // a job's card: the command, the bar and the count, the spinner and its clock; or, done, a tick
          const J = state.jobs[it.job];
          box(X - 3, y, W - X - 7, 50, C.card, C.line);
          rect(X + 3, y + 7, 4, 4, J.done ? C.green : C.orange);
          const bw = txt('Bash', X + 12, y + 3, C.text);
          txt(J.cmd, X + 12 + bw + 6, y + 3, C.dim);
          const BX = X + 3, BY = y + 21, BW = W - X - 60;
          rect(BX, BY, BW, 6, C.line);
          rect(BX, BY, Math.round((BW * J.passed) / J.total), 6, C.green);
          txt(`${J.passed}/${J.total}`, BX + BW + 6, BY - 3, J.done ? C.green : C.dim);
          const m = Math.floor(J.elapsed / 60), sec = Math.floor(J.elapsed % 60);
          const clock = m ? `${m}m ${String(sec).padStart(2, '0')}s` : `${sec}s`;
          if (J.done) {
            check(X + 3, y + 35);
            txt(J.doneText, X + 13, y + 33, C.green);
          } else {
            spark(X + 3, y + 35, t);
            txt(J.label + '.'.repeat(1 + (Math.floor(t * 2) % 3)), X + 13, y + 33, C.orange);
          }
          txt(clock, W - 14 - width(clock), y + 33, C.faint);
        }
      }
      y += Math.round(HT[it.kind] * grow(it));
    }
    ctx.restore();

    // ---- the input box: what's being typed and the caret, or the hint; the send button lit on Enter ----
    box(X - 3, IY, W - X - 7, 25, C.card, state.input || state.caret ? '#5a5853' : C.line);
    if (state.input) txt(state.input, X + 3, IY + 7, C.text);
    else txt(L('回复 Claude…', 'Reply to Claude…'), X + 3, IY + 7, C.faint);
    if (state.caret && Math.floor(t * 2.4) % 2 === 0) rect(X + 3 + (state.input ? width(state.input) + 1 : 0), IY + 7, 1, 12, C.text);
    box(W - 27, IY + 5, 15, 15, state.sent ? '#f2a07f' : state.input ? C.orange : '#6b4a3c');
    for (let i = 0; i < 4; i++) rect(W - 20 - i, IY + 8 + i, 1 + i * 2, 1, C.main);
    rect(W - 20, IY + 11, 1, 6, C.main);
    // Clawd sits on the box's top edge; the scene moves it (state.clawd: x, y, s, rod, legs, alert)
    const c = state.clawd;
    if (c?.rod === 'up') {
      // the rod from its right nub, up and out, the line into the box, the float bobbing
      const tipX = home.x + 32, tipY = home.y - 9;
      for (let i = 0; i <= 15; i++) rect(home.x + 17 + i, home.y + 4 - Math.round(i * 0.85), 1, 1, '#c9b48a');
      const fy = IY + 9 + (Math.sin(t * 2.1) > 0.6 ? 1 : 0);
      for (let j = tipY + 1; j < fy; j++) rect(tipX, j, 1, 1, '#8a8679');
      rect(tipX - 1, fy, 3, 2, C.red), rect(tipX - 1, fy + 2, 3, 1, C.text);
    } else {
      // put down along the box's edge, the float lying by it
      rect(home.x + 19, IY - 1, 16, 1, '#c9b48a');
      rect(home.x + 36, IY - 2, 3, 2, C.red);
    }
    // a ring spreading over the box where Clawd went through
    if (state.ripple && state.ripple.k < 1) {
      const k = state.ripple.k, r = 3 + k * 26, cx = home.x + 9, cy = home.y + 6;
      ctx.globalAlpha = 1 - k;
      for (let a = 0; a < 64; a++) rect(cx + Math.round(Math.cos((a / 64) * Math.PI * 2) * r), cy + Math.round(Math.sin((a / 64) * Math.PI * 2) * r * 0.45), 1, 1, '#ffd2b0');
      ctx.globalAlpha = 1;
    }
    if (c && !c.hidden) {
      const x = Math.round(c.x ?? home.x), y = Math.round(c.y ?? home.y), s = c.s ?? 1;
      clawd(x, y, { blink: c.blink ?? t % 3.7 > 3.55, legs: c.legs ?? 0, s });
      if (c.alert) rect(x + 8 * s, y - 9, 2, 5, '#f2d45c'), rect(x + 8 * s, y - 3, 2, 2, '#f2d45c');
    }

    // ---- the game's window, over the app at the top left: its title bar and the picture ----
    if (state.win && state.win.k > 0) {
      const { img, k } = state.win;
      const w = Math.round(WIN.w * k), h = Math.round(WIN.h * k);
      const x = WIN.x + Math.round((WIN.w - w) / 2), y = WIN.y + Math.round((WIN.h - h) / 2);
      rect(x - 1, y - 1, w + 2, h + 2, '#000');
      rect(x, y, w, h, C.bar);
      if (k > 0.6) {
        rect(x + 4, y + 4, 4, 4, '#4caf6a');
        txt('moyu', x + 12, y - 1, C.dim);
        for (let i = 0; i < 5; i++) rect(x + w - 10 + i, y + 3 + i, 1, 1, C.dim), rect(x + w - 6 - i, y + 3 + i, 1, 1, C.dim);
      }
      if (img) ctx.drawImage(img, x, y + WIN.bar, w, h - WIN.bar);
    }

    // ---- the taskbar ----
    rect(0, BOT, W, H - BOT, C.task);
    rect(0, BOT, W, 1, '#22252b');
    // start, then the pinned apps
    for (const [i, j] of [[0, 0], [5, 0], [0, 5], [5, 0 + 5]]) rect(8 + i, BOT + 3 + j, 4, 4, '#5aa0e6');
    const apps = ['#e3a63b', '#3b82d6', '#d97757', '#4caf6a'];
    apps.forEach((c, i) => {
      rect(26 + i * 15, BOT + 3, 9, 9, c);
      if (i === 2) rect(26 + i * 15 + 2, BOT + 13, 5, 1, '#9aa4b5');
    });
    txt(state.clock, W - 8 - width(state.clock), BOT + 1, '#c9ced8');

    tex.needsUpdate = true;
  }

  return { tex, draw, state, home, W, H, WIN, CLAWD_W: CLAWD[0].length, CLAWD_H: CLAWD.length };
}
