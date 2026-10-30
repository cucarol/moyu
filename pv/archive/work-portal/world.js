// TRIAL (not main): the work as a world of its own, seen through the machine room's CRT
// (web/play/portal.js): the Claude desktop app's Code tab as a 3D object, in the games' pixel
// 3D. The window is a dark slab floating in the dark, its parts built out of it in layers:
// the title bar and the sidebar a little proud of it, the chat further, the input box most.
// Every word is voxels standing off its surface, lit, casting its shadow. New messages push
// out of the glass and the chat scrolls up under the title bar. The test run's progress bar
// sticks out of its card as a ledge; Clawd, the game's own model, lives in the input box,
// hops up onto the ledge and hauls on the fill (the film's hook), and dives back home. As
// the camera pulls back the layers part (an exploded view), and close up again as it squares
// up to the window to leave through the glass.
// at(t) is a pure function of the film's time, so any frame can be drawn on its own.
import { THREE, mat, pixelText } from '/web/play/stage.js';
import { createAvatar } from '/web/play/avatar/core.js';
import clawdAvatar from '/web/play/avatar/clawd.js';

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (x) => (x = clamp(x), x * x * (3 - 2 * x));
const back = (u) => (u = clamp(u), 1 + 2.7 * (u - 1) ** 3 + 1.7 * (u - 1) ** 2);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const VOX = 0.0125; // one pixel of the font, in metres
// the window: 8 x 4.5 m, its face at z 0; the app's dark theme
const WW = 8, WH = 4.5;
const COL = { bar: 0x1e1e1e, side: 0x272727, main: 0x222222, line: 0x3a3a3a, field: 0x3a3a3a, you: 0x363636, card: 0x2b2b2b, ink: 0xecebe8, ink2: 0xc9c7c1, dim: 0x9a9893, faint: 0x6e6c68, brand: 0xd97757, ok: 0x7ccf6a };
const TITLE = 0.28; // the title bar's height
const SIDE = 1.5; // the sidebar's width
const COL_L = -WW / 2 + SIDE + 0.55, COL_R = WW / 2 - 0.55; // the chat column
const IN = { x: (COL_L + COL_R) / 2, w: COL_R - COL_L, y0: -WH / 2 + 0.38, h: 0.62, d: 0.42 }; // the input box
const CHAT_TOP = WH / 2 - TITLE - 0.12;
const GAP = 0.14; // between chat items

// ---- voxel text: each lit pixel of the game's pixel font a little block ----
const glyphCache = new Map(); // filled once the pixel font has loaded
function glyph(ch) {
  if (glyphCache.has(ch)) return glyphCache.get(ch);
  const c = pixelText(ch, { size: 12 });
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const px = [];
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] === 255) px.push([x, y]);
  const g = { w: ch === ' ' ? 5 : c.width, px };
  glyphCache.set(ch, g);
  return g;
}
const cube = new THREE.BoxGeometry(1, 1, 1);
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
export const textWidth = (text, size = 1) => [...text].reduce((w, ch) => w + glyph(ch).w, 0) * VOX * size;
// the chat's top edge: whatever scrolls past it is cut off, as under the app's title bar
const CLIP = [new THREE.Plane(V(0, -1, 0), CHAT_TOP)];

