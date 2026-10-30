// The agent's body at the table: seats an avatar across from you and runs its state
// machine. A game says what is happening (opp.setState('aimYou')); the avatar decides
// how that looks. Any avatar module that follows docs/avatar.md plugs in here, and a
// state it does not draw falls back to a nearby one, then to a generic motion.
import * as THREE from 'three';
import { canvasTex, pixelText, pixelEmoji, drawBits, mat } from '../stage.js';

// How the agent can say it looks on a move or a line (moyu ... --mood), the same list
// the server takes (MOODS in server/table.mjs). Each one is a face an avatar draws.
export const MOODS = ['happy', 'smug', 'flat', 'angry', 'wide', 'sad', 'squint', 'shut', 'sleep'];

// Every state the game may ask for. Loops hold until the next loop replaces them; a
// one-shot plays over the current loop for `ms`, then the loop shows again.
export const STATES = {
  idle: { loop: true, desc: 'waiting, the other seat has the gun' },
  thinking: { loop: true, desc: 'its turn: deciding' },
  aimYou: { loop: true, desc: 'holding the gun on you' },
  aimSelf: { loop: true, desc: 'holding the gun on itself' },
  aimedAt: { loop: true, desc: 'you are aiming at it' },
  watching: { loop: true, desc: 'you are aiming at yourself' },
  won: { loop: true, desc: 'you are out of 额度' },
  lost: { loop: true, desc: 'it is out of 额度' },
  offline: { loop: true, desc: 'it left the table' },

  talking: { ms: 2400, layer: true, desc: 'a chat bubble is up (a layer: plays over anything) { text, mood }' },
  useItem: { ms: 1100, desc: 'uses one of its items { item }' },
  noticeItem: { ms: 1100, desc: 'you used an item { item }' },
  fire: { ms: 450, desc: 'pulls the trigger { live, target }' },
  hit: { ms: 1100, desc: 'lost 额度 { damage }' },
  refused: { ms: 1300, desc: '作为一个 AI 语言模型 ate the hit' },
  healed: { ms: 1100, desc: 'got 额度 back' },
  relief: { ms: 1200, desc: 'a blank went its way { by }' },
  scored: { ms: 1200, desc: 'its live shot hit you' },
  wince: { ms: 1100, desc: 'you shot yourself with a live one' },
  limited: { ms: 1500, desc: '429: it skips this turn' },
  emote: { ms: 1500, desc: 'sent an emoji { emoji }, or a mood after its move { mood }' },
  catch: { ms: 1100, desc: 'you threw an emoji at it { emoji }' },
  fakeItem: { ms: 1500, desc: 'its 幻觉 item was never there and vanished { item }' },
  noticeFake: { ms: 1300, desc: 'your 幻觉 item vanished { item }' },
  roundWon: { ms: 2600, desc: 'it took a round of the match { stage, wins }' },
  roundLost: { ms: 2600, desc: 'you took a round of the match { stage, wins }' },

  // small acts, in any game (and for a director's script to time)
  wave: { ms: 1400, desc: 'waves you over to sit down: a game opened, you sat down' },
  glance: { ms: 1200, desc: 'a quick side-look at something, then back { at: a world point, an Object3D, or a name: a prop, an anchor, camera }' },
  yawn: { ms: 1800, desc: 'a big yawn and a stretch: you have kept it waiting' },
  hideCard: { ms: 1300, desc: '21: covers its hole card with a nub after peeking, then a poker face' },
  cheer: { ms: 1600, desc: 'jumps with both nubs up: its biggest wins (a yacht, a natural, the match)' },

  // 21 (heads-up, no dealer)
  thinkHand: { loop: true, desc: '21: its turn, hit or stand' },
  thinkCall: { loop: true, desc: '21: you doubled, call or fold' },
  peekCard: { ms: 1300, desc: '21: looks at its own hole card' },
  drawCard: { ms: 900, desc: '21: takes a card { card }' },
  stand: { ms: 900, desc: '21: stands' },
  double: { ms: 1200, desc: '21: pushes chips in for a double' },
  call: { ms: 1100, desc: '21: calls your double' },
  fold: { ms: 1200, desc: '21: folds to your double' },
  noticeDouble: { ms: 1100, desc: '21: you doubled' },
  reveal: { ms: 900, desc: '21: turns its hole card over at the showdown' },
  bust: { ms: 1500, desc: '21: its hand is over 21 { public }' },
  natural: { ms: 1700, desc: '21: ace and a ten-card' },
  winPot: { ms: 1600, desc: '21: takes the pot { big }' },
  losePot: { ms: 1400, desc: '21: loses the pot { big }' },
  push: { ms: 1100, desc: '21: equal hands, stakes back' },

  // Yacht dice
  thinkKeep: { loop: true, desc: 'Yacht: its turn, which dice to keep' },
  thinkPad: { loop: true, desc: 'Yacht: no rolls left, which box to score' },
  rollDice: { ms: 1300, desc: 'Yacht: keeps some, shakes the cup, rolls { kept, rollNo, cup }' },
  scoreBox: { ms: 1200, desc: 'Yacht: writes a score { points, big, zero }' },
  yacht: { ms: 2200, desc: 'Yacht: five the same' },
  noticeDice: { ms: 1100, desc: 'Yacht: your roll or score { yacht, big, zero }' },
};

