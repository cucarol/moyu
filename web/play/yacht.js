// Yacht in the casino: five dice in a felt tray, a leather cup each, a score pad. Each
// die keeps its own place left to right (positions 1-5, as the CLI counts them); kept dice
// sit on the mover's side of the tray, loose ones in the middle. Click dice to keep them,
// the cup (or the button) to roll the rest, a box on the pad to score.
import { THREE, canvasTex, pixelText, mat } from './stage.js';
import { roomOptions as casinoOptions, TABLE_Y } from './casino.js';
import { joinTable, sfx, mood, cues } from './seat.js';
import { sealTag, showEnding } from './ending.js';
import { sceneActs } from './acts.js';
import { t as tr } from './i18n.js';
import { reviewAvatar } from './avatar/review.js'; // avatar

export const roomOptions = casinoOptions;
const OPP = 'Clawd';

const CATS = [
  ['ones', tr('ui.yacht.cats.ones.name'), tr('ui.yacht.cats.ones.does')],
  ['twos', tr('ui.yacht.cats.twos.name'), tr('ui.yacht.cats.twos.does')],
  ['threes', tr('ui.yacht.cats.threes.name'), tr('ui.yacht.cats.threes.does')],
  ['fours', tr('ui.yacht.cats.fours.name'), tr('ui.yacht.cats.fours.does')],
  ['fives', tr('ui.yacht.cats.fives.name'), tr('ui.yacht.cats.fives.does')],
  ['sixes', tr('ui.yacht.cats.sixes.name'), tr('ui.yacht.cats.sixes.does')],
  ['choice', tr('ui.yacht.cats.choice.name'), tr('ui.yacht.cats.choice.does')],
  ['four', tr('ui.yacht.cats.four.name'), tr('ui.yacht.cats.four.does')],
  ['house', tr('ui.yacht.cats.house.name'), tr('ui.yacht.cats.house.does')],
  ['small', tr('ui.yacht.cats.small.name'), tr('ui.yacht.cats.small.does')],
  ['large', tr('ui.yacht.cats.large.name'), tr('ui.yacht.cats.large.does')],
  ['yacht', tr('ui.yacht.cats.yacht.name'), tr('ui.yacht.cats.yacht.does')],
];
const CAT = Object.fromEntries(CATS.map(([id, name, does]) => [id, { name, does }]));
const UPPER = CATS.slice(0, 6).map((c) => c[0]);
const BONUS_AT = 63;
const BONUS = 35;

// ---- dice ----
// faces as BoxGeometry orders them: +x, -x, +y, -y, +z, -z
const FACE_VALUES = [3, 4, 1, 6, 2, 5];
const PIPS = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
};
const DIE = 0.066;
function dieMats(kept = false) {
  return FACE_VALUES.map((n) =>
    mat({
      map: canvasTex(14, 14, (ctx) => {
        ctx.fillStyle = kept ? '#ffe9a8' : '#f2e8d6';
        ctx.fillRect(0, 0, 14, 14);
        ctx.fillStyle = kept ? '#c9a24a' : '#cfc2a8';
        ctx.fillRect(0, 13, 14, 1);
        ctx.fillRect(13, 0, 1, 14);
        // the one and the four in red, like old bone dice
        ctx.fillStyle = n === 1 || n === 4 ? '#c4302b' : '#221c18';
        const big = n === 1 ? 4 : 2;
        for (const [x, y] of PIPS[n]) ctx.fillRect(2 + x * 4 + (n === 1 ? -1 : 0), 2 + y * 4 + (n === 1 ? -1 : 0), big, big);
      }),
    }),
  );
}
// the turn that brings value n to the top
const UP = new THREE.Vector3(0, 1, 0);
function faceUp(n, yaw) {
  const e = { 1: [0, 0, 0], 6: [Math.PI, 0, 0], 2: [-Math.PI / 2, 0, 0], 5: [Math.PI / 2, 0, 0], 3: [0, 0, Math.PI / 2], 4: [0, 0, -Math.PI / 2] }[n];
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...e));
  return new THREE.Quaternion().setFromAxisAngle(UP, yaw).multiply(q);
}

