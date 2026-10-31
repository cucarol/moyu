// Heads-up 21 in the casino: no dealer, each of you an up card and a hole card, eight
// hands paid in tokens, with a betting round after the deal and one before the showdown.
// Your hole card lies face up with a violet edge (only you can see it); the agent's stays
// face down until a showdown turns it over. The shoe deals a card, the bell stands (or
// checks), your tokens bet, raise, call or go all in.
import { THREE, canvasTex, pixelText, drawBits, mat } from './stage.js';
import { roomOptions as casinoOptions, TABLE_Y, tokens, chipSpot, flyChips, addGlints } from './casino.js';
import { joinTable, sfx, mood, cues } from './seat.js';
import { sealTag, showEnding } from './ending.js';
import { sceneActs } from './acts.js';
import { t as tr } from './i18n.js';
import { reviewAvatar } from './avatar/review.js'; // avatar

export const roomOptions = casinoOptions;

const SUIT_BITS = {
  H: ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'],
  D: ['...X...', '..XXX..', '.XXXXX.', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'],
  S: ['...X...', '..XXX..', '.XXXXX.', 'XXXXXXX', 'XXXXXXX', '..XXX..', '.XXXXX.'],
  C: ['..XXX..', '..XXX..', 'XXXXXXX', 'XXXXXXX', 'XX.X.XX', '...X...', '.XXXXX.'],
};
const HOLE = '#9a6ad8';

const faceCache = new Map();
// Read from across a table at ~200 rows: one big rank, one big suit, nothing else. A hole
// card of yours gets a violet edge and an eye: you see it, they don't.
function cardFace(code, hole = false) {
  const key = `${code}${hole ? '*' : ''}`;
  if (faceCache.has(key)) return faceCache.get(key);
  const rank = code.slice(0, -1);
  const suit = code.slice(-1);
  const ink = suit === 'H' || suit === 'D' ? '#c4302b' : '#221c18';
  const t = canvasTex(36, 50, (ctx, w, h) => {
    ctx.fillStyle = hole ? HOLE : '#c9b892';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#efe3c6';
    ctx.fillRect(hole ? 2 : 0, hole ? 2 : 0, w - (hole ? 4 : 1), h - (hole ? 4 : 1));
    const glyph = pixelText(rank, { color: ink });
    ctx.drawImage(glyph, Math.round((w - glyph.width * 2) / 2), 4, glyph.width * 2, glyph.height * 2);
    drawBits(ctx, SUIT_BITS[suit], 11, 32, 2, ink);
    if (hole) drawBits(ctx, ['.XXX.', 'X.X.X', '.XXX.'], 27, 43, 1, HOLE);
  });
  faceCache.set(key, t);
  return t;
}

const backTex = () =>
  canvasTex(32, 44, (ctx, w, h) => {
    ctx.fillStyle = '#efe3c6';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#7a1c2c';
    ctx.fillRect(2, 2, w - 4, h - 4);
    ctx.fillStyle = '#9a2c3a';
    for (let y = 2; y < h - 2; y += 4) for (let x = 2 + ((y / 4) % 2) * 2; x < w - 2; x += 4) ctx.fillRect(x, y, 2, 2);
    // a little fish in the middle: this is 摸鱼's deck
    drawBits(ctx, ['..XX....', '.XXXX.X.', 'XXX.XXX.', '.XXXX.X.', '..XX....'], 12, 19, 1, '#efe3c6');
  });

// the totals rule, as the server counts it
function handTotal(cards) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    const r = c.slice(0, -1);
    if (r === 'A') {
      total += 11;
      aces++;
    } else total += ['J', 'Q', 'K'].includes(r) ? 10 : Number(r);
  }
  while (total > 21 && aces) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

// a soft hand shows both ways its ace counts, 7/17
const points = ({ total, soft }) => (soft && total < 21 ? `${total - 10}/${total}` : total);

const CARD = { w: 0.09, h: 0.002, d: 0.128 };
const HANDS = {
  you: { x: -0.12, z: 0.2, step: 0.072 },
  opp: { x: 0.12, z: -0.2, step: -0.072 },
};