// Where a state goes when the avatar has no clip for it.
const FALLBACK = {
  thinking: 'idle', aimYou: 'aim', aimSelf: 'aim', aim: 'idle', aimedAt: 'scared', watching: 'idle', scared: 'idle',
  won: 'happy', lost: 'offline', offline: 'idle',
  useItem: 'nod', noticeItem: 'nod', healed: 'happy', scored: 'happy', relief: 'happy', emote: 'happy', catch: 'hit',
  wince: 'hit', refused: 'shake', limited: 'shake', fakeItem: 'shake', noticeFake: 'happy', roundWon: 'happy', roundLost: 'sad',
  thinkHand: 'thinking', thinkCall: 'thinking', thinkKeep: 'thinking', thinkPad: 'thinking',
  peekCard: 'nod', drawCard: 'nod', stand: 'nod', double: 'bet', call: 'bet', bet: 'nod', fold: 'sad', reveal: 'nod',
  noticeDouble: 'noticeItem', bust: 'hit', natural: 'happy', winPot: 'happy', losePot: 'sad', push: 'shake',
  rollDice: 'shake', scoreBox: 'nod', yacht: 'happy', noticeDice: 'noticeItem',
  wave: 'happy', cheer: 'happy', yawn: 'stretch', stretch: 'idle', hideCard: 'nod', glance: 'idle',
};

// Generic motion on the wrapper around the avatar's root, for avatars that draw little.
// k is a one-shot's progress (0..1), t the seconds since the state began.
const GENERIC = {
  idle: (m, { t }) => (m.squash = Math.sin(t * 1.6) * 0.012),
  aim: (m) => (m.lean = 0.08),
  scared: (m, { t }) => (m.x = Math.sin(t * 40) * 0.004),
  happy: (m, { k = 0, t }) => (m.y = Math.abs(Math.sin((k || t) * Math.PI * 2)) * 0.05),
  offline: (m) => ((m.y = -0.06), (m.lean = 0.25)),
  nod: (m, { k }) => (m.lean = Math.sin(k * Math.PI) * 0.2),
  shake: (m, { k }) => (m.turn = Math.sin(k * Math.PI * 6) * 0.25 * (1 - k)),
  hit: (m, { k }) => ((m.z = -Math.sin(Math.min(1, k * 3) * Math.PI) * 0.1), (m.lean = -Math.sin(k * Math.PI) * 0.25)),
  fire: (m, { k }) => (m.z = -Math.sin(k * Math.PI) * 0.04),
  sad: (m, { k = 1 }) => ((m.y = -0.03 * Math.min(1, k * 3)), (m.lean = 0.15 * Math.min(1, k * 3))),
  stretch: (m, { k }) => ((m.squash = Math.sin(k * Math.PI) * 0.08), (m.lean = -Math.sin(k * Math.PI) * 0.12)),
};

// Acts it starts by itself (autoActs): a yawn once a stretch of waiting on you runs this
// long, and now and then, while it thinks, a glance at the room's 'crt' prop if it has one.
const YAWN_AFTER = 45_000;
const GLANCE_CHANCE = 0.35;

// Where a game's table props sit when the room gives none: in front of the seat, in
// seat space (see setProps). y 0 here means the table top.
const PROP_DEFAULTS = {
  cards: [0, 0.01, 0.42],
  chips: [0.34, 0.02, 0.4],
  pot: [0, 0.02, 0.62],
  deck: [-0.36, 0.03, 0.5],
  tray: [0, 0.02, 0.64],
  pad: [-0.36, 0.01, 0.44],
};

function resolve(clips, name) {
  for (let n = name; n; n = FALLBACK[n]) {
    if (clips[n]) return { clip: clips[n], name: n };
    if (GENERIC[n]) return { generic: GENERIC[n], name: n };
  }
  return { generic: GENERIC.idle, name: 'idle' };
}