// A line of voxel text, its left edge at x = 0 and its baseline at y = 0, facing +z. at: when
// each character arrives (a number for all at once, or [t0, cps] streamed); a character comes
// as a token does, its blocks dropping onto the surface out of the air just in front of it,
// left to right. from: a point (this text's space) its blocks fly in from instead.
class VText {
  constructor(text, { color = COL.ink, glow = 0.8, depth = 1.5, at = -99, from = null, size = 1, clip = false } = {}) {
    Object.assign(this, { color, glow, depth, from, size, clip });
    this.group = new THREE.Group();
    this.set(text, at);
  }
  set(text, at = this.at) {
    const key = text + JSON.stringify(at);
    if (key === this.key) return;
    Object.assign(this, { key, text, at });
    if (this.mesh) (this.group.remove(this.mesh), this.mesh.dispose());
    const P = VOX * this.size, vox = [];
    let x = 0, i = 0;
    for (const ch of text) {
      const g = glyph(ch);
      for (const [px, py] of g.px) vox.push({ x: (x + px + 0.5) * P, y: (12 - py - 0.5) * P, ci: i, j: (px / Math.max(1, g.w)) * 0.5 + rand() * 0.5 });
      x += g.w;
      i++;
    }
    this.width = x * P;
    this.vox = vox;
    const m = new THREE.MeshLambertMaterial({ color: this.color, emissive: new THREE.Color(this.color).multiplyScalar(this.glow) });
    if (this.clip) (m.clippingPlanes = CLIP), (m.clipShadows = true);
    this.mesh = new THREE.InstancedMesh(cube, m, Math.max(1, vox.length));
    this.mesh.count = vox.length;
    this.group.add(this.mesh);
    this.last = Math.max(-99, ...[...text].map((_, k) => this.charAt(k))) + 0.3;
    this.update(Array.isArray(this.at) || this.at > -99 ? -1e9 : 1e9, true);
    this.done = false;
  }
  charAt(i) {
    return Array.isArray(this.at) ? this.at[0] + i / this.at[1] : this.at;
  }
  update(t, force = false) {
    if (this.done && !force) return;
    const P = VOX * this.size, D = P * this.depth;
    this.vox.forEach((v, k) => {
      const t0 = this.charAt(v.ci) + v.j * 0.08;
      const u = clamp((t - t0) / 0.2), f = 1 - smooth(u);
      if (this.from) {
        const w = 1 - smooth(clamp((t - t0) / 0.45));
        tmpP.set(v.x + (this.from.x - v.x) * w, v.y + (this.from.y - v.y) * w + Math.sin(w * Math.PI) * 0.15, D / 2 + (this.from.z - D / 2) * w);
      } else tmpP.set(v.x, v.y + f * P * 2, D / 2 + f * P * 10);
      const s = t < t0 ? 0 : P * 0.94;
      tmpM.compose(tmpP, tmpQ.identity(), tmpS.set(s, s, t < t0 ? 0 : D));
      this.mesh.setMatrixAt(k, tmpM);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    this.done = !force && t > this.last + 0.3;
  }
}

// a box standing out of the window's face: w x h, d deep, its back at z0
function slab(parent, { w, h, d, x, y, z0 = 0, color, glow = 0, clip = false, shadow = true }) {
  const m = mat({ color, emissive: new THREE.Color(color).multiplyScalar(glow) });
  if (clip) (m.clippingPlanes = CLIP), (m.clipShadows = true);
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  b.position.set(x, y, z0 + d / 2);
  b.castShadow = shadow;
  b.receiveShadow = true;
  parent.add(b);
  return b;
}
// a hairline: the app's 1px borders, lit
function hair(parent, w, h, x, y, z, color = COL.line, clip = false) {
  const m = new THREE.MeshBasicMaterial({ color });
  if (clip) m.clippingPlanes = CLIP;
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.01), m);
  b.position.set(x, y, z);
  parent.add(b);
  return b;
}
function text(parent, s, x, y, z, opts = {}) {
  const v = new VText(s, opts);
  v.group.position.set(x, y, z);
  parent.add(v.group);
  return v;
}