function buildRoom(stage, casino) {
  const { scene, tween, ease, pickable, project, shake } = stage;
  // the felt: two card boxes and the pot ring, in gold print
  casino.print({
    print(ctx, w, h) {
      ctx.fillStyle = '#c9a24a';
      const box = (x, y, bw, bh) => {
        for (let i = 0; i < bw; i += 2) ctx.fillRect(x + i, y, 1, 1), ctx.fillRect(x + i, y + bh, 1, 1);
        for (let i = 0; i < bh; i += 2) ctx.fillRect(x, y + i, 1, 1), ctx.fillRect(x + bw, y + i, 1, 1);
      };
      box(78, 112, 88, 30); // yours
      box(90, 28, 88, 30); // theirs
      const ring = (x, y, r) => {
        for (let a = 0; a < Math.PI * 2; a += 0.06) ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r), 1, 1);
      };
      ring(68, 82, 14); // the pot
      const t = pixelText(tr('ui.blackjack.felt'), { color: '#c9a24a' });
      ctx.globalAlpha = 0.7;
      ctx.drawImage(t, Math.round((w - t.width) / 2), 78);
      ctx.globalAlpha = 1;
    },
  });

  // -- the shoe, where you click to hit
  const shoe = new THREE.Group();
  const shoeBody = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.075, 0.19), mat({ color: 0x1e3a2e }));
  shoeBody.position.y = 0.0375;
  shoeBody.castShadow = true;
  // the lip stands proud of the body on every side (its top 5 mm up, its ends 2 mm out): faces a
  // hair apart or flush flicker against each other from the seat
  const shoeLip = new THREE.Mesh(new THREE.BoxGeometry(0.124, 0.012, 0.04), mat({ color: 0xc9a24a }));
  shoeLip.position.set(0, 0.074, 0.085);
  const shoeCards = new THREE.Mesh(new THREE.BoxGeometry(0.094, 0.06, 0.15), mat({ map: backTex() }));
  shoeCards.position.set(0, 0.06, -0.01);
  shoeCards.rotation.x = -0.25;
  shoe.add(shoeBody, shoeLip, shoeCards);
  shoe.position.set(0.47, TABLE_Y, -0.04);
  shoe.rotation.y = -0.6;
  scene.add(shoe);

  // -- the bell: ring it to stand
  const bell = new THREE.Group();
  const bellBase = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.048, 0.014, 10), mat({ color: 0x3a1a14 }));
  const bellDome = new THREE.Mesh(new THREE.SphereGeometry(0.036, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat({ color: 0xd9b25c }));
  bellDome.position.y = 0.008;
  bellDome.castShadow = true;
  const bellKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.02, 6), mat({ color: 0xd9b25c }));
  bellKnob.position.y = 0.046;
  bell.add(bellBase, bellDome, bellKnob);
  bell.position.set(0.32, TABLE_Y + 0.007, 0.25);
  scene.add(bell);
  pickable('shoe', shoe);
  pickable('bell', bell);

  // -- tokens: yours by your right hand, theirs across, the pot between, pushed in loose
  const piles = {
    you: chipSpot(stage, 'stack', new THREE.Vector3(-0.42, TABLE_Y, 0.24)),
    opp: chipSpot(stage, null, new THREE.Vector3(-0.2, TABLE_Y, -0.3)),
    pot: chipSpot(stage, null, new THREE.Vector3(-0.32, TABLE_Y, 0.0), { loose: true }),
  };
  addGlints(stage, () => Object.values(piles));

  // ---- cards ----
  const back = backTex();
  const cardSide = mat({ color: 0xe6d8b8 });
  const backMat = mat({ map: back });
  const hands = { you: [], opp: [] };

  function cardMesh() {
    const m = new THREE.Mesh(new THREE.BoxGeometry(CARD.w, CARD.h, CARD.d), [cardSide, cardSide, backMat, backMat, cardSide, cardSide]);
    m.castShadow = m.receiveShadow = true;
    return m;
  }
  // a face up card shows its face on top; a face down one shows the back there
  function setFace(card, code, hole) {
    card.material = card.material.slice();
    card.material[2] = code ? mat({ map: cardFace(code, hole) }) : backMat;
    card.userData.code = code;
  }

  function slot(who, i) {
    const h = HANDS[who];
    return new THREE.Vector3(h.x + i * h.step, TABLE_Y + 0.003 + i * 0.0025, h.z);
  }

  // code: what's on its face, null for face down. hole: your own hole card.
  async function deal(who, code, { hole = false, instant = false } = {}) {
    const card = cardMesh();
    setFace(card, code, hole);
    const to = slot(who, hands[who].length);
    hands[who].push(card);
    scene.add(card);
    const rotTo = (Math.random() - 0.5) * 0.1;
    card.userData.rest = rotTo;
    pickable(`card:${who}:${hands[who].length - 1}`, card);
    if (instant) {
      card.position.copy(to);
      card.rotation.set(0, rotTo, 0);
      return;
    }
    sfx('card');
    const from = shoe.position.clone().add(new THREE.Vector3(-0.04, 0.09, 0.04));
    await tween(360, (t) => {
      const e = ease(t);
      card.position.lerpVectors(from, to, e);
      card.position.y += Math.sin(e * Math.PI) * 0.07;
      card.rotation.set(0, -0.6 + (rotTo + 0.6) * e, 0);
    });
    if (code) sfx('flip');
  }

  async function flip(who, i, code) {
    const card = hands[who][i];
    if (!card) return;
    const base = card.position.clone();
    sfx('reveal');
    await tween(160, (t) => {
      card.rotation.x = (Math.PI / 2) * t;
      card.position.y = base.y + Math.sin(t * Math.PI * 0.5) * 0.05;
    });
    setFace(card, code, false);
    await tween(160, (t) => {
      card.rotation.x = (Math.PI / 2) * (1 - t);
      card.position.y = base.y + Math.cos(t * Math.PI * 0.5) * 0.05;
    });
    card.rotation.x = 0;
    card.position.y = base.y;
  }

  // a fold: the hand goes face down and slides toward the pot
  async function muck(who) {
    const cards = hands[who];
    const from = cards.map((c) => c.position.clone());
    const to = piles.pot.anchor.position.clone().add(new THREE.Vector3(0.1, 0.004, who === 'you' ? 0.06 : -0.06));
    for (const c of cards) setFace(c, null);
    await tween(380, (t) => {
      const e = ease(t);
      cards.forEach((c, i) => c.position.lerpVectors(from[i], to.clone().setY(to.y + i * 0.0025), e));
    });
  }

  // the dealt cards go back toward the shoe between hands
  async function sweep(instant = false) {
    const all = [...hands.you, ...hands.opp];
    hands.you = [];
    hands.opp = [];
    for (const name of [...Array(12).keys()].flatMap((i) => [`card:you:${i}`, `card:opp:${i}`])) stage.drop(name);
    if (!instant && all.length) {
      const from = all.map((c) => c.position.clone());
      const to = shoe.position.clone().add(new THREE.Vector3(0.1, 0.01, -0.12));
      await tween(340, (t) => all.forEach((c, i) => c.position.lerpVectors(from[i], to, ease(t))));
    }
    for (const c of all) scene.remove(c);
  }

  async function ringBell() {
    sfx('stand');
    await tween(260, (t) => {
      bellKnob.position.y = 0.046 - Math.sin(t * Math.PI) * 0.012;
      bell.rotation.z = Math.sin(t * Math.PI * 6) * 0.08 * (1 - t);
    });
  }

  // a hand's tag goes just in front of it: yours from its first card, clear of your tokens
  // to its left; theirs under the middle of the hand, clear of the shoe's tag to its right
  const handScreen = (who) => {
    const h = HANDS[who];
    if (who === 'you') return project(new THREE.Vector3(h.x - CARD.w / 2, TABLE_Y + 0.01, h.z + CARD.d / 2 + 0.006));
    return project(new THREE.Vector3(h.x + (h.step * Math.max(0, hands.opp.length - 1)) / 2, TABLE_Y + 0.01, h.z + CARD.d / 2 + 0.006));
  };
  // a pile's count stands just over its top; the pot's hangs just in front of its spread
  const pileScreen = (k) => {
    const p = piles[k];
    if (k === 'pot') return project(p.anchor.position.clone().add(new THREE.Vector3(0, 0, p.front + 0.008)));
    return project(p.anchor.position.clone().add(new THREE.Vector3(0, p.height + 0.025, 0)));
  };
  // over the shoe and the bell
  const thingScreen = (name) =>
    name === 'shoe' ? project(shoe.position.clone().add(new THREE.Vector3(0, 0.12, 0))) :
    project(bell.position.clone().add(new THREE.Vector3(0, 0.08, 0)));

  return {
    deal,
    flip,
    muck,
    sweep,
    ringBell,
    hands,
    piles,
    handScreen,
    pileScreen,
    thingScreen,
    thump: () => shake(0.01),
    // sound: what the move sounds like (chips by default)
    fly: (from, to, n, sound = () => sfx('chips', { amount: n })) => {
      sound();
      return flyChips(stage, piles[from], piles[to], n);
    },
    shoe,
  };
}