const TRAY = { x: 0, z: 0.02, w: 0.56, d: 0.34 };
const slotX = (i) => TRAY.x - 0.2 + i * 0.1;
const ROW = { loose: TRAY.z - 0.005, you: TRAY.z + 0.11, opp: TRAY.z - 0.115 };

function buildRoom(stage, casino) {
  const { scene, tween, ease, pickable, project } = stage;
  casino.print({
    print(ctx, w) {
      const t = pixelText(tr('ui.yacht.felt'), { color: '#c9a24a' });
      ctx.globalAlpha = 0.65;
      ctx.drawImage(t, Math.round((w - t.width) / 2), 132);
      ctx.globalAlpha = 1;
    },
  });

  // -- the tray: a wooden frame lined with dark felt
  const tray = new THREE.Group();
  tray.position.set(TRAY.x, TABLE_Y, TRAY.z);
  scene.add(tray);
  const lining = canvasTex(32, 20, (ctx) => {
    for (let y = 0; y < 20; y++)
      for (let x = 0; x < 32; x++) {
        const n = ((x * 5 + y * 11) % 4) - 1;
        ctx.fillStyle = `rgb(${92 + n * 3},${22 + n},${34 + n})`;
        ctx.fillRect(x, y, 1, 1);
      }
  });
  const bed = new THREE.Mesh(new THREE.BoxGeometry(TRAY.w, 0.01, TRAY.d), mat({ map: lining }));
  bed.position.y = 0.005;
  bed.receiveShadow = true;
  tray.add(bed);
  const wood = mat({ color: 0x5a3018 });
  const brass = mat({ color: 0xc9a24a });
  for (const [x, z, w, d] of [
    [0, TRAY.d / 2, TRAY.w + 0.03, 0.015],
    [0, -TRAY.d / 2, TRAY.w + 0.03, 0.015],
    [TRAY.w / 2, 0, 0.015, TRAY.d],
    [-TRAY.w / 2, 0, 0.015, TRAY.d],
  ]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 0.035, d), wood);
    wall.position.set(x, 0.0175, z);
    wall.castShadow = wall.receiveShadow = true;
    const trim = new THREE.Mesh(new THREE.BoxGeometry(w, 0.004, d + 0.002), brass);
    trim.position.set(x, 0.036, z);
    tray.add(wall, trim);
  }
  // the kept rows: a thin gold line on each side of the lining
  for (const who of ['you', 'opp']) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(TRAY.w - 0.04, 0.001, 0.003), mat({ color: 0x8a6a30 }));
    line.position.set(0, 0.0105, ROW[who] - TRAY.z + (who === 'you' ? -0.045 : 0.045));
    tray.add(line);
  }

  // -- a leather cup each
  function cup(x, z) {
    const g = new THREE.Group();
    const leather = mat({ color: 0x6a1a1c, side: THREE.DoubleSide });
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.044, 0.11, 12, 1, true), leather);
    wall.position.y = 0.055;
    wall.castShadow = true;
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.044, 12), mat({ color: 0x3a0c10 }));
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.y = 0.002;
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.004, 4, 14), brass);
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.105;
    const band2 = band.clone();
    band2.scale.setScalar(0.88);
    band2.position.y = 0.02;
    g.add(wall, bottom, band, band2);
    g.position.set(x, TABLE_Y, z);
    scene.add(g);
    return g;
  }
  const cups = { you: cup(-0.42, 0.2), opp: cup(0.42, -0.24) };
  // where Clawd's hands hold the agent's cup: right hand first, on the +x side
  cups.opp.userData.grips = { a: new THREE.Vector3(0.05, 0.06, 0), b: new THREE.Vector3(-0.05, 0.06, 0) };
  const cupHome = { you: cups.you.position.clone(), opp: cups.opp.position.clone() };
  pickable('cup', cups.you);

  // -- the paper pad by your right hand, and a pencil (the real one is in the HUD)
  const paper = canvasTex(20, 28, (ctx) => {
    ctx.fillStyle = '#efe6d2';
    ctx.fillRect(0, 0, 20, 28);
    ctx.fillStyle = '#b8a888';
    for (let y = 4; y < 28; y += 2) ctx.fillRect(2, y, 16, 1);
    ctx.fillStyle = '#c4302b';
    ctx.fillRect(6, 0, 1, 28);
  });
  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.006, 0.16), [mat({ color: 0xd8ccb4 }), mat({ color: 0xd8ccb4 }), mat({ map: paper }), mat({ color: 0x8a6a30 }), mat({ color: 0xd8ccb4 }), mat({ color: 0xd8ccb4 })]);
  pad.position.set(0.36, TABLE_Y + 0.003, 0.24);
  pad.rotation.y = -0.25;
  pad.castShadow = pad.receiveShadow = true;
  const pencil = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.14, 6), mat({ color: 0xe0b040 }));
  pencil.rotation.set(Math.PI / 2, 0, 0.9);
  pencil.position.set(0.44, TABLE_Y + 0.008, 0.25);
  scene.add(pad, pencil);
  pickable('pad', pad);
  // pointed at, the pad lifts a hair off the felt, pencil and all: it opens and folds the
  // score card
  let padUp = 0;
  let padK = 0;
  const padY = pad.position.y;
  const pencilY = pencil.position.y;
  stage.onDispose(stage.onHover((name) => (padUp = name === 'pad' ? 1 : 0)));
  stage.onFrame(() => {
    padK += (padUp - padK) * 0.3;
    pad.position.y = padY + padK * 0.012;
    pencil.position.y = pencilY + padK * 0.012;
  });

  // ---- the dice ----
  // each die has its own materials, so hovering one doesn't light up all five
  const geo = new THREE.BoxGeometry(DIE, DIE, DIE);
  const dice = [...Array(5)].map((_, i) => {
    const m = new THREE.Mesh(geo);
    m.castShadow = m.receiveShadow = true;
    m.visible = false;
    m.userData = { value: 0, row: 'loose', yaw: 0, plain: dieMats(false), kept: dieMats(true) };
    m.material = m.userData.plain;
    scene.add(m);
    pickable(`die:${i}`, m);
    return m;
  });
  const yawOf = () => (Math.random() - 0.5) * 0.5;
  const restAt = (i, row) => new THREE.Vector3(slotX(i) + (row === 'loose' ? (Math.random() - 0.5) * 0.016 : 0), TABLE_Y + 0.01 + DIE / 2, ROW[row] + (row === 'loose' ? (Math.random() - 0.5) * 0.03 : 0));

  // where die i lies now: value on top, in a row
  function place(i, value, row) {
    const d = dice[i];
    d.visible = value > 0;
    d.userData.value = value;
    d.userData.row = row;
    d.userData.yaw = row === 'loose' ? yawOf() : 0;
    d.material = row === 'loose' ? d.userData.plain : d.userData.kept;
    d.position.copy(restAt(i, row));
    d.quaternion.copy(faceUp(value, d.userData.yaw));
  }

  // keep or let go of a die: it slides between the middle and a side row
  async function shift(i, row) {
    const d = dice[i];
    if (d.userData.row === row) return;
    d.userData.row = row;
    d.material = row === 'loose' ? d.userData.plain : d.userData.kept;
    const from = d.position.clone();
    const to = restAt(i, row);
    const q0 = d.quaternion.clone();
    d.userData.yaw = row === 'loose' ? yawOf() : 0;
    const q1 = faceUp(d.userData.value, d.userData.yaw);
    await tween(180, (t) => {
      const e = ease(t);
      d.position.lerpVectors(from, to, e);
      d.position.y += Math.sin(e * Math.PI) * 0.02;
      d.quaternion.slerpQuaternions(q0, q1, e);
    });
  }

  // the dice not kept go back into the mover's cup, the cup shakes, and they pour out
  // hold: where the cup is shaken (the avatar's chest for the agent, if it says)
  async function roll(who, values, kept, { gather = false, hold = null } = {}) {
    const c = cups[who];
    const home = cupHome[who];
    const mouth = home.clone().add(new THREE.Vector3(0, 0.12, 0));
    const loose = [0, 1, 2, 3, 4].filter((i) => !kept.includes(i));
    for (const i of kept) shift(i, who);
    // in they go
    const into = (gather ? [0, 1, 2, 3, 4] : loose).filter((i) => dice[i].visible);
    if (into.length) {
      const from = into.map((i) => dice[i].position.clone());
      await tween(220, (t) => into.forEach((i, k) => dice[i].position.lerpVectors(from[k], mouth, ease(t))));
    }
    for (const i of loose) dice[i].visible = false;
    // shake
    sfx('rattle', { dur: 0.42 });
    const lift = hold ? hold.clone() : home.clone().add(new THREE.Vector3(0, 0.08, who === 'you' ? -0.03 : 0.03));
    await tween(420, (t) => {
      c.position.lerpVectors(home, lift, Math.min(1, t * 3));
      c.rotation.z = Math.sin(t * Math.PI * 7) * 0.25;
      c.rotation.x = Math.sin(t * Math.PI * 5) * 0.1;
    });
    // tip toward the tray and pour
    const lean = who === 'you' ? -1 : 1;
    sfx('roll', { count: loose.length });
    const spins = loose.map(() => new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6)));
    const from = c.position.clone().add(new THREE.Vector3(lean * -0.03, 0.06, lean * 0.04));
    const held = c.position.clone();
    const ends = loose.map((i) => {
      dice[i].userData.value = values[i];
      dice[i].userData.row = 'loose';
      dice[i].userData.yaw = yawOf();
      dice[i].material = dice[i].userData.plain;
      dice[i].visible = true;
      return { to: restAt(i, 'loose'), q: faceUp(values[i], dice[i].userData.yaw) };
    });
    await tween(520, (t) => {
      c.rotation.x = lean * Math.sin(Math.min(1, t * 2) * Math.PI * 0.5) * 1.1;
      c.rotation.z = 0;
      loose.forEach((i, k) => {
        const e = ease(Math.min(1, t * 1.15));
        const d = dice[i];
        d.position.lerpVectors(from, ends[k].to, e);
        d.position.y += Math.abs(Math.sin(e * Math.PI * 2)) * 0.05 * (1 - e);
        d.quaternion.slerpQuaternions(spins[k], ends[k].q, e);
      });
    });
    loose.forEach((i, k) => {
      dice[i].position.copy(ends[k].to);
      dice[i].quaternion.copy(ends[k].q);
    });
    stage.shake(0.004);
    const tilt = c.rotation.x;
    await tween(260, (t) => {
      c.position.lerpVectors(held, home, ease(t));
      c.rotation.x = tilt * (1 - t);
    });
    c.position.copy(home);
    c.rotation.set(0, 0, 0);
  }

  // a scored hand: the dice hop once
  async function hop() {
    const base = dice.map((d) => d.position.y);
    await tween(300, (t) => dice.forEach((d, i) => (d.position.y = base[i] + Math.sin(Math.min(1, t * 1.6 - i * 0.12) * Math.PI) * 0.025 * (t * 1.6 - i * 0.12 > 0))));
    dice.forEach((d, i) => (d.position.y = base[i]));
  }

  return {
    dice,
    place,
    tray,
    pad,
    cups,
    shift,
    roll,
    hop,
    cupScreen: (who) => project(cupHome[who].clone().add(new THREE.Vector3(0, 0.16, 0))),
    // the foot of your cup on your side, where its tag hangs
    cupFoot: () => project(cupHome.you.clone().add(new THREE.Vector3(0, 0, 0.055))),
    // the tray and any die standing in it, as a box on screen, for tags to keep off
    trayScreen() {
      const ps = [];
      for (const x of [-1, 1]) for (const z of [-1, 1]) for (const y of [0, 0.04 + DIE]) ps.push(project(new THREE.Vector3(TRAY.x + x * (TRAY.w / 2 + 0.015), TABLE_Y + y, TRAY.z + z * (TRAY.d / 2 + 0.01))));
      const xs = ps.map((p) => p.x);
      const ys = ps.map((p) => p.y);
      return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
    },
    hide: () => dice.forEach((d) => (d.visible = false)),
  };
}