// ---- the chat's items, each a group whose bottom left is at (0, 0) and that knows its height ----
// kind: you (your message in a bubble, right), say (the agent's words), step (a tool line),
// tasks, tool (a test run, its progress bar a ledge out of the card), link
const PAD = 0.12, LINE = 12 * VOX + 0.1;
function buildItem(r) {
  const g = new THREE.Group();
  const texts = [];
  const T = (s, x, y, z, o) => (texts.push(text(g, s, x, y, z, { clip: true, ...o })), texts.at(-1));
  const at = r.stream ? [r.t + 0.1, r.stream] : r.t + 0.1;
  const out = { g, texts, r, h: LINE, z: 0.12 };
  const W = COL_R - COL_L;
  if (r.kind === 'you') {
    const w = textWidth(r.text) + PAD * 2, h = 12 * VOX + PAD * 2;
    slab(g, { w, h, d: 0.08, x: W - w / 2, y: h / 2, color: COL.you, clip: true });
    const x = W - w + PAD;
    // its letters fly up out of the input box, from where they were typed
    T(r.text, x, PAD, 0.08, { at: r.t, from: r.from ? V(IN.x - IN.w / 2 + 0.2 - COL_L - x, -(0.3 + 0.42 + PAD), IN.d - 0.2) : null });
    out.h = h;
  } else if (r.kind === 'say') {
    T(r.text, 0, 0.04, 0, { at });
  } else if (r.kind === 'step') {
    T('●', 0, 0.04, 0, { at, color: COL.ok, glow: 0.7 });
    T(r.verb, 0.24, 0.04, 0, { at, color: COL.ink2 });
    T(r.detail, 0.32 + textWidth(r.verb), 0.04, 0, { at, color: COL.dim, glow: 0.35 });
  } else if (r.kind === 'link') {
    T(r.text, 0, 0.04, 0, { at, color: COL.brand, glow: 0.8 });
  } else if (r.kind === 'tasks') {
    const h = r.items.length * LINE + PAD * 2;
    slab(g, { w: 3.0, h, d: 0.06, x: 1.5, y: h / 2, color: COL.card, clip: true });
    r.items.forEach(([s, done], i) => {
      const y = h - PAD - (i + 1) * LINE + 0.06;
      T(done !== null ? '✓' : '○', PAD, y, 0.06, { at: r.t + 0.1 + i * 0.05, color: done !== null ? COL.ok : COL.faint, glow: 0.7 });
      T(s, PAD + 0.3, y, 0.06, { at: r.t + 0.1 + i * 0.05, color: done !== null ? COL.dim : COL.ink, glow: done !== null ? 0.3 : 0.5 });
    });
    out.h = h;
  } else if (r.kind === 'tool') {
    const h = 3 * LINE + PAD * 2 + 0.1, D = 0.22;
    slab(g, { w: W, h, d: D, x: W / 2, y: h / 2, color: COL.card, clip: true });
    hair(g, W, 0.012, W / 2, h - 0.006, D + 0.006, 0x3a3a3a, true);
    const top = h - PAD - LINE + 0.06;
    T('›_', PAD, top, D, { at: r.t + 0.1, color: COL.dim });
    T('Bash', PAD + 0.32, top, D, { at: r.t + 0.1, color: COL.ink });
    T(r.cmd, PAD + 0.95, top, D, { at: r.t + 0.1, color: COL.ink2, glow: 0.35 });
    out.files = [0, 1].map((i) => T('', PAD + 0.32, top - (i + 1) * LINE, D, { color: COL.faint, glow: 0.3 }));
    // the progress bar: a ledge out of the card's top, the fill glowing in its groove, and
    // the count riding just under the fill's tip
    const len = W - PAD * 2, x0 = PAD;
    slab(g, { w: len + 0.08, h: 0.07, d: 0.42, x: x0 + len / 2, y: h + 0.035, z0: 0, color: 0x101010, clip: true });
    const fillMat = new THREE.MeshLambertMaterial({ color: COL.brand, emissive: new THREE.Color(COL.brand).multiplyScalar(0.9) });
    fillMat.clippingPlanes = CLIP;
    fillMat.clipShadows = true;
    const fill = new THREE.Mesh(new THREE.BoxGeometry(1, 0.05, 0.43), fillMat);
    g.add(fill);
    const glow = new THREE.Object3D();
    out.count = T('', 0, top, D, { color: COL.dim, glow: 0.45 });
    out.rail = { x0, len, y: h + 0.07, z: 0.21, fill, glow };
    out.h = h + 0.07;
  }
  return out;
}