// The game on the casino hall's table: stage is the game's own layer (see stage.js layer()),
// scene the hall it sits in ({ opp, casino }, from scenes.js).
export function mount(stage, { scene, createHud, table, k, director } = {}) {
  const { opp } = scene;
  let seat = null; // the table, once joined
  const world = buildRoom(stage, scene.casino);
  // what Clawd reaches for (card-0twvw1bk): live objects, read every frame
  const oppHand = new THREE.Object3D();
  oppHand.position.set(HANDS.opp.x + HANDS.opp.step * 0.5, TABLE_Y, HANDS.opp.z);
  stage.scene.add(oppHand);
  opp.setProps?.({ cards: oppHand, chips: world.piles.opp.anchor, pot: world.piles.pot.anchor, deck: world.shoe });
  reviewAvatar(opp); // avatar: ?avatar-review, every avatar state on buttons
  const hud = createHud(stage, opp, {
    game: 'blackjack',
    nudge: tr('ui.blackjack.nudge'),
    send: table ? (text) => seat.send('say', { text }) : director ? () => {} : null,
  });
  const { status, log, toast } = hud;

  // ---- HUD bits pinned in the room: hand totals and token counts (your moves: below) ----
  const tag = (cls) => {
    const el = document.createElement('div');
    el.className = cls;
    el.hidden = true;
    document.querySelector('.hud').append(el);
    return el;
  };
  const tags = { you: tag('handtag below hand you'), opp: tag('handtag under hand opp') };
  const counts = { you: tag('tokentag you'), opp: tag('tokentag opp'), pot: tag('tokentag pot') };
  stage.onFrame(function pin() {
    const floor = (document.querySelector('.bar')?.getBoundingClientRect().top ?? innerHeight) - 4;
    for (const w of ['you', 'opp']) {
      const p = world.handScreen(w);
      tags[w].style.left = `${p.x}px`;
      tags[w].style.top = `${w === 'you' ? Math.min(p.y, floor - tags[w].offsetHeight) : p.y}px`;
    }
    for (const w of ['you', 'opp', 'pot']) {
      const p = world.pileScreen(w);
      counts[w].style.left = `${p.x}px`;
      counts[w].style.top = `${p.y}px`;
    }
  });

  // What's on the table, as the room has played it out (not the latest view).
  const t = { cards: { you: [], opp: [] }, stake: { you: 0, opp: 0 }, bet: { you: 0, opp: 0 }, ante: 0, round: 0, stood: { you: false, opp: false }, shown: false };
  let panelUp = false; // your betting moves are up, in one panel over your tokens (below)
  function showTags() {
    for (const w of ['you', 'opp']) {
      const cards = t.cards[w];
      tags[w].hidden = !cards.length;
      if (!cards.length) continue;
      const known = cards.filter((c) => c && c !== '??');
      const tot = handTotal(known);
      const hidden = known.length < cards.length;
      // just the total: where the tag sits says whose hand it is
      const n = points(tot);
      const tag = hidden ? tr('ui.blackjack.tagShown', { n }) : tot.total > 21 ? tr('ui.blackjack.tagBust', { n: tot.total }) : String(n);
      tags[w].textContent = t.stood[w] ? tr('ui.blackjack.tagStood', { tag }) : tag;
      tags[w].classList.toggle('bust', !hidden && tot.total > 21);
    }
    for (const w of ['you', 'opp', 'pot']) {
      const n = world.piles[w].amount;
      // yours heads the move panel while that is up
      counts[w].hidden = w === 'pot' ? !n : w === 'you' && panelUp;
      // a seat's count says what it has bet this round, so a bet to answer is plain to see
      counts[w].textContent = w === 'pot' ? tr('ui.blackjack.pot', { n: tokens(n) }) : t.bet[w] ? tr('ui.blackjack.betTag', { n: tokens(n), bet: tokens(t.bet[w]) }) : tokens(n);
    }
  }

  if (!table && !director) {
    // a preview: one hand laid out so the table can be judged
    status(tr('ui.blackjack.preview'));
    world.piles.you.set(900_000);
    world.piles.opp.set(950_000);
    world.piles.pot.set(100_000);
    t.cards = { you: ['KH', '7S'], opp: ['9C', '??'] };
    world.deal('you', 'KH', { instant: true });
    world.deal('opp', '9C', { instant: true });
    world.deal('you', '7S', { instant: true, hole: true });
    world.deal('opp', null, { instant: true });
    showTags();
    return;
  }

  const name = (id) => seat.nameOf(id);
  const holeOf = (e, v, who) => {
    // your hole card: from the view if it's still this hand, or a later showdown
    if (who === 'opp') return null;
    if (v.round === e.round) return v.seats.find((s) => s.id === v.you).hand[1];
    const shown = v.log.find((x) => x.type === 'settle' && x.round === e.round && x.hands);
    return shown ? shown.hands[v.you][1] : null;
  };

  function sync(v) {
    world.sweep(true);
    const me = v.seats.find((s) => s.id === v.you);
    const them = v.seats.find((s) => s.id !== v.you);
    world.piles.you.set(me.stack);
    world.piles.opp.set(them.stack);
    world.piles.pot.set(v.pot);
    t.round = v.round;
    t.ante = v.ante ?? 0;
    t.stake = { you: me.stake, opp: them.stake };
    t.bet = { you: me.bet, opp: them.bet };
    t.stood = { you: me.stood, opp: them.stood };
    // after the last hand, a showdown's hands are in lastHand
    const reveal = v.phase === 'over' && v.lastHand?.round === v.round && v.lastHand.hands;
    t.cards = {
      you: me.hand.slice(),
      opp: reveal ? reveal[them.id].slice() : them.hand.slice(),
    };
    for (const w of ['you', 'opp']) t.cards[w].forEach((c, i) => world.deal(w, c === '??' ? null : c, { instant: true, hole: w === 'you' && i === 1 && !reveal }));
    showTags();
  }

  async function play(e, v) {
    const w = e.seat ? seat.side(e.seat) : null;
    cues?.cueBlackjack?.(opp, e, v);
    switch (e.type) {
      case 'hand_start': {
        await world.sweep();
        t.round = e.round;
        t.ante = e.ante;
        t.cards = { you: [], opp: [] };
        t.stood = { you: false, opp: false };
        showTags();
        sfx('shuffle');
        toast(tr('ui.blackjack.handToast', { round: e.round, ante: tokens(e.ante) }), 1600);
        log(tr('ui.blackjack.handLog', { round: e.round, ante: tokens(e.ante) }));
        await Promise.all([world.fly('you', 'pot', e.ante), world.fly('opp', 'pot', e.ante)]);
        t.stake = { you: e.ante, opp: e.ante };
        showTags();
        const order = [e.first, e.first === v.you ? seat.oppId() : v.you].map((id) => seat.side(id));
        for (let i = 0; i < 2; i++)
          for (const who of order) {
            const code = i === 0 ? e.up[who === 'you' ? v.you : seat.oppId()] : holeOf(e, v, who);
            t.cards[who].push(code ?? '??');
            await world.deal(who, code, { hole: who === 'you' && i === 1 });
            showTags();
          }
        break;
      }
      case 'hit': {
        t.cards[w].push(e.card);
        await world.deal(w, e.card);
        showTags();
        const tot = handTotal(t.cards[w].filter((c) => c !== '??')).total;
        log(tr('ui.blackjack.hitLog', { name: name(e.seat), rank: e.card.slice(0, -1) }));
        if (w === 'you' && tot > 21) {
          toast(tr('ui.blackjack.bustSecret'), 1600);
          sfx('bust', { who: 'you' });
        }
        break;
      }
      case 'stand':
        t.stood[w] = true;
        await world.ringBell();
        log(tr('ui.blackjack.standLog', { name: name(e.seat) }));
        showTags();
        break;
      case 'street':
        t.bet = { you: 0, opp: 0 };
        showTags();
        toast(tr(e.street === 'draw' ? 'ui.blackjack.drawToast' : 'ui.blackjack.lastToast'), 1400);
        break;
      case 'check':
        await world.ringBell();
        log(tr('ui.blackjack.checkLog', { name: name(e.seat) }));
        break;
      case 'bet':
      case 'raise':
      case 'allin': {
        const line = tr(`ui.blackjack.${e.type}Log`, { name: name(e.seat), amount: tokens(e.type === 'raise' ? e.to : e.amount) });
        if (w === 'opp') toast(line, 1600);
        await world.fly(w, 'pot', e.amount);
        t.stake[w] += e.amount;
        t.bet[w] += e.amount;
        log(line);
        showTags();
        break;
      }
      case 'call':
        await world.fly(w, 'pot', e.amount);
        t.stake[w] += e.amount;
        log(tr('ui.blackjack.callLog', { name: name(e.seat), amount: tokens(e.amount) }));
        showTags();
        break;
      case 'fold':
        sfx('fold');
        log(tr('ui.blackjack.folded', { name: name(e.seat) }));
        await world.muck(w);
        break;
      case 'settle': {
        const oppId = seat.oppId();
        if (e.how === 'showdown') {
          t.cards.opp = e.hands[oppId].slice();
          await world.flip('opp', 1, e.hands[oppId][1]);
          const yourHole = world.hands.you[1];
          if (yourHole) await world.flip('you', 1, e.hands[v.you][1]);
          showTags();
          for (const id of [v.you, oppId]) if (e.naturals[id]) sfx('natural');
          if (e.totals[oppId] > 21) sfx('bust', { who: 'opp' });
          await seat.wait(500);
        }
        const tot = (id) => (e.totals[id] > 21 ? tr('ui.blackjack.busted', { n: e.totals[id] }) : e.naturals[id] ? tr('ui.blackjack.natural') : e.totals[id]);
        const line = e.how === 'fold' ? tr('ui.blackjack.folded', { name: name(e.winner === v.you ? oppId : v.you) }) : tr('ui.blackjack.showdown', { you: tr('ui.common.you'), mine: tot(v.you), name: name(oppId), theirs: tot(oppId) });
        if (!e.winner) {
          toast(tr('ui.blackjack.settleToast', { line, result: tr('ui.blackjack.pushBack') }), 2000);
          await Promise.all([world.fly('pot', 'you', t.stake.you, () => sfx('push')), world.fly('pot', 'opp', t.stake.opp, () => {})]);
        } else {
          const mine = e.winner === v.you;
          toast(tr('ui.blackjack.settleToast', { line, result: tr('ui.blackjack.took', { name: mine ? tr('ui.common.you') : name(e.winner), pot: tokens(e.pot) }) }), 2200);
          await world.fly('pot', seat.side(e.winner), world.piles.pot.amount, () => sfx('sweep', { toYou: mine, pot: e.pot }));
        }
        log(tr('ui.blackjack.settleLog', { round: e.round, line, result: e.winner ? tr('ui.blackjack.took', { name: name(e.winner), pot: tokens(e.pot) }) : tr('ui.blackjack.push') }));
        // the server's count is the truth
        world.piles.you.set(e.stacks[v.you]);
        world.piles.opp.set(e.stacks[oppId]);
        world.piles.pot.set(0);
        t.stake = { you: 0, opp: 0 };
        t.bet = { you: 0, opp: 0 };
        showTags();
        await seat.wait(1800);
        break;
      }
      case 'quit':
        log(tr('ui.blackjack.quitLog', { name: name(e.seat) }));
        await Promise.all([world.fly('pot', 'you', t.stake.you), world.fly('pot', 'opp', t.stake.opp, () => {})]);
        t.stake = { you: 0, opp: 0 };
        showTags();
        break;
      case 'game_over': {
        const won = e.winner === v.you;
        sfx(!e.winner ? 'over' : won ? 'win' : 'lose');
        toast(!e.winner ? tr('ui.blackjack.draw') : won ? tr('ui.blackjack.youWon') : tr('ui.blackjack.wonToast', { name: name(e.winner) }), 2600);
        log(tr('ui.blackjack.overLog'));
        world.piles.you.set(e.stacks[v.you]);
        world.piles.opp.set(e.stacks[seat.oppId()]);
        showTags();
        break;
      }
    }
  }

  // ---- your moves, on the table: the shoe to hit, the bell to stand or check, your
  // tokens to bet, raise, call or go all in, your cards to fold. On the draw street the
  // shoe and the bell each carry a tag with its key; on a betting street every move is a
  // row in one panel over your tokens, headed by their count. ----
  const can = (a) => seat.yourTurn() && seat.state.v.legal.includes(a);
  const act = (action) => {
    if (!can(action)) return;
    hideMoves();
    stage.setHover(null);
    seat.act({ action });
  };
  const acts = sceneActs(stage, act);
  function hideMoves() {
    acts.hide();
    if (!panelUp) return;
    panelUp = false;
    counts.you.hidden = false;
  }
  // the moves made with your tokens
  const CHIPS = ['call', 'bet', 'raise', 'allin'];
  // the panel's rows, biggest first, then the ones that put nothing in
  const ROWS = ['allin', 'raise', 'bet', 'call', 'check', 'fold'];
  // What each of them puts in, from the view's price.
  const puts = (a) => {
    const p = seat.state.v.price;
    return tokens({ call: p.call, bet: p.pot, raise: p.call + p.pot, allin: p.allin }[a]);
  };
  const label = (a) => tr(`ui.blackjack.${a}`, CHIPS.includes(a) ? { n: puts(a) } : {});
  const tip = (a) => ({ title: label(a), text: tr(`ui.blackjack.tips.${a}`) });
  const KEY = { hit: 'H', stand: 'S', check: 'K', bet: 'B', raise: 'R', call: 'C', fold: 'F', allin: 'A' };
  const AT = { hit: () => world.thingScreen('shoe'), stand: () => world.thingScreen('bell') };
  function showMoves(v) {
    if (!seat.yourTurn() || !v.legal.length) return hideMoves();
    if (v.legal.some((a) => a === 'hit' || a === 'stand')) {
      hideMoves();
      return acts.show(v.legal.map((a) => ({ id: a, key: KEY[a], label: label(a), at: AT[a] })));
    }
    // the panel stands where your count did, slid left off the pot's count
    const head = counts.you.textContent;
    panelUp = true;
    counts.you.hidden = true;
    const pot = () => (counts.pot.hidden ? [] : [counts.pot.getBoundingClientRect()]);
    const rows = ROWS.filter((a) => v.legal.includes(a)).map((a) => ({ id: a, key: KEY[a], label: label(a) }));
    acts.show([{ id: 'moves', head, rows, at: () => world.pileScreen('you'), avoid: pot }]);
  }
  // your tokens: the pot bet (or raise) if there is one, else a call
  const chipMove = () => ['raise', 'bet', 'call', 'allin'].find(can);
  hud.interact(
    (thing) => {
      if (thing === 'shoe') return can('hit') ? tip('hit') : null;
      if (thing === 'bell') return can('stand') ? tip('stand') : can('check') ? tip('check') : null;
      if (thing === 'stack') return chipMove() ? tip(chipMove()) : null;
      if (thing === 'card:you:1') return { title: tr('ui.blackjack.tips.holeTitle'), text: tr('ui.blackjack.tips.hole'), color: HOLE };
      if (thing.startsWith('card:you') && can('fold')) return tip('fold');
      return null;
    },
    (thing) => {
      if (thing === 'shoe') act('hit');
      else if (thing === 'bell') act(can('check') ? 'check' : 'stand');
      else if (thing === 'stack' && chipMove()) act(chipMove());
      else if (thing.startsWith('card:you')) act('fold');
    },
  );

  function settle(v) {
    sealTag(v.commit);
    showTags();
    showMoves(v);
    mood(v);
    cues?.restBlackjack?.(opp, v);
    const oppId = seat.oppId();
    const them = name(oppId);
    if (v.phase === 'over') {
      const mine = v.seats.find((s) => s.id === v.you).stack;
      const theirs = v.seats.find((s) => s.id === oppId).stack;
      const outcome = !v.winner ? 'draw' : v.winner === v.you ? 'won' : 'lost';
      const reason = v.log.at(-1)?.reason;
      status(outcome === 'draw' ? tr('ui.blackjack.overDraw') : outcome === 'won' ? tr('ui.blackjack.overWon', { n: tokens(mine) }) : tr('ui.blackjack.overLost', { name: them, n: tokens(theirs) }));
      showEnding({
        v,
        outcome,
        opp: them,
        what: tr('ui.blackjack.sealed'),
        title: reason === 'quit' ? tr('ui.blackjack.titleQuit', { round: v.round, what: v.log.findLast((e) => e.type === 'quit')?.seat === v.you ? tr('ui.blackjack.youQuit') : tr('ui.blackjack.theyLeft', { name: them }) }) : reason === 'broke' ? tr('ui.blackjack.titleBroke', { round: v.round }) : tr('ui.blackjack.titleDone', { rounds: v.rounds }),
        big: outcome === 'draw' ? (reason === 'quit' ? tr('ui.blackjack.gameOver') : tr('ui.blackjack.draw')) : outcome === 'won' ? tr('ui.blackjack.youWon') : tr('ui.blackjack.theyWon', { name: them }),
        rows: [[tr('ui.common.you'), tokens(mine)], [them, tokens(theirs)]],
      });
      return;
    }
    const head = tr('ui.blackjack.head', { round: v.round, rounds: v.rounds });
    // the status line says which street the hand is on, all the way through it
    const STREET = { bet1: 'streetBet1', draw: 'streetDraw', bet2: 'streetBet2' };
    const where = v.street ? `${head} · ${tr(`ui.blackjack.${STREET[v.street]}`)}` : head;
    if (v.facing === v.you) status(tr('ui.blackjack.facing', { head: where, n: tokens(v.price.call) }), 'you');
    else if (v.turn === v.you) {
      const tot = handTotal(v.seats.find((s) => s.id === v.you).hand);
      status(tr('ui.blackjack.yourTurn', { head: where, n: points(tot) }), 'you');
    } else status(tr('ui.blackjack.thinking', { head: where, name: them }), 'opp');
  }

  seat = joinTable({ table, k, hud, opp, sync, play, settle, director: !!director });
  stage.onDispose(() => seat.close());
  // A director's script stands in for the server. Your move is made as a hand makes it:
  // the thing that does it lit under the pointer for a moment, then the move.
  const THING = { hit: 'shoe', stand: 'bell', check: 'bell', bet: 'stack', raise: 'stack', call: 'stack', allin: 'stack', fold: 'card:you:0' };
  if (director)
    import('./director/index.js').then((d) =>
      d.run(director, {
        game: 'blackjack',
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
          stage.setHover(THING[m.act]);
          await seat.wait(m.press ?? 450);
          hideMoves();
          stage.setHover(null);
        },
      }),
    );
}