// The game on the casino hall's table: stage is the game's own layer (see stage.js layer()),
// scene the hall it sits in ({ opp, casino }, from scenes.js).
export function mount(stage, { scene, createHud, table, k, director } = {}) {
  const { opp } = scene;
  const world = buildRoom(stage, scene.casino);
  let seat = null;
  // what Clawd reaches for (card-0twvw1bk): the tray, its cup, and a spot for its pad
  const oppPad = new THREE.Object3D();
  oppPad.position.set(-0.3, TABLE_Y, -0.28);
  stage.scene.add(oppPad);
  opp.setProps?.({ tray: world.tray, cup: world.cups.opp, pad: oppPad });
  reviewAvatar(opp); // avatar: ?avatar-review, every avatar state on buttons
  const hud = createHud(stage, opp, {
    game: 'yacht',
    nudge: tr('ui.yacht.nudge'),
    send: table ? (text) => seat.send('say', { text }) : director ? () => {} : null,
  });
  const { status, log, toast } = hud;

  // ---- the score pad: twelve boxes a seat, with what your dice would score in yours ----
  const pad = document.createElement('section');
  pad.className = 'pad keep-clear';
  document.querySelector('.hud').append(pad);
  // The paper pad on the table (or the card's title) puts the card away and brings it
  // back; each viewer's choice is kept. Folded, it still opens by itself when you
  // have to score, and folds back once you have.
  const CARD = 'moyu.yacht.card';
  let cardOpen = true;
  try {
    cardOpen = localStorage.getItem(CARD) !== 'folded';
  } catch {}
  let peek = false;
  const cardShown = () => cardOpen || peek;
  const showCard = () => pad.classList.toggle('folded', !cardShown());
  function toggleCard() {
    cardOpen = !cardShown();
    peek = false;
    try {
      localStorage.setItem(CARD, cardOpen ? 'open' : 'folded');
    } catch {}
    showCard();
  }
  showCard();

  // what the pad shows, as the room has played it out
  const sheets = { you: {}, opp: {} };
  let names = { you: tr('ui.common.you'), opp: OPP };
  let options = null; // your open boxes and what they'd score, on your turn
  let flash = null; // the box scored last, to flash it once
  let roundNo = 0;
  const upperOf = (s) => UPPER.reduce((n, c) => n + (s[c] ?? 0), 0);
  const totalOf = (s) => CATS.reduce((n, [c]) => n + (s[c] ?? 0), 0) + (upperOf(s) >= BONUS_AT ? BONUS : 0);

  function drawPad() {
    pad.replaceChildren();
    const el = (tag, cls, text) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text !== undefined) e.textContent = text;
      return e;
    };
    const title = el('button', 'pad-title', roundNo ? tr('ui.yacht.padRound', { round: roundNo }) : tr('ui.yacht.pad'));
    title.type = 'button';
    title.onclick = toggleCard;
    pad.append(title);
    const grid = el('div', 'pad-grid');
    const head = (a, b, c, cls = 'pad-head') => grid.append(el('span', `${cls} name`, a), el('span', `${cls} you`, b), el('span', `${cls} opp`, c));
    head('', names.you, names.opp);
    const row = ([id, label, does]) => {
      const name = el('span', 'name', label);
      const cell = (who) => {
        const v = sheets[who][id];
        const c = el(v === null || v === undefined ? 'button' : 'span', `box ${who}`);
        c.dataset.cat = id;
        if (v !== null && v !== undefined) {
          c.textContent = v;
          if (v === 0) c.classList.add('zero');
          if (flash && flash.who === who && flash.id === id) c.classList.add('flash');
        } else if (who === 'you' && options && id in options) {
          c.textContent = options[id];
          c.classList.add('option');
          if (options[id] === 0) c.classList.add('zero');
          c.type = 'button';
          c.onclick = () => scoreIn(id);
          c.onpointerenter = (e) => hud.tip({ title: tr('ui.yacht.scoreHere', { cat: label, n: options[id] }), text: does }, e.clientX, e.clientY);
          c.onpointermove = (e) => hud.tip({ title: tr('ui.yacht.scoreHere', { cat: label, n: options[id] }), text: does }, e.clientX, e.clientY);
          c.onpointerleave = () => hud.tip(null);
        } else {
          c.textContent = '';
          c.disabled = true;
        }
        return c;
      };
      name.title = does;
      grid.append(name, cell('you'), cell('opp'));
    };
    CATS.slice(0, 6).forEach(row);
    const up = (who) => `${upperOf(sheets[who])}/${BONUS_AT}`;
    head(tr('ui.yacht.subtotal'), up('you'), up('opp'), 'pad-sum');
    const bonus = (who) => (upperOf(sheets[who]) >= BONUS_AT ? `+${BONUS}` : '');
    head(tr('ui.yacht.bonus', { n: BONUS }), bonus('you'), bonus('opp'), 'pad-sum');
    CATS.slice(6).forEach(row);
    head(tr('ui.yacht.total'), totalOf(sheets.you), totalOf(sheets.opp), 'pad-total');
    pad.append(grid);
  }

  // ---- your moves ----
  let keep = new Set(); // dice you're keeping for the next roll
  const myTurn = () => seat?.yourTurn();
  const canRoll = () => myTurn() && seat.state.v.legal.includes('roll');
  function rollText() {
    const left = seat.state.v.rollsLeft;
    return keep.size ? tr('ui.yacht.rollSome', { kept: keep.size, rest: 5 - keep.size, left }) : tr('ui.yacht.rollAll', { left });
  }
  // On the table: a tag under your cup to roll (R), kept off the tray and its dice. The pad
  // says what it does only when pointed at.
  const acts = sceneActs(stage, (id) => id === 'roll' && rollNow());
  function showMoves() {
    // nothing left but to score: a folded card opens for it
    peek = !!myTurn() && !(canRoll() && keep.size < 5);
    showCard();
    if (!myTurn()) return acts.hide();
    const list = [];
    if (canRoll() && keep.size < 5) list.push({ id: 'roll', key: 'R', label: rollText(), cls: 'roll under', under: true, dy: 6, at: world.cupFoot, avoid: () => [world.trayScreen()] });
    acts.show(list);
  }
  function rollNow() {
    if (!canRoll() || keep.size === 5) return;
    lock();
    seat.act({ action: 'roll', keep: [...keep].sort() });
  }
  function scoreIn(id) {
    if (!myTurn()) return;
    lock();
    seat.act({ action: 'score', category: id });
  }
  function lock() {
    acts.hide();
    options = null;
    stage.setHover(null);
    hud.tip(null);
    drawPad();
  }
  async function toggle(i) {
    if (!canRoll()) return;
    if (keep.has(i)) keep.delete(i);
    else keep.add(i);
    sfx(keep.has(i) ? 'keep' : 'unkeep');
    showMoves();
    await world.shift(i, keep.has(i) ? 'you' : 'loose');
  }

  hud.interact(
    (thing) => {
      if (thing.startsWith('die:')) {
        if (!canRoll()) return null;
        const i = +thing.slice(4);
        return keep.has(i) ? { title: tr('ui.yacht.tips.unkeepTitle'), text: tr('ui.yacht.tips.unkeep') } : { title: tr('ui.yacht.tips.keepTitle'), text: tr('ui.yacht.tips.keep') };
      }
      if (thing === 'cup') return canRoll() && keep.size < 5 ? { title: tr('ui.yacht.tips.rollTitle'), text: rollText() } : null;
      if (thing === 'pad') {
        const what = !myTurn() ? tr('ui.yacht.tips.pad') : canRoll() && keep.size < 5 ? tr('ui.yacht.padNoteRoll') : tr('ui.yacht.padNote');
        return { title: `${tr('ui.yacht.pad')} · ${tr(cardShown() ? 'ui.yacht.tips.padHide' : 'ui.yacht.tips.padShow')}`, text: what };
      }
      return null;
    },
    (thing) => {
      if (thing.startsWith('die:')) toggle(+thing.slice(4));
      else if (thing === 'cup') rollNow();
      else if (thing === 'pad') toggleCard();
    },
  );

  drawPad();
  if (!table && !director) {
    status(tr('ui.yacht.preview'));
    [3, 3, 5, 3, 1].forEach((n, i) => world.place(i, n, i === 0 || i === 1 || i === 3 ? 'you' : 'loose'));
    return;
  }

  const name = (id) => seat.nameOf(id);
  const sheetOf = (s) => ({ ...s.sheet });

  function sync(v) {
    for (const s of v.seats) sheets[seat.side(s.id)] = sheetOf(s);
    names = { you: tr('ui.common.you'), opp: name(seat.oppId()) };
    // a game ended early stays on the round it ended in
    roundNo = v.phase === 'over' && v.log.at(-1)?.reason !== 'quit' ? 12 : Math.min(12, Math.floor(v.turnNo / 2) + 1);
    const who = v.turn ? seat.side(v.turn) : 'you';
    v.dice.forEach((n, i) => world.place(i, n, v.kept[i] ? who : 'loose'));
    keep = new Set(v.turn === v.you ? v.kept.flatMap((k, i) => (k ? [i] : [])) : []);
    drawPad();
  }

  async function play(e, v) {
    const who = seat.side(e.seat ?? v.you);
    cues?.cueYacht?.(opp, e, v);
    switch (e.type) {
      case 'roll': {
        // a round is both of you scoring once
        if (e.rollNo === 1) roundNo = Math.min(12, Math.floor(v.log.filter((x) => x.type === 'score' && x.seq < e.seq).length / 2) + 1);
        options = null;
        drawPad();
        await world.roll(who, e.dice, e.kept, { gather: e.rollNo === 1, hold: who === 'opp' ? opp.anchors?.holdCup : null });
        if (who === 'you') keep = new Set(e.kept);
        log(e.rollNo === 1 ? tr('ui.yacht.rollLog', { name: name(e.seat), dice: e.dice.join(' ') }) : tr('ui.yacht.rerollLog', { name: name(e.seat), kept: e.kept.length ? e.kept.map((i) => e.dice[i]).join(' ') : tr('ui.yacht.keptNone'), dice: e.dice.join(' ') }));
        await seat.wait(who === 'opp' ? 500 : 150);
        break;
      }
      case 'score': {
        const upperBefore = upperOf(sheets[who]);
        sheets[who][e.category] = e.points;
        flash = { who, id: e.category };
        drawPad();
        const c = CAT[e.category];
        sfx('score', { points: e.points });
        if (e.category === 'yacht' && e.points === 50) sfx('yacht');
        if (upperBefore < BONUS_AT && upperOf(sheets[who]) >= BONUS_AT) sfx('bonus');
        await world.hop();
        toast(tr('ui.yacht.scoreToast', { name: who === 'you' ? tr('ui.common.you') : name(e.seat), cat: c.name, n: e.points }), 1500);
        log(tr('ui.yacht.scoreLog', { name: name(e.seat), cat: c.name, n: e.points, total: e.total }));
        await seat.wait(900);
        flash = null;
        break;
      }
      case 'quit':
        log(tr('ui.yacht.quitLog', { name: name(e.seat) }));
        break;
      case 'game_over': {
        const won = e.winner === v.you;
        sfx(!e.winner ? 'over' : won ? 'win' : 'lose');
        toast(!e.winner ? tr('ui.yacht.draw') : won ? tr('ui.yacht.youWon') : tr('ui.yacht.wonToast', { name: name(e.winner) }), 2600);
        log(tr('ui.yacht.overLog'));
        break;
      }
    }
  }

  function settle(v) {
    sealTag(v.commit);
    names = { you: tr('ui.common.you'), opp: name(seat.oppId()) };
    for (const s of v.seats) sheets[seat.side(s.id)] = sheetOf(s);
    const mine = v.turn === v.you && v.phase === 'playing';
    options = mine ? v.options : null;
    // your kept dice, as you left them
    if (mine) for (let i = 0; i < 5; i++) if (world.dice[i].userData.row !== (keep.has(i) ? 'you' : 'loose')) world.shift(i, keep.has(i) ? 'you' : 'loose');
    drawPad();
    showMoves();
    mood(v);
    cues?.restYacht?.(opp, v);
    const them = names.opp;
    if (v.phase === 'over') {
      const you = v.seats.find((s) => s.id === v.you).total;
      const theirs = v.seats.find((s) => s.id !== v.you).total;
      const outcome = !v.winner ? 'draw' : v.winner === v.you ? 'won' : 'lost';
      const quit = v.log.at(-1)?.reason === 'quit';
      status(outcome === 'draw' ? tr('ui.yacht.overDraw', { a: you, b: theirs }) : outcome === 'won' ? tr('ui.yacht.overWon', { a: you, b: theirs }) : tr('ui.yacht.overLost', { name: them, a: theirs, b: you }));
      showEnding({
        v,
        outcome,
        opp: them,
        what: tr('ui.yacht.sealed'),
        title: quit ? (v.log.findLast((e) => e.type === 'quit')?.seat === v.you ? tr('ui.yacht.youQuit') : tr('ui.yacht.theyLeft', { name: them })) : tr('ui.yacht.titleDone'),
        big: outcome === 'draw' ? (quit ? tr('ui.yacht.gameOver') : tr('ui.yacht.draw')) : outcome === 'won' ? tr('ui.yacht.youWon') : tr('ui.yacht.theyWon', { name: them }),
        sub: tr('ui.yacht.sub', { you: tr('ui.common.you'), mine: you, name: them, theirs }),
        rows: [[tr('ui.common.you'), tr('ui.yacht.points', { n: you })], [them, tr('ui.yacht.points', { n: theirs })]],
      });
      return;
    }
    const head = tr('ui.yacht.head', { round: roundNo });
    hud.standing(head, [[tr('ui.common.you'), totalOf(sheets.you)], [them, totalOf(sheets.opp)]]);
    if (mine) status(tr('ui.yacht.yourTurn', { head, what: v.rollsLeft ? tr('ui.yacht.rollsLeft', { n: v.rollsLeft }) : tr('ui.yacht.scoreNow') }), 'you');
    else status(tr('ui.yacht.thinking', { head, name: them }), 'opp');
  }

  seat = joinTable({ table, k, hud, opp, sync, play, settle, director: !!director });
  stage.onDispose(() => {
    seat.close();
    hud.standing(null);
  });
  // A director's script stands in for the server. Your move is made as a hand makes it:
  // the dice to keep tapped one by one, then the cup (or the box to score in).
  if (director)
    import('./director/index.js').then((d) =>
      d.run(director, {
        game: 'yacht',
        stage,
        room: world,
        scene,
        casino: scene.casino,
        opp,
        hud,
        push: seat.push,
        idle: seat.idle,
        async before(m) {
          if (m.who !== 'you' || m.press === 0) return;
          const step = m.press ?? 380;
          if (m.roll !== undefined) {
            const want = new Set(m.keep ?? []);
            for (let i = 0; i < 5; i++)
              if (keep.has(i) !== want.has(i)) {
                stage.setHover(`die:${i}`);
                await toggle(i);
                await seat.wait(step * 0.4);
              }
            stage.setHover('cup');
            await seat.wait(step);
          } else {
            const box = pad.querySelector(`.box.you.option[data-cat="${m.score}"]`);
            box?.classList.add('hover');
            await seat.wait(step);
          }
          lock();
        },
      }),
    );
}
