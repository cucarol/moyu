// Clawd, the Claude Code mascot, as the agent's default avatar: a block of terracotta
// with two slit eyes, stubby arms that stretch to reach things, and four short legs,
// standing on a stack of old servers so it can see over the table. The face is a
// 24x15 pixel texture, one texel per body cell, so every expression is pixel art.
// Follows the avatar format in docs/avatar.md.

import { t as tr } from '../i18n.js';

const U = 0.024; // one body cell
const W = 24 * U;
const H = 15 * U;
const D = 10 * U;
const LEG = 4 * U;
const STAND = 0.904; // top of the server stack
const BODY_Y = STAND + LEG;
const MID = BODY_Y + H / 2;

const SKIN = 0xd77757;
const GREY = 0x8c8682;
const EYE = '#0a0a10';
const SWEAT = '#8fd8ff';
const BLUSH = '#ff9f9f';
const THROAT = '#5a0a14';
// the mouth while it talks, by how open: [width, height] in face cells
const MOUTHS = { 1: [4, 1], 2: [4, 2], 3: [6, 3], 4: [10, 3] };

// Eye bitmaps for the left eye (on your left); the right one is mirrored. 'X' is the
// eye colour, centred on the eye's spot.
const EYES = {
  open: ['XX', 'XX', 'XX', 'XX'],
  blink: ['XX'],
  squint: ['XX', 'XX'],
  shut: ['XXX', 'X.X'],
  happy: ['.XX.', 'X..X'],
  wide: ['XXX', 'XXX', 'XXX', 'XXX', 'XXX'],
  hurt: ['X..', '.X.', '..X', '.X.', 'X..'],
  dead: ['X.X', '.X.', 'X.X'],
  smug: ['...', 'XXX', 'XXX'],
  flat: ['XXX'],
  angry: ['X..', 'XX.', 'XXX', 'XXX'],
  sad: ['..X', '.XX', 'XXX', 'XXX'],
  spiral: ['XXXX', 'X...', 'X.XX', 'X..X', 'XXXX'],
  sleep: ['...', 'XXX'],
  off: [],
};
const EYE_AT = [[7, 5], [16, 5]]; // centre cells of the two eyes, from the top left

// the thinking spinner: an asterisk that grows and turns, after Claude Code's own
const SPIN = [[0, '+'], [1, '+'], [2, '*'], [3, '*'], [2, 'x'], [1, '*']];

// what an emoji does to the face, for emotes it sends and ones thrown at it
const EMOJI_FACE = {
  '😂': 'happy', '🤣': 'happy', '😆': 'happy', '😄': 'happy', '😊': 'happy', '🐟': 'happy', '👍': 'happy', '❤️': 'happy', '😎': 'smug',
  '😏': 'smug', '😒': 'flat', '🙄': 'flat', '😤': 'angry', '😠': 'angry', '😡': 'angry', '😱': 'wide', '😨': 'wide', '😮': 'wide',
  '😭': 'sad', '😢': 'sad', '🥲': 'sad', '🙏': 'shut', '🤔': 'squint', '😴': 'sleep', '🔥': 'wide', '💀': 'dead', '🤖': 'flat',
};
// what it sends back in its face when you throw one at it (the mock's answers, as faces)
// 🤔 it ponders back, 😭 it can't help a smug look, 😤 it's taken aback, 🔥 it lights
// up, 💀 it plays dead a moment, 🤖 it goes rigid and beeps like the robot it isn't
const CATCH_FACE = { '😂': 'angry', '😱': 'smug', '🙏': 'shut', '😏': 'flat', '👍': 'happy', '🐟': 'happy', '🤔': 'squint', '😭': 'smug', '😤': 'wide', '🔥': 'wide', '💀': 'dead', '🤖': 'flat' };
const CATCH_MOVES = new Set(['🤔', '😭', '😤', '🔥', '💀', '🤖']); // these move as the face's mood does

// A tall deck chair: a teak X-frame, a striped canvas sling at seat height, the canvas
// back raked behind, two flat arms. The seat sits at y; the chair faces +z.
function deckChair({ THREE, mat, canvasTex }, y) {
  const g = new THREE.Group();
  const teak = mat({ color: 0x9a6a40 });
  // narrow navy and cream stripes, a thin mustard one between: a deck chair, not a flag
  const stripes = canvasTex(24, 16, (ctx) => {
    for (let x = 0; x < 24; x++) {
      const k = x % 6;
      ctx.fillStyle = k < 2 ? '#2c3e6a' : k === 3 ? '#d8a840' : '#ece4d4';
      ctx.fillRect(x, 0, 1, 16);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    for (let y = 0; y < 16; y += 4) ctx.fillRect(0, y, 8, 1);
  });
  const canvas = mat({ map: stripes, side: THREE.DoubleSide });
  const W = 0.66;
  // the sling seat, sagging a touch, and the raked back
  const seat = new THREE.Mesh(new THREE.BoxGeometry(W - 0.06, 0.02, 0.42), canvas);
  seat.position.set(0, y - 0.01, 0);
  const back = new THREE.Mesh(new THREE.BoxGeometry(W - 0.06, 0.5, 0.02), canvas);
  back.position.set(0, y + 0.23, -0.26);
  back.rotation.x = -0.32;
  g.add(seat, back);
  // the frame: rails along both sides of the seat and up the back, an X under each side
  for (const s of [-1, 1]) {
    const x = (s * W) / 2;
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.5), teak);
    rail.position.set(x, y, 0);
    const up = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.7, 0.035), teak);
    up.position.set(x, y + 0.3, -0.28);
    up.rotation.x = -0.32;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.025, 0.34), teak);
    arm.position.set(x, y + 0.2, -0.04);
    g.add(rail, up, arm);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.03), teak);
    post.position.set(x, y + 0.1, 0.11);
    g.add(post);
    for (const d of [-1, 1]) {
      const len = Math.hypot(y, 0.46);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.035, len, 0.035), teak);
      leg.position.set(x, y / 2, 0);
      leg.rotation.x = d * Math.atan2(0.46, y);
      g.add(leg);
    }
  }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(W, 0.03, 0.03), teak);
  bar.position.set(0, y * 0.5, 0);
  g.add(bar);
  return g;
}