export function buildWorld({ L, events, runKeys, sessions = [] }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060505);
  scene.fog = new THREE.FogExp2(0x060505, 0.025);
  scene.add(new THREE.HemisphereLight(0xb8b2aa, 0x141210, 1.5));
  const key = new THREE.DirectionalLight(0xfff2e2, 3.0);
  key.position.set(-4, 5, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -5, right: 5, top: 4, bottom: -4, near: 0.5, far: 20 });
  key.shadow.bias = -0.0008;
  scene.add(key, key.target);
  // a cool rim from behind, so what stands out of the window separates from it
  const rim = new THREE.DirectionalLight(0x9cb8ff, 0.8);
  rim.position.set(4, 3, -5);
  scene.add(rim);

  // ---- the window and its layers: each layer a group, parted along z for the exploded view ----
  const win = new THREE.Group();
  scene.add(win);
  const L0 = new THREE.Group(), Lside = new THREE.Group(), Lchat = new THREE.Group(), Linput = new THREE.Group();
  win.add(L0, Lside, Lchat, Linput);
  const layers = [[Lside, 0.5], [Lchat, 1.1], [Linput, 1.8]]; // how far each parts, at most
  // the window itself: its body, a hairline round it, the title bar
  slab(L0, { w: WW, h: WH, d: 0.12, x: 0, y: 0, z0: -0.12, color: COL.main, glow: 0.3 });
  for (const [w, h, x, y] of [[WW, 0.014, 0, WH / 2], [WW, 0.014, 0, -WH / 2], [0.014, WH, -WW / 2, 0], [0.014, WH, WW / 2, 0]]) hair(L0, w, h, x, y, 0.005, 0x3a3836);
  slab(L0, { w: WW, h: TITLE, d: 0.04, x: 0, y: WH / 2 - TITLE / 2, color: COL.bar, glow: 0.1 });
  hair(L0, WW, 0.01, 0, WH / 2 - TITLE, 0.045);
  text(L0, '≡', -WW / 2 + 0.16, WH / 2 - TITLE + 0.07, 0.04, { color: COL.dim, glow: 0.4, size: 0.8 });
  text(L0, 'Claude', -WW / 2 + 0.42, WH / 2 - TITLE + 0.07, 0.04, { color: COL.ink2, glow: 0.4, size: 0.8 });
  text(L0, '—   ▢   ✕', WW / 2 - 1.0, WH / 2 - TITLE + 0.07, 0.04, { color: COL.dim, glow: 0.4, size: 0.8 });
  // the sidebar: new session, the day's sessions, this one lit
  slab(Lside, { w: SIDE, h: WH - TITLE, d: 0.05, x: -WW / 2 + SIDE / 2, y: -TITLE / 2, color: COL.side, glow: 0.12 });
  hair(Lside, 0.01, WH - TITLE, -WW / 2 + SIDE, -TITLE / 2, 0.055);
  let sy = WH / 2 - TITLE - 0.42;
  text(Lside, '+  New session', -WW / 2 + 0.2, sy, 0.05, { color: COL.ink2, size: 0.85 });
  sy -= 0.42;
  text(Lside, 'Today', -WW / 2 + 0.2, sy, 0.05, { color: COL.faint, glow: 0.3, size: 0.75 });
  sessions.forEach(([s, active], i) => {
    const y = sy - 0.34 * (i + 1);
    if (active) slab(Lside, { w: SIDE - 0.2, h: 0.28, d: 0.04, x: -WW / 2 + SIDE / 2, y: y + 0.07, z0: 0.05, color: 0x2c2c2c, glow: 0.15 });
    text(Lside, s, -WW / 2 + 0.22, y, active ? 0.09 : 0.05, { color: active ? COL.ink : COL.dim, glow: active ? 0.5 : 0.3, size: 0.85 });
  });
  // the input box: a deep box out of the window, open at the top (Clawd's den), what you type
  // on its face, the send button, and under it the session's bits
  const inBox = new THREE.Group();
  inBox.position.set(IN.x, IN.y0, 0);
  Linput.add(inBox);
  const fieldMat = mat({ color: COL.field, emissive: new THREE.Color(COL.field).multiplyScalar(0.15) });
  const wall = (w, h, d, x, y, z, m = fieldMat) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z);
    b.castShadow = b.receiveShadow = true;
    inBox.add(b);
    return b;
  };
  wall(IN.w, IN.h, 0.06, 0, IN.h / 2, IN.d - 0.03); // the face
  wall(0.06, IN.h, IN.d, -IN.w / 2 + 0.03, IN.h / 2, IN.d / 2);
  wall(0.06, IN.h, IN.d, IN.w / 2 - 0.03, IN.h / 2, IN.d / 2);
  wall(IN.w, 0.06, IN.d, 0, 0.03, IN.d / 2);
  const edgeMat = new THREE.MeshBasicMaterial({ color: 0x4a4744 });
  const topEdge = new THREE.Mesh(new THREE.BoxGeometry(IN.w, 0.02, 0.02), edgeMat);
  topEdge.position.set(0, IN.h, IN.d);
  inBox.add(topEdge);
  const typed = text(inBox, '', -IN.w / 2 + 0.2, IN.h - 0.3, IN.d, { at: -99 });
  const placeholder = text(inBox, 'Enter to send, Ctrl+Enter to queue for later', -IN.w / 2 + 0.2, IN.h - 0.3, IN.d, { color: COL.dim, glow: 0.5, size: 0.85 });
  wall(0.26, 0.26, 0.04, IN.w / 2 - 0.25, 0.2, IN.d + 0.02, mat({ color: COL.brand, emissive: new THREE.Color(COL.brand).multiplyScalar(0.5) }));
  text(inBox, '↑', IN.w / 2 - 0.3, 0.14, IN.d + 0.04, { color: 0x1a120c, glow: 0, size: 0.8 });
  text(Linput, 'This computer   ·   my-app   ·   Worktree', IN.x - IN.w / 2 + 0.1, -WH / 2 + 0.08, 0.04, { color: COL.faint, glow: 0.3, size: 0.7 });
  // the status over the input: the spark, Running… and how long
  const statusY = IN.y0 + IN.h + 0.1;
  const status = text(Lchat, '', COL_L + 0.4, statusY, 0.02, { color: COL.brand, glow: 0.7, size: 0.85 });
  const spark = new THREE.Group();
  const sparkMat = new THREE.MeshLambertMaterial({ color: COL.brand, emissive: new THREE.Color(COL.brand).multiplyScalar(0.8) });
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.045, 0.045), sparkMat);
    arm.rotation.z = (i * Math.PI) / 4;
    spark.add(arm);
  }
  spark.position.set(COL_L + 0.15, statusY + 0.07, 0.08);
  Lchat.add(spark);

  // ---- the chat ----
  const items = [];
  for (const e of events) {
    const add = (r) => {
      const it = buildItem(r);
      Lchat.add(it.g);
      items.push(it);
    };
    if (e.type) add({ kind: 'you', text: e.type, t: e.t + [...e.type].length / e.cps + 0.3, from: true });
    if (e.say) add({ kind: 'say', text: e.say, t: e.t, stream: 22 });
    if (e.step) add({ kind: 'step', verb: e.step[0], detail: e.step[1], t: e.t });
    if (e.tasks) add({ kind: 'tasks', items: e.tasks, t: e.t });
    if (e.tool) add({ kind: 'tool', cmd: e.tool[1], t: e.t, run: e.run });
    if (e.link) add({ kind: 'link', text: `${e.link[0]}  →  ${e.link[1]}`, t: e.t, stream: 30 });
  }
  const tool = items.findLast((o) => o.r.kind === 'tool');
  const CHAT_Y0 = statusY + 0.32; // the newest item's foot
  // where an item is at t: on top of everything newer, each arrival pushing it up with a spring;
  // and how far out of the glass it has come
  function placeItems(t) {
    for (const it of items) {
      let y = CHAT_Y0;
      for (const o of items) if (o.r.t > it.r.t) y += (o.h + GAP) * back((t - o.r.t) / 0.5);
      const out = back((t - it.r.t) / 0.4);
      it.g.position.set(COL_L, y, -0.3 + (it.z + 0.3) * out);
      it.g.visible = t > it.r.t - 0.01 && y < CHAT_TOP + 0.05;
      for (const v of it.texts) v.update(t);
    }
  }
  const runK = (t) => {
    const k = runKeys;
    if (t <= k[0][0]) return k[0][1];
    for (let i = 1; i < k.length; i++) if (t <= k[i][0]) return k[i - 1][1] + (k[i][1] - k[i - 1][1]) * smooth((t - k[i - 1][0]) / (k[i][0] - k[i - 1][0]));
    return k.at(-1)[1];
  };
  const FILES = ['src/auth/session.test.ts', 'src/auth/login.test.ts', 'src/ui/modal.test.ts', 'src/mail/queue.test.ts', 'src/cache/lru.test.ts', 'src/billing/plan.test.ts', 'src/api/routes.test.ts', 'src/db/pool.test.ts'];
  function run(t) {
    if (!tool) return;
    const k = runK(t), total = tool.r.run?.total ?? 1204;
    const { x0, len, y, z, fill, glow } = tool.rail;
    fill.scale.x = Math.max(0.001, len * k);
    fill.position.set(x0 + (len * k) / 2, y - 0.025, z + 0.005);
    glow.position.set(x0 + len * k, y + 0.25, z + 0.3);
    const done = Math.floor(total * k);
    tool.count.set(`${done} / ${total}`, -99);
    tool.count.group.position.x = x0 + len - tool.count.width;
    tool.count.update(t);
    const f = Math.floor(done / 37);
    tool.files.forEach((v, i) => (v.set(`✓ ${FILES[(f + i) % FILES.length]}`, -99), v.update(t)));
  }

  // ---- the exploded view: how far the layers are parted at t ----
  let explode = () => 0;

  // ---- Clawd: the game's model, its server stack hidden, about a pivot at its feet ----
  const hooks = new Set();
  const cam = new THREE.PerspectiveCamera(62, 16 / 9, 0.05, 400);
  const opp = createAvatar({ scene, camera: cam, onFrame: (fn) => (hooks.add(fn), () => hooks.delete(fn)), project: () => ({ x: 0, y: 0 }) }, clawdAvatar, { at: V(0, 0, 0) });
  opp.autoActs = false;
  opp.group.children[0].children[0].children.forEach((o) => o.isMesh && (o.visible = false));
  const FEET = 0.82, SIZE = 0.66;
  const pivot = new THREE.Group();
  pivot.position.set(0, FEET, 0);
  scene.add(pivot);
  pivot.attach(opp.group);
  pivot.scale.setScalar(SIZE);
  const HEAD = (1.6 - FEET) * SIZE;

  // its bubble: the game's (cream, ink, a hard shadow), over its head
  const bubbleTex = (s) => {
    const t = pixelText(s, { size: 12, color: '#1a120c' });
    const c = document.createElement('canvas');
    c.width = t.width + 14;
    c.height = 30;
    const x = c.getContext('2d');
    x.fillStyle = 'rgba(0,0,0,0.45)';
    x.fillRect(4, 4, c.width - 4, 22);
    x.fillStyle = '#1a120c';
    x.fillRect(0, 0, c.width - 4, 22);
    x.fillStyle = '#f3e6cf';
    x.fillRect(2, 2, c.width - 8, 18);
    x.drawImage(t, 5, 4);
    x.fillStyle = '#1a120c';
    x.fillRect(6, 22, 6, 2), x.fillRect(6, 24, 4, 2), x.fillRect(6, 26, 2, 2);
    x.fillStyle = '#f3e6cf';
    x.fillRect(8, 20, 2, 4);
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    return { tex, w: c.width, h: c.height };
  };
  const bubble = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, fog: false }));
  bubble.center.set(0.05, 0);
  bubble.renderOrder = 10;
  scene.add(bubble);

  // where it stands, live from where things are at t (world space)
  const DEN_X = IN.w / 2 - 0.9;
  function anchor(name) {
    if (name === 'tip') {
      const { x0, len, y, z } = tool.rail;
      return tool.g.localToWorld(V(x0 + len * runK(lastT) + 0.24, y, z));
    }
    if (name === 'input') return inBox.localToWorld(V(DEN_X, IN.h * 0.35, IN.d / 2));
    // down in the box, under where it first hops to
    const first = moves.find((m) => m.clawd === 'hop');
    const x = first?.to === 'tip' ? clamp(anchor('tip').x - IN.x, -IN.w / 2 + 0.4, IN.w / 2 - 0.4) : DEN_X;
    return inBox.localToWorld(V(x, -HEAD * 0.9, IN.d / 2));
  }
  let lastT = 0;
  const ACTS = { yawn: 'yawn', wave: 'wave', cheer: 'cheer' };
  const fired = new Set();
  const moves = events.filter((e) => e.clawd);
  function clawd(t) {
    const done = moves.filter((m) => t >= m.t);
    for (const e of done) if (!fired.has(e) && ACTS[e.clawd]) (fired.add(e), opp.setState(ACTS[e.clawd]));
    // hop by hop out of the box, each arc from where the last one left it
    let at = 'under', p = anchor('under'), sx = 1, sy = 1, lean = 0;
    for (const e of done.filter((m) => m.clawd === 'hop')) {
      const u = clamp((t - e.t) / e.ms);
      if (u < 1) {
        p = anchor(at).lerp(anchor(e.to), smooth(u));
        p.y += e.h * 4 * u * (1 - u);
        [sx, sy] = [0.9, 1.14];
      } else {
        const v = clamp((t - e.t - e.ms) / 0.22), q = Math.sin(v * Math.PI) * (1 - v * 0.4);
        [sx, sy] = [1 + 0.22 * q, 1 - 0.28 * q];
        p = anchor(e.to);
      }
      at = e.to;
    }
    // the haul: leaning back from the fill's tip, straining, its feet skidding
    const tug = done.findLast((m) => m.clawd === 'tug');
    if (tug && t < tug.until) {
      const v = clamp((t - tug.t) / 0.2) * clamp((tug.until - t) / 0.15);
      lean = -0.32 * v;
      p.x += Math.sin(t * 55) * 0.01 * v;
      sy *= 1 - 0.06 * v * (0.5 + 0.5 * Math.sin(t * 18));
    }
    const dive = done.find((m) => m.clawd === 'dive');
    if (dive) p.y -= HEAD * 1.6 * clamp((t - dive.t) / 0.35) ** 2;
    // turned a little to the tip while it is on the ledge, till it gives up and turns to us
    const turn = done.find((m) => m.clawd === 'turn');
    const onBar = done.some((m) => m.clawd === 'hop' && m.to === 'tip');
    const face = !onBar ? 0 : turn ? -0.5 * (1 - smooth((t - turn.t) / 0.35)) : -0.5;
    pivot.position.copy(p);
    pivot.visible = !dive || t < dive.t + 0.22;
    pivot.rotation.set(0, face, lean);
    pivot.scale.set(SIZE * sx, SIZE * sy, SIZE * sx);
    const now = performance.now();
    for (const fn of hooks) fn(now / 1000, now);
    // its ask over its head: springs up, holds, goes as it heads back into the box
    const ask = events.findLast((e) => e.bubble && t >= e.t + 0.25);
    const gone = ask && moves.find((e) => e.t > ask.t && (e.clawd === 'dive' || (e.clawd === 'hop' && e.to === 'input')));
    const u = ask ? clamp((t - ask.t - 0.25) / 0.4) : 0, v = gone ? clamp((t - gone.t) / 0.15) : 0;
    bubble.visible = !!ask && v < 1;
    if (bubble.visible) {
      if (bubble.userData.text !== ask.bubble) {
        bubble.material.map?.dispose();
        const b = bubbleTex(ask.bubble);
        bubble.material.map = b.tex;
        bubble.material.needsUpdate = true;
        bubble.userData = { text: ask.bubble, w: b.w, h: b.h };
      }
      const s = back(u) * (1 - v) * 0.011;
      bubble.scale.set(bubble.userData.w * s, bubble.userData.h * s, 1);
      bubble.position.copy(p).add(V(0.1, HEAD * sy + 0.06, 0));
      bubble.material.rotation = -0.1 * (1 - back(u));
    }
    return { dive };
  }

  // ---- the input's life: typing, the spark, the box answering Clawd ----
  function inputs(t, dive) {
    const typing = events.findLast((e) => e.type && t >= e.t && t < e.t + [...e.type].length / e.cps + 0.3);
    const n = typing ? Math.floor((t - typing.t) * typing.cps) : 0;
    typed.set(typing ? [...typing.type].slice(0, n).join('') : '', typing ? [typing.t, typing.cps] : -99);
    typed.update(t);
    placeholder.group.visible = !typing;
    const runs = tool && t >= tool.r.t;
    status.set(runs ? `Running…  ${Math.floor(t - tool.r.t + 41)}s` : '', -99);
    status.update(t);
    spark.visible = !!runs;
    spark.rotation.z = -t * 2.4;
    spark.scale.setScalar(1 + 0.15 * Math.sin(t * 7));
    // a wobble as it leaves and lands, a flare as it dives
    const hops = moves.filter((m) => m.clawd === 'hop');
    const jel = [hops[0]?.t, ...hops.filter((m) => m.to === 'input').map((m) => m.t + m.ms), dive?.t]
      .filter((v) => v !== undefined)
      .reduce((w, t0) => w + (t >= t0 ? Math.exp(-(t - t0) * 7) * Math.sin((t - t0) * 22) : 0), 0);
    inBox.scale.set(1 + 0.015 * jel, 1 - 0.1 * jel, 1 + 0.03 * jel);
    const flash = dive ? Math.exp(-Math.max(0, t - dive.t - 0.15) * 3) * clamp((t - dive.t) / 0.1) : 0;
    edgeMat.color.setHex(typing ? COL.brand : 0x4a4744).lerp(new THREE.Color(0xffb48a), flash);
  }

  return {
    scene,
    camera: cam,
    window: win,
    size: [WW, WH],
    setExplode: (fn) => (explode = fn),
    // the world at time t (seconds)
    at(t) {
      lastT = t;
      const e = explode(t);
      for (const [g, z] of layers) g.position.z = z * e;
      placeItems(t);
      run(t);
      scene.updateMatrixWorld(true);
      const { dive } = clawd(t);
      inputs(t, dive);
    },
  };
}