// The helpers an avatar's build() gets, so it draws in the room's pixel style. Built on
// call: stage.js imports this module, so its bindings are not ready at load time.
const kit = () => ({ THREE, mat, canvasTex, pixelText, pixelEmoji, drawBits });

export function createAvatar(stage, avatar, { at = new THREE.Vector3(0, 0, -0.7), tableY = 0.76, maxHp = 4, chair } = {}) {
  const { scene, onFrame, project } = stage;
  const seat = new THREE.Group(); // seat space: floor under the seat, +z toward you
  seat.position.copy(at);
  const motion = new THREE.Group(); // generic motion lives here, the avatar's own inside
  seat.add(motion);
  scene.add(seat);

  const rig = avatar.build({ ...kit(), seat: { tableY: tableY - at.y, chair } });
  motion.add(rig.root);
  rig.root.traverse((o) => o.isMesh && (o.castShadow = true));
  const clips = rig.clips ?? {};
  const durations = { ...Object.fromEntries(Object.entries(STATES).map(([n, s]) => [n, s.ms])), ...rig.durations };

  // anchors are in seat space; the game wants them in the world
  const world = (v) => seat.localToWorld(v.clone());
  seat.updateMatrixWorld(true);
  const a = rig.anchors;
  const anchors = {
    head: world(a.head),
    mouth: world(a.mouth ?? a.head),
    target: world(a.target ?? a.head),
    holdOut: world(a.holdOut),
    holdSelf: world(a.holdSelf),
    items: world(a.items ?? new THREE.Vector3(0.45, tableY - at.y, 0.42)),
    holdCup: world(a.holdCup ?? new THREE.Vector3(0, tableY - at.y + 0.3, 0.36)),
  };

  // Table props a game hands over (setProps): world Vector3s, or Object3Ds read live.
  let props = {};
  const tmpV = new THREE.Vector3();
  function propAt(name) {
    const p = props[name];
    if (p?.isObject3D) return p.getWorldPosition(new THREE.Vector3());
    if (p?.isVector3) return p.clone();
    const d = PROP_DEFAULTS[name];
    return d ? world(tmpV.set(d[0], d[1] + tableY - at.y, d[2])) : null;
  }

  // Where a glance goes: a world point, an Object3D, or a name: 'camera', an anchor, a prop.
  function pointAt(at) {
    if (at?.isVector3) return at.clone();
    if (at?.isObject3D) return at.getWorldPosition(new THREE.Vector3());
    if (at === 'camera') return stage.camera.getWorldPosition(new THREE.Vector3());
    if (anchors[at]) return anchors[at].clone();
    return propAt(at);
  }

  // ---- the state machine ----
  const now = () => performance.now();
  let base = { name: 'idle', detail: {}, t0: now() };
  let once = null; // { name, detail, t0, ms, resolve }
  let talkUntil = 0;
  let talkFrom = 0;
  let talkMood = null; // the face it holds while it says this line
  let hp = maxHp;

  function setState(name, detail = {}) {
    const def = STATES[name];
    if (!def) return Promise.reject(new Error(`no avatar state ${name}`));
    if (detail.hp !== undefined) hp = detail.hp;
    if (def.loop) {
      // an act it started by itself never holds up the game
      if (once?.detail.own && base.name !== name) {
        once.resolve();
        once = null;
      }
      if (base.name !== name || detail.force) base = { name, detail, t0: now() };
      else base.detail = detail;
      return Promise.resolve();
    }
    const ms = detail.ms ?? durations[name];
    if (def.layer) {
      // talk for about as long as the line takes to read, within the bubble's life
      const len = [...(detail.text ?? '')].length;
      const talkMs = detail.ms ?? Math.min(4000, 500 + len * 110);
      talkFrom = now();
      talkUntil = talkFrom + talkMs;
      talkMood = MOODS.includes(detail.mood) ? detail.mood : null;
      return new Promise((r) => setTimeout(r, talkMs));
    }
    once?.resolve();
    if (detail.mood && !MOODS.includes(detail.mood)) detail = { ...detail, mood: null };
    if (name === 'emote' && detail.emoji) floatEmoji(detail.emoji);
    return new Promise((resolve) => (once = { name, detail, t0: now(), ms, resolve }));
  }

  const ctxOf = (s, extra) => ({ state: s.name, detail: s.detail, t: (now() - s.t0) / 1000, hp, maxHp, ...extra });

  let last = now();
  onFrame((t, frameNow) => {
    const dt = Math.min(0.1, (frameNow - last) / 1000);
    last = frameNow;
    if (once && frameNow - once.t0 >= once.ms) {
      once.resolve();
      once = null;
    }
    const talking = frameNow < talkUntil ? Math.min(1, (frameNow - talkFrom) / 150, (talkUntil - frameNow) / 200) : 0;
    ownActs(frameNow);
    const shared = { dt, now: frameNow, time: t, talking, mood: talking ? talkMood : null, anchors, props, prop: propAt, point: pointAt };
    const m = { x: 0, y: 0, z: 0, lean: 0, turn: 0, squash: 0 };

    const run = (s, extra) => {
      const ctx = ctxOf(s, { ...shared, ...extra });
      const r = resolve(clips, s.name);
      ctx.as = r.name; // the state actually drawn, after fallbacks
      if (r.clip) r.clip(ctx);
      else r.generic(m, ctx);
    };
    // under: the loop is drawn beneath a one-shot that asked for it with ctx.base()
    const runBase = (under) => run(base, { loop: true, under });
    if (once) run(once, { k: Math.min(1, (frameNow - once.t0) / once.ms), base: () => runBase(true) });
    else runBase(false);
    rig.frame?.({ ...shared, state: once?.name ?? base.name, base: base.name, hp, maxHp });

    motion.position.set(m.x, m.y, m.z);
    motion.rotation.set(m.lean, m.turn, 0);
    motion.scale.set(1 - m.squash * 0.5, 1 + m.squash, 1 - m.squash * 0.5);
  });

  // its own acts, planned once for each stretch of a loop
  let planned = null;
  let plan = null;
  function ownActs(t) {
    if (planned !== base) {
      planned = base;
      const thinking = base.name === 'thinking' && props.crt;
      plan = {
        yawn: base.name === 'idle' ? base.t0 + YAWN_AFTER : Infinity,
        glance: thinking && Math.random() < GLANCE_CHANCE ? base.t0 + 1500 + Math.random() * 2500 : Infinity,
      };
    }
    if (!api.autoActs || once || t < talkUntil) return;
    if (t >= plan.yawn) {
      plan.yawn = Infinity;
      setState('yawn', { own: true });
    } else if (t >= plan.glance) {
      plan.glance = Infinity;
      setState('glance', { at: 'crt', own: true });
    }
  }

  // emoji float up from the head
  const floating = new Set();
  function floatEmoji(emoji) {
    const tex = new THREE.CanvasTexture(pixelEmoji(emoji));
    tex.magFilter = tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, fog: false }));
    s.scale.set(0.16, 0.16, 1);
    s.position.copy(anchors.head);
    scene.add(s);
    floating.add({ s, t0: now(), base: s.position.clone() });
  }
  onFrame((t, frameNow) => {
    for (const f of floating) {
      const k = (frameNow - f.t0) / 1600;
      f.s.position.copy(f.base).add(new THREE.Vector3(0, k * 0.18, 0));
      f.s.material.opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      if (k >= 1) {
        scene.remove(f.s);
        floating.delete(f);
      }
    }
  });

  const api = {
    id: avatar.id,
    name: avatar.name,
    // how it sounds: a preset name from VOICES in web/play/audio.js, or fields to override
    voice: avatar.voice,
    // the voice calls this at each blip's onset ({ i, at, dur, loud, last }, ms): the
    // talking layer lasts the line's real length, and a mouth can flap to it
    blip(b) {
      const t = now();
      if (t >= talkUntil) talkFrom = t;
      talkUntil = b.last ? t + b.dur + 200 : Math.max(talkUntil, t + b.dur + 400);
      rig.blip?.(b);
    },
    group: seat,
    anchors,
    setState,
    // the game's table props, by name: cards, chips, pot, deck, tray, pad, cup
    setProps(p) {
      props = { ...props, ...p };
    },
    get props() {
      return props;
    },
    propAt, // a prop's world position, or its default
    pointAt, // a glance's at, as a world point
    // false: no acts of its own (the yawn, the glances, the games' waves and card-hiding),
    // for a director that times everything itself
    autoActs: true,
    get state() {
      return once?.name ?? base.name;
    },
    get base() {
      return base.name;
    },
    // the older calls games and the HUD already make
    emote: (emoji) => setState('emote', { emoji }),
    flinch: () => setState('hit'),
    headScreen: () => project(anchors.head),
    mouthScreen: () => project(anchors.mouth),
  };
  return api;
}