export default {
  id: 'clawd',
  name: 'Clawd',
  voice: 'clawd',
  build(kit) {
    const { THREE, mat, pixelText } = kit;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const root = new THREE.Group();

    // ---- the stack it stands on: four 2U servers, a little askew ----
    const leds = [];
    const chassis = mat({ color: 0x161c1a });
    const bezel = kit.canvasTex(28, 10, (ctx, w, h) => {
      ctx.fillStyle = '#1d2422';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#0a0d0c';
      for (let x = 2; x < 18; x += 2) for (let y = 2; y < h - 2; y += 2) ctx.fillRect(x, y, 1, 1);
      ctx.fillStyle = '#2c3532';
      ctx.fillRect(21, 3, 5, 4);
    });
    const slab = STAND / 4;
    const lounger = kit.seat?.chair === 'lounger';
    for (let i = 0; i < (lounger ? 0 : 4); i++) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.56, slab - 0.004, 0.44), [chassis, chassis, chassis, chassis, mat({ map: bezel }), chassis]);
      box.position.set((i % 2 ? 1 : -1) * 0.012 * i, slab * (i + 0.5), (i % 3) * 0.01);
      box.rotation.y = [0.03, -0.05, 0.02, -0.02][i];
      box.receiveShadow = true;
      root.add(box);
      for (let j = 0; j < 2; j++) {
        const m = new THREE.MeshBasicMaterial({ color: 0x7dffc8 });
        const led = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.012, 0.004), m);
        led.position.set(0.16 + j * 0.03, 0, 0.222);
        box.add(led);
        leds.push({ m, rate: 1 + i * 1.7 + j * 2.3, base: j ? 0xffb347 : 0x7dffc8 });
      }
    }

    // ---- Clawd ----
    const clawd = new THREE.Group(); // hops, steps, turns and tips over, about where it stands
    clawd.position.y = STAND;
    root.add(clawd);
    // On the top deck it sits upright in a tall striped deck chair instead, the seat where
    // the stack's top was, so its face stays where it is.
    if (lounger) root.add(deckChair(kit, STAND));
    const body = new THREE.Group(); // leans and squashes about its bottom
    body.position.y = LEG;
    clawd.add(body);

    const canvas = document.createElement('canvas');
    canvas.width = 24;
    canvas.height = 15;
    const fctx = canvas.getContext('2d');
    const faceTex = new THREE.CanvasTexture(canvas);
    faceTex.magFilter = faceTex.minFilter = THREE.NearestFilter;
    faceTex.generateMipmaps = false;
    faceTex.colorSpace = THREE.SRGBColorSpace;
    // A faint glow of its own, so it reads in any room's light; the face glows through
    // its own texture, so the eyes stay dark.
    const skin = new THREE.Color(SKIN);
    const RESTING = 0.28;
    const skinMat = mat({ color: SKIN, emissive: skin.clone().multiplyScalar(RESTING) });
    const faceMat = mat({ map: faceTex, emissiveMap: faceTex, emissive: new THREE.Color(RESTING, RESTING, RESTING) });
    const geo = new THREE.BoxGeometry(W, H, D);
    geo.translate(0, H / 2, 0);
    const torso = new THREE.Mesh(geo, [skinMat, skinMat, skinMat, skinMat, faceMat, skinMat]);
    body.add(torso);

    const armGeo = new THREE.BoxGeometry(1, 1, 1);
    armGeo.translate(0, 0, 0.5);
    const arms = [-1, 1].map((s) => {
      const pivot = new THREE.Group();
      pivot.position.set(s * (W / 2 - U), 6 * U, 0);
      const mesh = new THREE.Mesh(armGeo, skinMat);
      pivot.add(mesh);
      body.add(pivot);
      return { s, pivot, mesh, dir: V(s, -0.25, 0).normalize(), len: 4 * U };
    });

    const legGeo = new THREE.BoxGeometry(2 * U, LEG, 3 * U);
    const legs = [-9, -5, 5, 9].map((c) => {
      const m = new THREE.Mesh(legGeo, skinMat);
      m.position.set(c * U, LEG / 2, 0);
      clawd.add(m);
      return m;
    });

    // ---- the face ----
    let faceKey = '';
    function drawFace(f, skinHex) {
      const key = `${f.eyes}|${f.lx}|${f.ly}|${f.sweat}|${f.blush}|${f.tear}|${f.mouth}|${skinHex}`;
      if (key === faceKey) return;
      faceKey = key;
      fctx.fillStyle = `#${skinHex}`;
      fctx.fillRect(0, 0, 24, 15);
      const bits = EYES[f.eyes] ?? EYES.open;
      const h = bits.length;
      const w = h ? bits[0].length : 0;
      EYE_AT.forEach(([cx, cy], i) => {
        const rows = i ? bits.map((r) => [...r].reverse().join('')) : bits;
        const x0 = cx - Math.floor(w / 2) + (i ? 1 - (w % 2) : 0) + f.lx;
        const y0 = cy - Math.floor(h / 2) + f.ly;
        fctx.fillStyle = EYE;
        rows.forEach((r, j) => [...r].forEach((ch, k) => ch === 'X' && fctx.fillRect(x0 + k, y0 + j, 1, 1)));
        if (f.blush) {
          fctx.fillStyle = BLUSH;
          fctx.fillRect(cx - 1 + (i ? 1 : -1), cy + 3, 2, 1);
        }
        if (f.tear) {
          fctx.fillStyle = SWEAT;
          fctx.fillRect(cx + (i ? 1 : -1), cy + 3, 1, 2);
        }
      });
      // No mouth at rest, like the mascot; it only opens while it talks, and a loud
      // blip opens it wider than a mouth should go.
      if (f.mouth) {
        const [w, h] = MOUTHS[f.mouth];
        const x0 = 12 - w / 2;
        fctx.fillStyle = EYE;
        fctx.fillRect(x0, 10, w, h);
        if (h > 2) {
          fctx.fillStyle = THROAT;
          fctx.fillRect(x0 + 1, 11, w - 2, h - 2);
        }
      }
      if (f.sweat) {
        fctx.fillStyle = SWEAT;
        fctx.fillRect(21, 1, 1, 1);
        fctx.fillRect(20, 2, 3, 2);
      }
      faceTex.needsUpdate = true;
    }

    // ---- bits that float around it ----
    const spinCanvas = document.createElement('canvas');
    spinCanvas.width = spinCanvas.height = 9;
    const sctx = spinCanvas.getContext('2d');
    const spinTex = new THREE.CanvasTexture(spinCanvas);
    spinTex.magFilter = spinTex.minFilter = THREE.NearestFilter;
    spinTex.colorSpace = THREE.SRGBColorSpace;
    const spinner = new THREE.Sprite(new THREE.SpriteMaterial({ map: spinTex, transparent: true, fog: false }));
    spinner.scale.setScalar(0.1);
    spinner.position.set(0, BODY_Y + H + 0.1, 0.06);
    spinner.visible = false;
    root.add(spinner);
    let spinFrame = -1;
    function drawSpin(i) {
      if (i === spinFrame) return;
      spinFrame = i;
      const [len, kind] = SPIN[i];
      sctx.clearRect(0, 0, 9, 9);
      sctx.fillStyle = '#ff9a6c';
      sctx.fillRect(4, 4, 1, 1);
      const dirs = { '+': [[1, 0], [-1, 0], [0, 1], [0, -1]], x: [[1, 1], [-1, -1], [1, -1], [-1, 1]] };
      const use = kind === '*' ? [...dirs['+'], ...dirs.x] : dirs[kind];
      for (const [dx, dy] of use) for (let s = 1; s <= len; s++) sctx.fillRect(4 + dx * s, 4 + dy * s, 1, 1);
      spinTex.needsUpdate = true;
    }

    const bits = new Set(); // particles and labels: { obj, v, life, t, fade, grav }
    const cube = new THREE.BoxGeometry(0.018, 0.018, 0.018);
    function puff(kind, at, n = 6) {
      for (let i = 0; i < n; i++) {
        const color = { spark: Math.random() < 0.5 ? 0xfff0d0 : 0xff8a5c, gold: Math.random() < 0.5 ? 0xffe27a : 0xfff6d0, steam: 0xd8e8e4, smoke: 0x2a2826, ghost: SKIN }[kind];
        const flies = kind === 'spark' || kind === 'gold';
        const m = new THREE.Mesh(cube, new THREE.MeshBasicMaterial({ color, transparent: true }));
        m.position.copy(at);
        const r = () => Math.random() - 0.5;
        const v = flies ? V(r() * 1.6, Math.random() * 1.2, 0.3 + Math.random()) : V(r() * 0.1, 0.15 + Math.random() * 0.15, r() * 0.1);
        root.add(m);
        bits.add({ obj: m, v, life: flies ? 0.6 : 1.4, t: 0, grav: flies ? 3 : 0 });
      }
    }
    function label(text, color, at, { life = 1.2, rise = 0.12, size = 0.006 } = {}) {
      const c = pixelText(text, { color });
      const tex = new THREE.CanvasTexture(c);
      tex.magFilter = tex.minFilter = THREE.NearestFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, fog: false }));
      s.scale.set(c.width * size, c.height * size, 1);
      s.position.copy(at);
      root.add(s);
      bits.add({ obj: s, v: V(0, rise / life, 0), life, t: 0, grav: 0 });
    }
    // effects that fire once per state change: keyed by the state's detail object
    const fired = new WeakMap();
    function once(c, key, fn) {
      if (!fired.has(c.detail)) fired.set(c.detail, new Set());
      const done = fired.get(c.detail);
      if (!done.has(key)) {
        done.add(key);
        fn();
      }
    }

    // ---- poses: each clip fills in P for this frame; frame() eases toward it ----
    let P;
    const restArm = (s) => ({ dir: [s, -0.2, 0], len: 4 * U });
    function reset() {
      P = {
        x: 0, y: 0, z: 0, lean: 0, tilt: 0, turn: 0, squash: 0,
        arms: [restArm(-1), restArm(1)],
        legs: [0, 0, 0, 0],
        eyes: 'open', lx: 0, ly: 0, sweat: false, blush: false, tear: false, blink: true,
        glow: null, grey: 0, spinner: false, tremble: 0, still: false, mouth: 0,
      };
    }
    const wave = (k) => Math.sin(Math.min(1, Math.max(0, k)) * Math.PI);
    const breathe = (c, rate = 1.6) => (P.squash += Math.sin(c.time * rate) * 0.015);
    const hop = (k, h = 0.06) => (P.y += wave(k) * h);
    const arm = (i, x, y, z, len) => (P.arms[i] = { dir: [x, y, z], len });
    const reach = (i, world) => (P.arms[i] = { to: world });
    // two points on the gun to hold; a gun can name its own in userData.grips
    function grips(gun, fallback) {
      if (!gun) return [fallback.clone().add(V(-0.06, -0.04, 0)), fallback.clone().add(V(0.02, -0.03, 0.1))];
      const g = gun.userData.grips ?? { rear: V(0, -0.05, -0.06), front: V(0, -0.016, 0.18) };
      return [gun.localToWorld(g.rear.clone()), gun.localToWorld(g.front.clone())];
    }
    // the two points to hold any other prop by: its userData.grips, else its middle
    function holds(obj) {
      const g = Object.values(obj.userData.grips ?? {});
      if (!g.length) return [obj.getWorldPosition(V(0, 0, 0)), obj.getWorldPosition(V(0, 0, 0))];
      return [obj.localToWorld(g[0].clone()), obj.localToWorld((g[1] ?? g[0]).clone())];
    }
    const above = (v, y = 0.04, x = 0, z = 0) => v.clone().add(V(x, y, z));
    // from one point to another over a stretch of a one-shot: a hand sliding something
    const slide = (from, to, k) => from.clone().lerp(to, Math.min(1, Math.max(0, k)));

    // how it carries each mood after a move (happy and sad share the emoji's)
    const MOOD_MOVES = {
      smug: (k) => ((P.tilt = -0.14 * wave(k * 1.4)), (P.lean = -0.08 * wave(k)), (P.lx = 1)),
      flat: () => ((P.blink = false), (P.still = true)), // not one thing moves
      angry: (k) => ((P.squash = -0.1 * wave(k * 3)), (P.tremble = 0.002 * (1 - k))),
      wide: (k) => ((P.z = -0.04 * wave(k)), (P.squash = 0.12 * wave(k * 2.5)), (P.blink = false)),
      sad: (k) => ((P.lean = 0.12 * wave(k)), (P.y -= 0.015 * wave(k)), arm(0, -1, -0.8, 0, 3 * U), arm(1, 1, -0.8, 0, 3 * U)),
      squint: (k) => ((P.lean = 0.14 * wave(k)), (P.lx = Math.sin(k * Math.PI * 3) > 0 ? 1 : -1)),
      shut: (k) => (P.lean = wave(k) * 0.3),
      sleep: (k, c) => ((P.lean = 0.1 * wave(k)), (P.squash = -0.06 + Math.sin(c.time * 2) * 0.02), once(c, 'z', () => label('z', '#8a9894', V(0.22, BODY_Y + H, 0.1), { life: 1.6, rise: 0.15 }))),
    };

    const clips = {
      idle(c) {
        breathe(c);
        // glance about now and then
        const g = Math.sin(c.time * 0.37) * Math.sin(c.time * 0.13 + 1);
        P.lx = g > 0.55 ? 1 : g < -0.55 ? -1 : 0;
        if (Math.sin(c.time * 0.7) > 0.93) P.legs[Math.floor(c.time) % 4] = 0.012;
        if (c.hp <= 1) {
          P.sweat = true;
          P.tremble = 0.0015;
        }
      },
      thinking(c) {
        breathe(c, 1.1);
        P.eyes = 'open';
        P.lx = 1;
        P.ly = -1;
        P.spinner = true;
        P.tilt = 0.05;
        arm(1, -0.5, 0.45, 1, 0.2); // a nub to its chin
        P.legs[0] = Math.sin(c.time * 9) > 0.3 ? 0.014 : 0; // tapping a foot
        if (c.hp <= 1) P.sweat = true;
      },
      aimYou(c) {
        breathe(c);
        P.eyes = 'squint';
        P.lean = 0.06;
        const [rear, front] = grips(c.detail.gun, c.anchors.holdOut);
        reach(1, rear);
        reach(0, front);
      },
      aimSelf(c) {
        P.eyes = 'shut';
        P.sweat = true;
        P.tremble = 0.003;
        P.tilt = 0.08;
        const [rear] = grips(c.detail.gun, c.anchors.holdSelf);
        reach(1, rear);
        arm(0, -0.7, 0.6 + Math.sin(c.time * 20) * 0.1, 0.4, 0.09);
      },
      aimedAt(c) {
        P.eyes = 'wide';
        P.sweat = true;
        P.tremble = 0.0025;
        P.squash = -0.03;
        arm(0, -0.45, 1, 0.1, 0.26); // hands up
        arm(1, 0.45, 1, 0.1, 0.26);
      },
      watching(c) {
        breathe(c);
        P.eyes = 'wide';
        P.lean = 0.12;
        arm(0, 0.7, 0.3, 1, 0.26); // nubs over its mouth
        arm(1, -0.7, 0.3, 1, 0.26);
      },
      won(c) {
        const b = Math.abs(Math.sin(c.time * 5));
        P.y = b * 0.05;
        P.squash = b < 0.2 ? -0.06 : 0.02;
        P.eyes = 'happy';
        P.blush = true;
        arm(0, -0.5, 1, 0, 0.2 + Math.max(0, Math.sin(c.time * 5)) * 0.08);
        arm(1, 0.5, 1, 0, 0.2 + Math.max(0, -Math.sin(c.time * 5)) * 0.08);
        P.legs = [0, 1, 2, 3].map((i) => (Math.sin(c.time * 10 + i * 1.6) > 0 ? 0.012 : 0));
      },
      lost(c) {
        const k = Math.min(1, c.t / 0.7);
        P.tilt = -0.3 * (1 - Math.pow(1 - k, 3));
        P.lean = -0.12 * k;
        P.squash = -0.08 * k;
        P.eyes = 'dead';
        P.grey = Math.min(0.6, c.t / 2.5);
        P.blink = false;
        P.still = true;
        arm(0, -1, -0.9, 0, 0.06);
        arm(1, 1, -0.9, 0, 0.06);
        if (Math.random() < 0.04) puff('smoke', V(0.1, BODY_Y + H, 0.05), 1);
      },
      offline(c) {
        P.grey = Math.min(1, c.t / 1.2);
        P.eyes = 'sleep';
        P.lean = 0.14 * Math.min(1, c.t);
        P.squash = -0.05;
        P.blink = false;
        P.still = true;
        arm(0, -1, -1, 0, 0.05);
        arm(1, 1, -1, 0, 0.05);
        if (Math.sin(c.time * 1.3) > 0.995) label('z', '#8a9894', V(0.22, BODY_Y + H, 0.1), { life: 1.6, rise: 0.15 });
      },

      useItem(c) {
        const { k } = c;
        const item = c.detail.item;
        breathe(c);
        hop(k / 0.3, 0.04);
        if (k > 0.08 && k < 0.6) reach(1, c.detail.at ?? c.anchors.items);
        P.ly = k < 0.5 ? 1 : 0;
        P.lx = k < 0.5 ? 1 : 0;
        if (k < 0.4) return;
        const after = (k - 0.4) / 0.6;
        if (item === 'cot') ((P.eyes = 'open'), (P.ly = -1), (P.lx = 1), (P.spinner = true));
        else if (item === 'compact') ((P.squash = -0.35 * wave(after)), (P.eyes = 'shut'));
        else if (item === 'inject') ((P.eyes = 'smug'), (P.glow = Math.sin(c.time * 40) > 0 ? [0.5, 0.05, 0.4] : null));
        else if (item === 'temp') {
          P.eyes = 'angry';
          P.glow = [0.7 * wave(after), 0.08 * wave(after), 0];
          once(c, 'steam', () => puff('steam', V(0, BODY_Y + H, 0), 8));
        } else if (item === 'limit') P.eyes = 'smug';
        else if (item === 'cache') ((P.eyes = 'happy'), (P.glow = [0, 0.4 * wave(after), 0.1 * wave(after)]));
        else if (item === 'jailbreak') ((P.eyes = 'smug'), (P.glow = Math.sin(c.time * 30) > 0 ? [0.55, 0.1, 0.45] : null));
        else if (item === 'mirage') {
          // conjuring: eyes in spirals, a violet shimmer, a little sway side to side
          P.eyes = after < 0.6 ? 'spiral' : 'happy';
          P.glow = [0.35 * wave(after), 0.1 * wave(after), 0.5 * wave(after)];
          P.x = Math.sin(after * Math.PI * 6) * 0.01;
        } else P.eyes = 'happy';
      },
      noticeItem(c) {
        const { k } = c;
        breathe(c);
        P.lx = -1;
        P.ly = 1;
        if (k < 0.45) return;
        P.lx = 0;
        P.ly = 0;
        const face = { inject: 'wide', temp: 'wide', limit: 'angry', cot: 'squint', compact: 'wide', cache: 'flat', jailbreak: 'angry', mirage: 'squint' }[c.detail.item];
        P.eyes = face ?? 'open';
        if (c.detail.item === 'temp' || c.detail.item === 'inject') P.sweat = true;
      },
      // its own 幻觉 item was never there: reaches, finds nothing, an embarrassed blink
      fakeItem(c) {
        const { k } = c;
        breathe(c);
        if (k < 0.35) {
          reach(1, c.detail.at ?? c.anchors.items);
          P.ly = 1;
          P.lx = 1;
          return;
        }
        P.eyes = k < 0.6 ? 'spiral' : 'flat';
        P.sweat = true;
        P.blush = k > 0.6;
        P.turn = k < 0.6 ? Math.sin(k * Math.PI * 10) * 0.08 : 0;
        P.glow = Math.sin(c.time * 50) > 0.6 && k < 0.6 ? [0.4, 0.1, 0.5] : null;
        arm(1, 0.6, 0.2, 0.6, 0.18); // a nub scratching its side
      },
      // yours vanished: it can't help a little laugh
      noticeFake(c) {
        const { k } = c;
        breathe(c);
        P.lx = -1;
        P.ly = 1;
        if (k < 0.3) return;
        P.lx = 0;
        P.ly = 0;
        P.eyes = 'happy';
        P.y = Math.abs(Math.sin(k * Math.PI * 6)) * 0.02 * (1 - k);
        arm(0, 0.7, 0.3, 1, 0.26 * Math.min(1, (k - 0.3) * 4)); // a nub over its mouth
      },
      // a round of the match to it: a hop and a small cheer, short of the match's
      roundWon(c) {
        const { k } = c;
        hop(k / 0.35, 0.06);
        P.eyes = k < 0.6 ? 'happy' : 'smug';
        P.blush = true;
        arm(0, -0.5, 1, 0, 0.2 * Math.min(1, k * 4));
        arm(1, 0.5, 1, 0, 0.2 * Math.min(1, k * 4));
      },
      // a round to you: it slumps, then shakes it off and squares up for the next
      roundLost(c) {
        const { k } = c;
        if (k < 0.55) {
          P.eyes = 'hurt';
          P.squash = -0.08 * wave(k / 0.55);
          P.lean = -0.1 * wave(k / 0.55);
          arm(0, -1, -0.9, 0, 0.05);
          arm(1, 1, -0.9, 0, 0.05);
          return;
        }
        P.eyes = 'angry';
        P.turn = Math.sin((k - 0.55) * Math.PI * 8) * 0.1 * (1 - k);
        arm(0, -0.6, 0.4, 0.6, 0.14);
        arm(1, 0.6, 0.4, 0.6, 0.14);
      },
      fire(c) {
        c.base();
        P.z -= wave(c.k) * 0.035;
        P.eyes = c.k < 0.7 ? 'shut' : P.eyes;
        if (c.detail.live) P.squash -= wave(c.k) * 0.05;
      },
      hit(c) {
        const { k } = c;
        const big = (c.detail.damage ?? 1) > 1 ? 1.6 : 1;
        once(c, 'sparks', () => puff('spark', V(0, MID, D / 2), Math.round(8 * big)));
        P.eyes = 'hurt';
        P.z = -wave(Math.min(1, k * 2.5)) * 0.08 * big;
        P.lean = -wave(k) * 0.3 * big;
        P.x = (Math.random() - 0.5) * 0.02 * (1 - k);
        P.glow = k < 0.12 ? [1, 1, 1] : [0.8 * (1 - k), 0, 0];
        P.blink = false;
        arm(0, -1, 0.6, 0.3, 0.09);
        arm(1, 1, 0.6, 0.3, 0.09);
      },
      refused(c) {
        const { k } = c;
        P.eyes = k < 0.25 ? 'wide' : 'smug';
        P.glow = k < 0.2 ? [0.1, 0.5, 0.6] : null;
        // nubs crossed in front of it: 🙅
        arm(0, 1, 0.5, 0.8, 0.4 * Math.min(1, k * 5));
        arm(1, -1, 0.58, 0.8, 0.4 * Math.min(1, k * 5));
        P.turn = k > 0.5 ? Math.sin((k - 0.5) * Math.PI * 6) * 0.12 : 0;
      },
      healed(c) {
        const { k } = c;
        once(c, 'plus', () => label('+1', '#8cff9a', V(0.2, BODY_Y + H + 0.04, 0.12)));
        hop(k, 0.05);
        P.eyes = 'happy';
        P.glow = [0, 0.45 * wave(k), 0.12 * wave(k)];
        arm(1, 0.5, 1, 0.1, 0.22);
      },
      relief(c) {
        const { k } = c;
        P.eyes = k < 0.25 ? 'wide' : 'shut';
        P.sweat = true;
        P.squash = -0.12 * wave((k - 0.2) / 0.6);
        arm(0, -1, -0.9, 0, 0.05);
        arm(1, 1, -0.9, 0, 0.05);
        if (k > 0.5) P.eyes = 'happy';
      },
      scored(c) {
        const { k } = c;
        hop(k / 0.4, 0.04);
        P.eyes = k < 0.45 ? 'happy' : 'open';
        if (k > 0.45) {
          P.sweat = true; // oops, sorry
          arm(1, 0.35, 1, 0.1, 0.24 + Math.sin(c.time * 24) * 0.02);
        }
      },
      wince(c) {
        const { k } = c;
        P.eyes = k < 0.5 ? 'hurt' : 'wide';
        P.lean = -0.08;
        arm(0, 0.6, 0.6, 1, 0.28);
        arm(1, -0.6, 0.6, 1, 0.28);
      },
      limited(c) {
        once(c, '429', () => label('429', '#ff6b5a', V(0, BODY_Y + H + 0.05, 0.1), { life: 1.4, rise: 0.06, size: 0.008 }));
        P.eyes = 'flat';
        P.still = true;
        P.blink = false;
        P.grey = 0.45;
        P.x = Math.sin(c.time * 7) > 0.8 ? (Math.random() - 0.5) * 0.03 : 0; // stutters
      },
      emote(c) {
        const { emoji: e, mood } = c.detail;
        const { k } = c;
        // a mood is the face itself; an emoji picks one
        P.eyes = mood ?? EMOJI_FACE[e] ?? 'happy';
        if (e === '🙏') P.lean = wave(k) * 0.35;
        else if (P.eyes === 'happy') ((P.tilt = Math.sin(c.time * 22) * 0.08 * (1 - k)), hop(k * 2, 0.03), hop(k * 2 - 1, 0.03));
        else if (mood) MOOD_MOVES[mood]?.(k, c);
        else hop(k, 0.03);
        if (e === '👍') arm(1, 0.5, 1, 0.2, 0.22);
        if (e === '❤️') P.blush = true;
        if (P.eyes === 'sad') P.tear = true;
        if (P.eyes === 'angry') once(c, 'steam', () => puff('steam', V(0, BODY_Y + H, 0), 5));
      },
      catch(c) {
        const { k } = c;
        if (k < 0.2) {
          P.squash = -0.12;
          P.eyes = 'hurt';
          return;
        }
        const e = c.detail.emoji;
        P.eyes = CATCH_FACE[e] ?? 'happy';
        const t = (k - 0.2) / 0.8;
        if (e === '💀') ((P.squash = -0.1 * wave(t)), (P.lean = 0.12 * wave(t)), (P.grey = 0.4 * wave(t)));
        else if (e === '🤖') ((P.still = true), (P.blink = false), once(c, 'beep', () => label('BEEP', '#7dffc8', V(0, BODY_Y + H + 0.05, 0.1), { life: 0.9, rise: 0.05, size: 0.008 })));
        else if (e === '🔥') ((P.glow = [0.5 * wave(t), 0.22 * wave(t), 0.02]), MOOD_MOVES.wide(t, c));
        else if (CATCH_MOVES.has(e)) MOOD_MOVES[P.eyes]?.(t, c);
        else if (P.eyes === 'shut') P.lean = wave(t) * 0.3;
        else hop((k - 0.2) / 0.5, 0.03);
      },

      // ---- 21 ----
      thinkHand(c) {
        breathe(c, 1.1);
        P.spinner = true;
        P.ly = 1;
        P.lx = Math.sin(c.time * 0.8) > 0.6 ? 1 : 0;
        reach(1, above(c.prop('cards'), 0.03 + Math.abs(Math.sin(c.time * 5)) * 0.025, 0.05)); // tapping its cards
        P.legs[0] = Math.sin(c.time * 9) > 0.3 ? 0.014 : 0;
      },
      thinkCall(c) {
        breathe(c, 1.1);
        P.spinner = true;
        P.eyes = 'squint';
        P.tremble = 0.001;
        reach(1, above(c.prop('chips'), 0.07 + Math.sin(c.time * 2) * 0.02)); // a nub hovering over its chips
      },
      peekCard(c) {
        const { k } = c;
        P.lean = 0.12 * wave(k);
        if (k > 0.08 && k < 0.85) {
          reach(0, above(c.prop('cards'), 0.05, -0.05, 0.02)); // cupped over the card
          reach(1, above(c.prop('cards'), 0.05, 0.05, 0.02));
        }
        P.ly = k < 0.8 ? 1 : 0;
        P.eyes = k < 0.3 ? 'open' : k < 0.75 ? 'squint' : 'flat'; // and a poker face
        P.blink = false;
      },
      drawCard(c) {
        const { k } = c;
        breathe(c);
        if (k < 0.85) reach(0, k < 0.4 ? above(c.prop('deck'), 0.03) : slide(above(c.prop('deck'), 0.05), above(c.prop('cards'), 0.03, -0.06), (k - 0.4) / 0.35));
        P.lx = k < 0.4 ? -1 : 0;
        P.ly = 1;
        P.eyes = k > 0.7 ? 'flat' : 'open';
      },
      stand(c) {
        const { k } = c;
        // a flat nub waved over the cards: no more
        if (k < 0.8) reach(1, above(c.prop('cards'), 0.06, Math.sin(k * Math.PI * 3) * 0.08));
        P.eyes = 'flat';
        P.lean = -0.05 * wave(k);
      },
      raise(c) {
        const { k } = c;
        P.lean = 0.12 * wave(k);
        P.eyes = k < 0.6 ? 'angry' : 'smug';
        const from = above(c.prop('chips'), 0.03);
        const to = above(c.prop('pot'), 0.03);
        if (k < 0.85) {
          reach(1, slide(from, to, (k - 0.25) / 0.5));
          reach(0, slide(above(from, 0, -0.08), above(to, 0, -0.08), (k - 0.25) / 0.5));
        }
      },
      call(c) {
        const { k } = c;
        P.eyes = k < 0.5 ? 'squint' : 'flat';
        if (k < 0.85) reach(1, slide(above(c.prop('chips'), 0.03), above(c.prop('pot'), 0.03), (k - 0.2) / 0.5));
        P.lean = 0.06 * wave(k);
      },
      fold(c) {
        const { k } = c;
        if (k < 0.6) reach(0, slide(above(c.prop('cards'), 0.03), above(c.prop('cards'), 0.03, 0, 0.14), (k - 0.1) / 0.4)); // cards pushed away
        P.eyes = k < 0.45 ? 'shut' : 'sad';
        P.squash = -0.07 * Math.min(1, k * 2);
        P.lean = 0.12 * Math.min(1, k * 2);
        if (k > 0.45) arm(1, 1, -0.9, 0, 0.05);
      },
      noticeRaise(c) {
        const { k } = c;
        P.eyes = k < 0.5 ? 'wide' : 'squint';
        P.sweat = true;
        P.z = -0.03 * wave(k * 2);
        P.lx = k < 0.5 ? 0 : -1;
      },
      reveal(c) {
        const { k } = c;
        if (k < 0.75) reach(1, above(c.prop('cards'), 0.03 + wave(k / 0.75) * 0.1, 0.04));
        P.ly = 1;
        P.eyes = k < 0.6 ? 'flat' : 'open';
      },
      bust(c) {
        const { k } = c;
        once(c, 'smoke', () => puff('smoke', V(0, BODY_Y + H, 0.05), 6));
        P.eyes = k < 0.35 ? 'spiral' : 'dead';
        P.tilt = Math.sin(k * Math.PI * 3) * 0.12 * (1 - k);
        P.squash = -0.1 * Math.min(1, k * 3);
        P.grey = 0.25 * wave(k);
        arm(0, -1, -0.9, 0, 0.05);
        arm(1, 1, -0.9, 0, 0.05);
      },
      natural(c) {
        const { k } = c;
        once(c, '21', () => {
          label('21', '#ffe27a', V(0, BODY_Y + H + 0.05, 0.12), { life: 1.6, size: 0.009 });
          puff('gold', V(0, MID, D / 2), 12);
        });
        hop(k * 2, 0.06);
        hop(k * 2 - 1, 0.06);
        P.eyes = 'happy';
        P.blush = true;
        P.glow = [0.45 * wave(k), 0.35 * wave(k), 0.04];
        arm(0, -0.5, 1, 0, 0.22);
        arm(1, 0.5, 1, 0, 0.22);
      },
      winPot(c) {
        const { k } = c;
        const big = Boolean(c.detail.big);
        // both nubs rake the pot back to its stack
        if (k < 0.85) {
          const t = (k - 0.15) / 0.6;
          reach(0, slide(above(c.prop('pot'), 0.03, -0.06), above(c.prop('chips'), 0.03, -0.08), t));
          reach(1, slide(above(c.prop('pot'), 0.03, 0.06), above(c.prop('chips'), 0.03), t));
        }
        P.eyes = big || k < 0.5 ? 'happy' : 'smug';
        P.blush = big;
        if (big) {
          hop((k - 0.7) / 0.3, 0.05);
          once(c, 'gold', () => puff('gold', V(0, MID, D / 2), 8));
        }
      },
      losePot(c) {
        const { k } = c;
        P.eyes = 'sad';
        P.tear = Boolean(c.detail.big);
        P.lean = 0.12 * Math.min(1, k * 3);
        P.squash = -0.08 * Math.min(1, k * 3);
        P.ly = 1;
        arm(0, -1, -0.9, 0, 0.05);
        arm(1, 1, -0.9, 0, 0.05);
      },
      push(c) {
        const { k } = c;
        const up = wave(k);
        arm(0, -1, 0.6 * up, 0.2, 0.06 + up * 0.08); // a shrug
        arm(1, 1, 0.6 * up, 0.2, 0.06 + up * 0.08);
        P.y = up * 0.015;
        P.eyes = 'flat';
        P.tilt = Math.sin(k * Math.PI * 2) * 0.06;
      },

      // ---- Yacht ----
      thinkKeep(c) {
        breathe(c, 1.1);
        P.spinner = true;
        P.ly = 1;
        const s = Math.sin(c.time * 1.4);
        P.lx = s > 0.4 ? 1 : s < -0.4 ? -1 : 0; // eyes over the dice
        reach(1, above(c.prop('tray'), 0.07, s * 0.09));
      },
      thinkPad(c) {
        breathe(c, 1.1);
        P.spinner = true;
        P.ly = 1;
        P.lx = -1;
        P.eyes = 'squint';
        reach(0, above(c.prop('pad'), 0.03 + Math.abs(Math.sin(c.time * 4)) * 0.03)); // tapping the pad
      },
      rollDice(c) {
        const { k } = c;
        const cup = c.detail.cup ?? c.props.cup;
        if (k < 0.2) {
          // the dice it keeps, pulled aside
          if (c.detail.kept?.length) reach(1, above(c.prop('tray'), 0.03, Math.sin(k * 40) * 0.05));
          P.ly = 1;
          return;
        }
        if (k < 0.75) {
          const shake = Math.sin(c.time * 38) * 0.03;
          if (cup?.isObject3D) {
            const [a, b] = holds(cup);
            reach(1, a);
            reach(0, b);
          } else {
            reach(1, above(c.anchors.holdCup, shake, 0.05));
            reach(0, above(c.anchors.holdCup, shake + 0.04, -0.03));
          }
          P.x = Math.sin(c.time * 38) * 0.006;
          P.eyes = 'shut';
          P.squash = Math.sin(c.time * 19) * 0.03;
          return;
        }
        // and out onto the tray
        reach(1, above(c.prop('tray'), 0.08));
        reach(0, above(c.prop('tray'), 0.1, -0.05));
        P.lean = 0.1;
        P.eyes = 'wide';
        P.ly = 1;
      },
      scoreBox(c) {
        const { k } = c;
        const { big, zero, points = 0 } = c.detail;
        if (k < 0.55) {
          reach(0, above(c.prop('pad'), 0.02 + Math.abs(Math.sin(c.time * 30)) * 0.01, Math.sin(c.time * 22) * 0.02)); // scribbling
          P.ly = 1;
          P.lx = -1;
          P.eyes = 'squint';
          return;
        }
        once(c, 'pts', () => label(zero ? '0' : `+${points}`, zero ? '#8a9894' : big ? '#ffe27a' : '#c8ffe8', V(-0.2, BODY_Y + H, 0.12)));
        if (zero) {
          P.eyes = 'shut';
          P.squash = -0.08 * wave((k - 0.55) / 0.45); // a sigh: that box is gone
        } else if (big) {
          P.eyes = 'happy';
          P.blush = true;
          hop((k - 0.55) / 0.45, 0.05);
        } else P.eyes = 'flat';
      },
      yacht(c) {
        const { k } = c;
        once(c, 'yacht', () => {
          label(tr('ui.avatar.yacht'), '#ffe27a', V(0, BODY_Y + H + 0.06, 0.12), { life: 2, size: 0.009 });
          puff('gold', V(0, MID, D / 2), 16);
        });
        for (let i = 0; i < 3; i++) hop(k * 3 - i, 0.07);
        P.eyes = 'happy';
        P.blush = true;
        P.glow = Math.sin(c.time * 16) > 0 ? [0.5, 0.4, 0.05] : null;
        arm(0, -0.5, 1, 0, 0.2 + Math.max(0, Math.sin(c.time * 10)) * 0.08);
        arm(1, 0.5, 1, 0, 0.2 + Math.max(0, -Math.sin(c.time * 10)) * 0.08);
        P.legs = [0, 1, 2, 3].map((i) => (Math.sin(c.time * 12 + i * 1.6) > 0 ? 0.012 : 0));
      },
      noticeDice(c) {
        const { k } = c;
        const { yacht, big, zero } = c.detail;
        P.ly = k < 0.4 ? 1 : 0;
        if (k < 0.4) return;
        if (yacht) {
          P.eyes = 'wide';
          P.sweat = true;
          P.z = -0.04 * wave((k - 0.4) / 0.6);
          arm(0, 0.6, 0.6, 1, 0.28); // nubs to its face
          arm(1, -0.6, 0.6, 1, 0.28);
        } else P.eyes = zero ? 'smug' : big ? 'wide' : 'open';
      },

      // ---- small acts ----
      wave(c) {
        const { k } = c;
        P.eyes = 'happy';
        P.blush = true;
        P.blink = false;
        hop(k * 3, 0.025);
        P.tilt = Math.sin(c.t * 9) * 0.05;
        if (k < 0.6) arm(1, 0.55 + Math.sin(c.t * 15) * 0.5, 1, 0.2, 9 * U); // up, side to side
        else {
          // then a beckon: the nub stretching out your way and drawing back in, twice
          const b = Math.abs(Math.sin(((k - 0.6) / 0.4) * Math.PI * 2));
          arm(1, 0.9, 0.25 + 0.2 * b, 0.6, (3 + 7 * b) * U);
          P.lean = 0.07 * b;
        }
      },
      glance(c) {
        c.base(); // whatever it was doing goes on, only the look moves
        const p = c.point(c.detail.at);
        if (!p) return;
        const { k } = c;
        const v = root.worldToLocal(p);
        const ang = Math.atan2(v.x, Math.max(0.05, v.z));
        const elev = Math.atan2(v.y - (BODY_Y + H * 0.6), Math.hypot(v.x, v.z));
        const away = k > 0.07 && k < 0.8; // the eyes go first and come back first
        const clamp = (x, a) => Math.max(-a, Math.min(a, x));
        P.lx = away ? clamp(Math.round(ang * 1.6), 2) : 0;
        P.ly = away ? clamp(Math.round(-elev * 2.4), 2) : 0;
        P.blink = false;
        if (k > 0.14 && k < 0.74) P.turn += clamp(ang * 0.38, 0.5);
        if (Math.abs(ang) < 0.25) {
          // it's you it looks at: a little lean in, wide for a beat
          P.eyes = k < 0.3 ? 'wide' : 'open';
          P.lean += 0.08 * wave(k);
          hop(k * 3, 0.02);
        } else {
          P.eyes = 'open';
          P.tilt += -Math.sign(ang) * 0.05 * wave(k);
        }
      },
      yawn(c) {
        const { k } = c;
        const open = k < 0.15 ? k / 0.15 : k < 0.68 ? 1 : Math.max(0, 1 - (k - 0.68) / 0.14);
        P.mouth = open > 0.85 ? 4 : open > 0.5 ? 3 : open > 0.15 ? 2 : open > 0 ? 1 : 0; // the widest slab it has
        P.eyes = k < 0.12 ? 'squint' : k < 0.84 ? 'shut' : 'flat';
        P.blink = false;
        const st = wave(Math.min(1, k / 0.8)); // the stretch
        P.squash = 0.12 * st;
        P.lean = -0.12 * st;
        P.y += 0.02 * st;
        arm(0, -0.7, 0.9, -0.1, (4 + 5 * st) * U);
        arm(1, 0.7, 0.9, -0.1, (4 + 5 * st) * U);
        P.tremble = k > 0.3 && k < 0.65 ? 0.0015 : 0; // the shiver at the top of it
        if (k > 0.6) P.tear = true;
      },
      hideCard(c) {
        const { k } = c;
        const card = c.prop('cards');
        P.blink = false;
        P.lean = 0.12 * (k < 0.9 ? 1 : 1 - (k - 0.9) / 0.1);
        // straight from the peek, a nub slapped flat over the card
        if (k < 0.9) reach(0, k < 0.12 ? above(card, 0.06, 0.02) : above(card, 0.012, 0.02));
        P.turn = -0.08;
        P.eyes = k < 0.12 ? 'squint' : k < 0.38 ? 'wide' : 'flat'; // caught looking, then nothing to see here
        P.lx = k < 0.38 ? 0 : k < 0.6 ? 1 : 0;
        P.squash = -0.03;
      },
      cheer(c) {
        const { k } = c;
        P.eyes = 'happy';
        P.blush = true;
        P.blink = false;
        // a crouch, a big jump, the landing, a smaller one
        if (k < 0.14) P.squash = -0.14 * (k / 0.14);
        else if (k < 0.58) {
          const j = Math.sin(((k - 0.14) / 0.44) * Math.PI);
          P.y += j * 0.13;
          P.squash = 0.12 * j;
        } else if (k < 0.66) P.squash = -0.12 * wave((k - 0.58) / 0.08);
        else hop(((k - 0.66) / 0.34) * 1.4, 0.06);
        const up = k >= 0.12;
        const pump = Math.sin(c.t * 18) * 0.15;
        arm(0, -0.35 - pump, up ? 1 : -0.3, 0.1, (up ? 9 : 4) * U);
        arm(1, 0.35 + pump, up ? 1 : -0.3, 0.1, (up ? 9 : 4) * U);
        P.glow = [0.5 * wave(k), 0.38 * wave(k), 0.05];
        if (k > 0.3) once(c, 'gold', () => (puff('gold', V(0, MID, D / 2), 18), puff('spark', V(0, BODY_Y + H, D / 2), 8)));
      },
    };
    // Each clip starts from a clean pose, except a loop drawn under a one-shot.
    for (const [n, fn] of Object.entries(clips))
      clips[n] = (c) => {
        if (!c.under) reset();
        fn(c);
      };
    reset();

    // ---- every frame: ease toward the pose ----
    const cur = { x: 0, y: 0, z: 0, lean: 0, tilt: 0, turn: 0, squash: 0, grey: 0 };
    const glow = new THREE.Color();
    const tmp = new THREE.Color();
    let blinkAt = performance.now() + 2500;
    // the voice's blips: how open the mouth is and until when
    let mouthAmt = 0;
    let mouthUntil = 0;
    let lastBlip = false;
    let jolt = 0; // each blip twitches it up a hair
    function blip(b) {
      const now = performance.now();
      mouthAmt = b.loud;
      jolt = b.loud;
      lastBlip = b.last;
      // the last one hangs open a beat too long, then snaps shut
      mouthUntil = now + b.dur * (0.5 + 0.5 * b.loud) + (b.last ? 220 : 0);
    }
    function frame(f) {
      const ease = 1 - Math.exp(-f.dt * 14);
      for (const key of Object.keys(cur)) cur[key] += (P[key] - cur[key]) * (key === 'turn' && Math.abs(P.turn - cur.turn) > 1 ? 1 : ease);

      // talking: a bounce in syllables over whatever it is doing
      const talk = f.talking * (Math.abs(Math.sin(f.time * 13 + Math.sin(f.time * 4) * 2)) * 0.012);
      const shiver = P.tremble ? (Math.random() - 0.5) * P.tremble * 2 : 0;
      clawd.position.set(cur.x + shiver, STAND + cur.y + talk + jolt * 0.008, cur.z);
      jolt *= Math.exp(-f.dt * 18);
      clawd.rotation.set(0, cur.turn, cur.tilt);
      body.rotation.x = cur.lean;
      const sq = cur.squash + (f.talking ? talk * 3 : 0);
      body.scale.set(1 - sq * 0.5, 1 + sq, 1 - sq * 0.5);
      body.updateWorldMatrix(true, false);

      // arms: a direction and length in the body's space, or a point in the world to reach
      arms.forEach((a, i) => {
        const goal = P.arms[i];
        let dir;
        let len;
        if (goal.to) {
          const local = body.worldToLocal(goal.to.clone()).sub(a.pivot.position);
          len = local.length();
          dir = local.normalize();
        } else {
          dir = V(...goal.dir).normalize();
          len = goal.len;
          if (f.talking && !P.still) dir.y += Math.sin(f.time * 7 + i * 2) * 0.25 * f.talking;
          dir.normalize();
        }
        const k = 1 - Math.exp(-f.dt * (goal.to ? 22 : 12));
        a.dir.lerp(dir, k).normalize();
        a.len += (len - a.len) * k;
        a.pivot.quaternion.setFromUnitVectors(V(0, 0, 1), a.dir);
        a.mesh.scale.set(3 * U, 3 * U, Math.max(U, a.len));
      });
      legs.forEach((l, i) => (l.position.y = LEG / 2 + P.legs[i]));

      // colour: grey when dimmed, flashes through the glow
      const g = Math.round(cur.grey * 8) / 8;
      tmp.setHex(SKIN).lerp(new THREE.Color(GREY), g);
      skinMat.color.copy(tmp);
      if (P.glow) glow.setRGB(...P.glow);
      else glow.copy(tmp).multiplyScalar(RESTING * (1 - g * 0.4));
      skinMat.emissive.copy(glow);
      if (P.glow) faceMat.emissive.setRGB(...P.glow).addScalar(RESTING);
      else faceMat.emissive.setScalar(RESTING * (1 - g * 0.4));

      // blinking, unless the face is busy
      let eyes = P.eyes;
      // a line said with a mood wears it while it talks, unless it is past caring
      if (f.mood && f.talking > 0.3 && eyes !== 'dead' && eyes !== 'off') eyes = f.mood;
      if (P.blink && eyes === 'open' && f.now > blinkAt) {
        eyes = 'blink';
        if (f.now > blinkAt + 120) blinkAt = f.now + 2000 + Math.random() * 3500;
      }
      let mouth = 0;
      if (f.now < mouthUntil) mouth = lastBlip ? 2 : mouthAmt > 0.85 ? 4 : mouthAmt > 0.55 ? 3 : mouthAmt > 0.25 ? 2 : 1;
      mouth = Math.max(mouth, P.mouth); // a yawn opens it too
      drawFace({ eyes, lx: P.lx, ly: P.ly, sweat: P.sweat, blush: P.blush, tear: P.tear || (eyes === 'sad' && f.mood === 'sad'), mouth }, tmp.getHexString());

      spinner.visible = P.spinner;
      if (P.spinner) {
        drawSpin(Math.floor(f.now / 110) % SPIN.length);
        spinner.position.y = BODY_Y + H + 0.1 + Math.sin(f.time * 3) * 0.01 + cur.y;
      }
      for (const b of bits) {
        b.t += f.dt;
        b.v.y -= b.grav * f.dt;
        b.obj.position.addScaledVector(b.v, f.dt);
        b.obj.material.opacity = Math.min(1, 2 * (1 - b.t / b.life));
        if (b.t >= b.life) {
          root.remove(b.obj);
          bits.delete(b);
        }
      }
      for (const l of leds) l.m.color.setHex(Math.sin(f.time * l.rate) > -0.3 ? l.base : 0x0c1814);
    }

    return {
      root,
      anchors: {
        head: V(0, BODY_Y + H + 0.1, 0.12),
        mouth: V(0.3, BODY_Y + H - 0.02, 0.1),
        target: V(0, MID, 0),
        holdOut: V(0.06, 1.1, 0.44),
        holdSelf: V(0.3, 1.48, 0.46), // up front and to its right: the muzzle meets its face
        items: V(0.46, 0.77, 0.42),
        holdCup: V(0.12, 1.12, 0.36),
      },
      clips,
      frame,
      blip,
    };
  },
};
