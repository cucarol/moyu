// Roulette's room: the agent's turf, a cramped machine room overgrown with cables, lit by
// CRTs and one caged work lamp, shadows broken into red dots. On the table: the gun, the
// shells, both seats' items and their 额度 lights. The game runs on the server
// (server/games/roulette.mjs); this page shows its events and sends your moves.
import { THREE, canvasTex, pixelText, noiseTex, mat, snapped, addOpponent } from './stage.js';
import { itemIcon } from './icons.js';
import { createTableHud } from './roulette-hud.js';
import { reviewAvatar } from './avatar/review.js';
import { greet } from './avatar/cues.js'; // avatar
import { sfx, setMood } from './audio.js';
import { items as WORDS, t, lang } from './i18n.js';
import { serverUp } from './sleep.js';
import { live } from './live.js';
import { createLive } from './roulette-live.js';
import { machinePv } from './pv-machine.js';

export const roomOptions = { background: 0x020504, fog: [0x061210, 0.42] };

const TABLE_Y = 0.76;
const MAX_HP = 4; // a single game's, and the most a rack shows
const ROUND_HP = [2, 3, 4]; // a match's 额度 in rounds 1 to 3 (server/games/roulette.mjs ROUNDS)
const COL = { led: 0x7dffc8, ledOff: 0x0c1814, red: 0xff2e3e, live: 0xd8303a, blank: 0x4f9cd0, brass: 0xd8b050 };

// Each item's name and tip come in the player's language (i18n/); its colour is the page's.
const COLORS = {
  cot: '#7dffc8',
  compact: '#9fd0ff',
  inject: '#ff6b7a',
  temp: '#ffb347',
  limit: '#ff8a5c',
  refuse: '#e8e2c8',
  cache: '#8cff9a',
  jailbreak: '#ff5fd2',
  mirage: '#e08cff',
};
export const ITEMS = Object.fromEntries(Object.entries(COLORS).map(([id, color]) => [id, { ...WORDS[id], color }]));
// what an item that came out of a 幻觉 says when you point at it
const CONJURED_TIP = t('terms.conjured');
// what 越狱 can't take
const UNTAKEABLE = new Set(['refuse', 'jailbreak']);

// a small seeded random so the room's clutter is the same every load
function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

// ---- small pixel type for the room's screens and stencils ----------------------------

// A 3x5 font: at the room's resolution a 12px glyph turns to mush on a far screen, these
// stay letters. Each glyph is five rows of three bits, written as octal digits.
const FONT3 = {
  0: '75557', 1: '26227', 2: '71747', 3: '71317', 4: '55711', 5: '74717', 6: '74757', 7: '71122', 8: '75757', 9: '75717',
  A: '25755', B: '65656', C: '34443', D: '65556', E: '74647', F: '74644', G: '34553', H: '55755', I: '72227', J: '11152',
  K: '55655', L: '44447', M: '57755', N: '65555', O: '25552', P: '65644', Q: '25563', R: '65655', S: '34216', T: '72222',
  U: '55557', V: '55552', W: '55775', X: '55255', Y: '55222', Z: '71247',
  ' ': '00000', '>': '42124', '<': '12421', '.': '00002', ',': '00024', '/': '11244', '%': '51245', ':': '02020',
  '-': '00700', '[': '64446', ']': '31113', '_': '00007', '?': '71302', '!': '22202', '=': '07070', '+': '02720',
  '#': '57575', '*': '05250', '(': '24442', ')': '21112', "'": '22000',
};

// Anything the 3x5 font lacks (中文, emoji) becomes a 6x6 shrunk copy of its Fusion Pixel
// glyph, so a line of Chinese on a far screen still looks like that line of Chinese.
const miniGlyphs = new Map();
const miniCtx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
function miniGlyph(ch) {
  if (miniGlyphs.has(ch)) return miniGlyphs.get(ch);
  const src = pixelText(ch, { color: '#fff' });
  const { width: w, height: h } = src;
  miniCtx.canvas.width = w;
  miniCtx.canvas.height = h;
  miniCtx.drawImage(src, 0, 0);
  const d = miniCtx.getImageData(0, 0, w, h).data;
  const bits = [];
  for (let y = 0; y < 6; y++)
    for (let x = 0; x < 6; x++) {
      let n = 0;
      for (let yy = Math.floor((y * h) / 6); yy < Math.floor(((y + 1) * h) / 6); yy++)
        for (let xx = Math.floor((x * w) / 6); xx < Math.floor(((x + 1) * w) / 6); xx++) if (d[(yy * w + xx) * 4 + 3]) n++;
      bits.push(n >= 2);
    }
  // while the font is still loading this is a fallback face: don't keep it
  if (document.fonts?.check('12px FusionPixel')) miniGlyphs.set(ch, bits);
  return bits;
}

// Draws text at (x, y) in the 3x5 font (ctx null only measures); returns its width.
function text3(ctx, text, x, y, color, scale = 1) {
  if (ctx) ctx.fillStyle = color;
  let cx = x;
  for (const ch of String(text)) {
    const g = FONT3[ch.toUpperCase()];
    if (g) {
      if (ctx) for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (Number(g[r]) & (4 >> c)) ctx.fillRect(cx + c * scale, y + r * scale, scale, scale);
      cx += 4 * scale;
    } else {
      if (ctx) miniGlyph(ch).forEach((on, i) => on && ctx.fillRect(cx + (i % 6) * scale, y + (Math.floor(i / 6) - 1) * scale, scale, scale));
      cx += 7 * scale;
    }
  }
  return cx - x - scale;
}

// ---- the room ------------------------------------------------------------------

function buildRoom(stage, opp) {
  const { scene, tween, ease, onFrame, pickable, drop, project, post, shake } = stage;
  const rand = rng(11);
  const P = (ctx, color, x, y, w = 1, h = 1) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };
  // a few pixels scattered over a texture: grime, wear, dust
  const speckle = (ctx, r, x0, y0, w, h, colors, n) => {
    for (let i = 0; i < n; i++) P(ctx, colors[Math.floor(r() * colors.length)], x0 + Math.floor(r() * w), y0 + Math.floor(r() * h));
  };
  // a canvas the room keeps redrawing: screens, LEDs
  const liveTex = (w, h) => {
    const tex = canvasTex(w, h, () => {});
    return { ctx: tex.image.getContext('2d'), tex };
  };
  // frame time for things that turn
  let dt = 0;
  let lastT = null;
  onFrame((t) => {
    dt = lastT === null ? 0 : Math.min(0.1, t - lastT);
    lastT = t;
  });

  // Lain's shadows: the dark breaks into red dots instead of going black, but only in
  // the room's dark corners; the table under the lamp stays clean.
  post.uShadowCol.value.setRGB(0.42, 0.04, 0.07);
  post.uShadowAmt.value = 0.85;
  post.uClear.value.set(0.5, 0.3, 0.62);
  // a little less haze than the room asks for at first, so the far side keeps its shapes
  scene.fog.density = 0.3;

  // -- light: a caged work lamp, the CRTs' sick glow, a red sky through the window
  scene.add(new THREE.HemisphereLight(0x1a2a26, 0x020303, 0.3));
  const lamp = new THREE.Group();
  lamp.position.set(0, 1.86, -0.04);
  scene.add(lamp);
  const cord = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.7, 0.01), mat({ color: 0x0a0a0a }));
  cord.position.y = 0.35;
  const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.06, 8), mat({ color: 0x1c1f1e }));
  socket.position.y = 0.01;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.032, 6, 4), new THREE.MeshBasicMaterial({ color: 0xeafff2 }));
  bulb.position.y = -0.04;
  const cage = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 0.1, 6, 2, true),
    new THREE.MeshBasicMaterial({ color: 0x2a2f2c, wireframe: true }),
  );
  cage.position.y = -0.04;
  lamp.add(cord, socket, bulb, cage);
  const spot = new THREE.SpotLight(0xd8f5e6, 10, 4, 0.66, 0.5, 1.4);
  spot.position.set(0, -0.05, 0);
  spot.castShadow = true;
  spot.shadow.mapSize.set(512, 512);
  spot.shadow.bias = -0.002;
  lamp.add(spot);
  const spotTarget = new THREE.Object3D();
  spotTarget.position.set(0, TABLE_Y, -0.05);
  scene.add(spotTarget);
  spot.target = spotTarget;
  // a faint fill from your side, so the faces of things turned toward you aren't black
  const fill = new THREE.PointLight(0x9fe0c8, 0.9, 1.6, 1.4);
  fill.position.set(0, 1.25, 0.75);
  scene.add(fill);
  const sky = new THREE.DirectionalLight(0xff5a48, 0.3);
  sky.position.set(0, 2, -3);
  scene.add(sky);
  // the evening through the window spills red on the wall round it and rims the agent
  const spill = new THREE.PointLight(0xff5a40, 2.2, 1.6, 1.6);
  spill.position.set(0, 1.72, -1.3);
  scene.add(spill);
  // the lamp is on a tired circuit: now and then it sags for two or three seconds, wavers
  // a little and comes back. Slow and shallow, never a strobe (it was one, frame by frame),
  // and the table under it, where the eye rests, barely dims.
  let sagAt = 4;
  let sagLen = 2.4;
  const bulbOn = new THREE.Color(0xeafff2);
  const bulbDim = new THREE.Color(0x445048);
  onFrame((t) => {
    lamp.rotation.z = Math.sin(t * 0.8) * 0.05;
    lamp.rotation.x = Math.sin(t * 0.61) * 0.03;
    if (t > sagAt + sagLen) {
      sagAt = t + 5 + Math.random() * 9;
      sagLen = 2 + Math.random() * 1.2;
    }
    const u = (t - sagAt) / sagLen;
    const sag = u > 0 && u < 1 ? Math.sin(u * Math.PI) * (0.85 + 0.15 * Math.sin(u * Math.PI * 3)) : 0;
    spot.intensity = 10 * (1 - 0.08 * sag) + Math.sin(t * 0.6) * 0.08;
    bulb.material.color.copy(bulbOn).lerp(bulbDim, 0.35 * sag);
  });

  // -- the room: close walls of cast concrete panels, a low ceiling, a raised floor
  const concrete = (seed, rx, ry, [cr, cg, cb] = [20, 28, 26]) => {
    const t = canvasTex(64, 64, (ctx, w, h) => {
      const r = rng(seed);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const n = (r() - 0.5) * 8;
          P(ctx, `rgb(${cr + n},${cg + n},${cb + n})`, x, y);
        }
      // damp running down from the seams
      for (let i = 0; i < 6; i++) {
        const x = Math.floor(r() * w);
        for (let y = 2, len = 8 + r() * 40; y < len; y++) if (r() < 0.75) P(ctx, 'rgba(4,8,7,0.45)', x, y);
      }
      // the seams between panels, and a bolt in each corner bleeding rust
      P(ctx, '#080c0b', 0, 0, w, 1);
      P(ctx, '#26322f', 0, 1, w, 1);
      P(ctx, '#080c0b', 0, 0, 1, h);
      P(ctx, '#222c2a', 1, 0, 1, h);
      for (const [bx, by] of [[5, 5], [w - 6, 5], [5, h - 6], [w - 6, h - 6]]) {
        for (let y = by + 1; y < by + 4 + r() * 6; y++) P(ctx, 'rgba(80,28,20,0.45)', bx, y);
        P(ctx, '#3a4542', bx - 1, by - 1, 2, 2);
        P(ctx, '#56625e', bx - 1, by - 1);
      }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    return t;
  };
  // raised floor: 60cm tiles with a lip, one in four perforated for the cold air
  const floorTex = canvasTex(64, 64, (ctx) => {
    const r = rng(3);
    for (let ty = 0; ty < 2; ty++)
      for (let tx = 0; tx < 2; tx++) {
        const x0 = tx * 32;
        const y0 = ty * 32;
        P(ctx, '#161d1b', x0, y0, 32, 32);
        speckle(ctx, r, x0, y0, 32, 32, ['#1a2220', '#121816', '#1d2523'], 90);
        if (tx === 1 && ty === 0) for (let y = 4; y < 28; y += 2) for (let x = 4; x < 28; x += 2) P(ctx, '#070a09', x0 + x, y0 + y);
        P(ctx, '#27302d', x0, y0, 32, 1);
        P(ctx, '#27302d', x0, y0, 1, 32);
        P(ctx, '#050707', x0 + 31, y0, 1, 32);
        P(ctx, '#050707', x0, y0 + 31, 32, 1);
        P(ctx, '#050707', x0 + 3, y0 + 15, 3, 2); // the lifter's slot
      }
  });
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(3.33, 3.33);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), mat({ map: floorTex }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), mat({ color: 0x0a0e0d }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = 2.5;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.5), mat({ map: concrete(5, 6, 4, [62, 70, 66]) }));
  back.position.set(0, 1.25, -1.6);
  const left = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.5), mat({ map: concrete(7, 6, 4, [34, 42, 39]) }));
  left.rotation.y = Math.PI / 2;
  left.position.set(-1.35, 1.25, 0);
  const right = left.clone();
  right.rotation.y = -Math.PI / 2;
  right.position.x = 1.35;
  scene.add(floor, ceiling, back, left, right);
  const wallZ = -1.594;
  // something flat stuck to the back wall: paint, paper, a sign
  function decal(tex, w, h, x, y, opts = {}) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat({ map: tex, alphaTest: 0.5, ...opts }));
    m.position.set(x, y, wallZ);
    scene.add(m);
    return m;
  }

  // the window behind the agent's head, low enough that it shows over it: a red evening
  // through half-shut blinds, a utility pole and its wires
  const WIN_Y = 1.8;
  const skyTex = canvasTex(60, 30, (ctx, w, h) => {
    for (let y = 0; y < h; y++) {
      const k = y / h;
      ctx.fillStyle = `rgb(${120 + k * 120},${30 + k * 50},${40 + k * 10})`;
      ctx.fillRect(0, y, w, 1);
    }
    ctx.fillStyle = '#ffd9a0';
    ctx.fillRect(40, 21, 4, 4);
    ctx.fillStyle = '#120608';
    ctx.fillRect(18, 2, 2, h);
    ctx.fillRect(12, 6, 14, 1);
    ctx.fillRect(14, 10, 10, 1);
    for (let x = 0; x < w; x++) {
      ctx.fillRect(x, 6 + Math.round(Math.sin((x / w) * Math.PI) * 4), 1, 1);
      ctx.fillRect(x, 10 + Math.round(Math.sin((x / w) * Math.PI) * 3), 1, 1);
    }
    ctx.fillRect(0, 26, w, 4); // rooftops
    ctx.fillRect(46, 22, 8, 4);
    P(ctx, '#ffb070', 3, 27); // a lit window over there
    P(ctx, '#ffb070', 49, 23);
    // the blinds: shut tight at the top, tipped open lower down, one slat hanging crooked
    for (let y = 0; y < 17; y += 2) P(ctx, y < 7 ? '#1c0a0c' : '#2a1013', 0, y, w, y < 7 ? 2 : 1);
    for (let x = 34; x < 46; x++) P(ctx, '#2a1013', x, 17 + Math.floor((x - 34) / 4));
    P(ctx, '#3a1a1c', 0, 17, w, 1); // the bottom rail
    P(ctx, '#3a1a1c', 52, 0, 1, 23); // the pull cord
    P(ctx, '#3a1a1c', 51, 23, 3, 2);
    ctx.fillStyle = '#0c0606';
    ctx.fillRect(29, 0, 2, h); // the window's mullion
  });
  const win = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.48), new THREE.MeshBasicMaterial({ map: skyTex }));
  win.position.set(0, WIN_Y, -1.59);
  scene.add(win);
  const frameMat = mat({ color: 0x161c1a });
  for (const [w, h, x, y] of [[1.04, 0.04, 0, 0.26], [0.04, 0.52, -0.5, 0], [0.04, 0.52, 0.5, 0]]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), frameMat);
    f.position.set(x, WIN_Y + y, -1.58);
    scene.add(f);
  }
  const sill = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.03, 0.1), mat({ color: 0x2c3532 }));
  sill.position.set(0, WIN_Y - 0.255, -1.555);
  scene.add(sill);

  // a conduit along the wall over the agent's head, dropping to a junction box
  const pipeMat = mat({
    map: canvasTex(8, 2, (ctx) => {
      P(ctx, '#2a3431', 0, 0, 8, 2);
      P(ctx, '#56625e', 2, 0, 1, 2);
      P(ctx, '#121816', 6, 0, 1, 2);
    }),
  });
  const PIPE_Y = 1.5;
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.7, 8).rotateZ(Math.PI / 2), pipeMat);
  pipe.position.set(0, PIPE_Y, -1.56);
  const drop1 = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.24, 8), pipeMat);
  drop1.position.set(0.63, PIPE_Y - 0.12, -1.56);
  scene.add(pipe, drop1);
  const clampMat = mat({ color: 0x0e1312 });
  for (const x of [-1.0, -0.55, -0.12, 0.32, 0.9]) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.06, 0.05), clampMat);
    c.position.set(x, PIPE_Y, -1.57);
    scene.add(c);
  }
  const jbox = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.17, 0.06),
    mat({
      map: canvasTex(14, 17, (ctx, w, h) => {
        const r = rng(23);
        P(ctx, '#34433e', 0, 0, w, h);
        speckle(ctx, r, 0, 0, w, h, ['#2c3a35', '#3c4c46', '#4a2a20'], 26);
        P(ctx, '#46564f', 0, 0, w, 1);
        P(ctx, '#1a2220', 0, h - 1, w, 1);
        for (const [x, y] of [[1, 1], [w - 2, 1], [1, h - 2], [w - 2, h - 2]]) P(ctx, '#7a847e', x, y);
        // a warning triangle and the box's number
        for (let i = 0; i < 4; i++) P(ctx, '#c8a030', 7 - i, 3 + i, i * 2 + 1, 1);
        P(ctx, '#1a1408', 7, 4, 1, 2);
        text3(ctx, 'JB7', 2, 10, '#141a18');
      }),
    }),
  );
  jbox.position.set(0.63, PIPE_Y - 0.31, -1.565);
  scene.add(jbox);

  // painted on the wall over the agent's head: the room's number stencilled, a band of
  // faded paint under it
  decal(
    canvasTex(72, 14, (ctx, w) => {
      const r = rng(31);
      text3(ctx, 'B2-03', 3, 2, '#141e1b');
      text3(ctx, t('ui.roulette.scene.room'), 26, 3, '#141e1b');
      text3(ctx, t('ui.roulette.scene.cooling'), 50, 3, '#141e1b');
      // the stencil's bridges and paint flaked off
      for (let i = 0; i < 14; i++) ctx.clearRect(2 + Math.floor(r() * 40), 2 + Math.floor(r() * 6), 1, 1);
      for (let x = 0; x < w; x++) if (r() < 0.86) P(ctx, '#2e6a58', x, 9, 1, 2 + (r() < 0.2 ? 1 : 0));
    }),
    1.44,
    0.28,
    0,
    PIPE_Y - 0.14,
  );
  // a sheet taped up beside the window, gone soft with damp
  decal(
    canvasTex(24, 32, (ctx, w, h) => {
      const r = rng(37);
      P(ctx, '#a29e8c', 0, 0, w, h);
      speckle(ctx, r, 0, 0, w, h, ['#968f7a', '#aaa692', '#8a8470'], 50);
      P(ctx, '#a02a30', 2, 2, w - 4, 2);
      ctx.drawImage(pixelText(t('ui.roulette.scene.doNot'), { color: '#2a2620' }), 0, 6);
      ctx.drawImage(pixelText(t('ui.roulette.scene.shutDown'), { color: '#2a2620' }), 0, 19);
      P(ctx, '#c4c0ac', 0, 0, 4, 2);
      P(ctx, '#c4c0ac', w - 4, 0, 4, 2);
      ctx.clearRect(w - 2, h - 3, 2, 3); // a torn corner
    }),
    0.2,
    0.27,
    -0.62,
    WIN_Y - 0.12,
  );

  // a camera monitor bolted on the left wall, turned toward you: the room keeps an eye on
  // your chair. Now and then something small and orange leans into the shot, then goes.
  // Under the HUD's corner, in full view (high on the back wall only a corner of it showed).
  const camFeed = liveTex(32, 24);
  const camMon = new THREE.Group();
  const camBody = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.17, 0.15), mat({ color: 0x1c2321 }));
  const camScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.135), new THREE.MeshBasicMaterial({ map: camFeed.tex }));
  camScreen.position.z = 0.076;
  const camArm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.14), clampMat);
  camArm.position.set(0, 0.04, -0.12);
  camMon.add(camBody, camScreen, camArm);
  camMon.position.set(-1.25, 1.22, -0.55);
  camMon.rotation.set(0, Math.PI / 2 - 0.5, 0);
  camMon.rotateX(0.12);
  scene.add(camMon);
  const camPeek = { next: 9000, start: -1e9 };
  function drawCam(now) {
    const { ctx } = camFeed;
    P(ctx, '#06140f', 0, 0, 32, 24);
    // you, from the wall: head, shoulders, the table's edge in front
    P(ctx, '#0e2a22', 0, 19, 32, 5);
    P(ctx, '#2a6a56', 0, 19, 32, 1);
    P(ctx, '#123a2e', 9, 14, 14, 5);
    P(ctx, '#123a2e', 11, 13, 10, 1);
    P(ctx, '#123a2e', 13, 7, 6, 6);
    P(ctx, '#123a2e', 14, 6, 4, 1);
    P(ctx, '#2f7a62', 13, 7, 1, 5);
    P(ctx, '#2f7a62', 9, 14, 1, 4);
    text3(ctx, 'CAM2', 1, 1, '#4fbf98');
    if (Math.floor(now / 1000) % 2) P(ctx, '#ff2e3e', 28, 1, 2, 2);
    const d = new Date();
    text3(ctx, `${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`, 12, 1, '#2f9f78');
    // the visitor: in from the right edge, a look, and out again
    if (now > camPeek.next) {
      camPeek.start = now;
      camPeek.next = now + 26000 + Math.random() * 20000;
    }
    const k = (now - camPeek.start) / 4200;
    if (k < 1) {
      const x = Math.round(32 - 7 * Math.min(1, k * 5, (1 - k) * 5));
      P(ctx, '#d08060', x, 12, 7, 5);
      P(ctx, '#d08060', x - 1, 14, 1, 2);
      P(ctx, '#140806', x + 1, 13, 1, 2);
      P(ctx, '#140806', x + 4, 13, 1, 2);
    }
    for (let y = 0; y < 24; y += 2) P(ctx, 'rgba(0,0,0,0.3)', 0, y, 32, 1);
    camFeed.tex.needsUpdate = true;
  }
  let nextCam = 0;
  onFrame((t, now) => {
    if (now < nextCam) return;
    drawCam(now);
    nextCam = now + 250;
  });

  // -- cables: hanging from the ceiling and swaying a little in the fans' draught,
  // dropping down the walls in tied bundles, snaking over the floor. Each has a lit
  // edge along it, so it reads as round.
  const cableTex = (base, hi, lo) =>
    canvasTex(2, 8, (ctx) => {
      P(ctx, base, 0, 0, 2, 8);
      P(ctx, hi, 0, 2, 2, 1);
      P(ctx, lo, 0, 6, 2, 1);
    });
  const cableMat = mat({ map: cableTex('#0b0e0d', '#2a3431', '#050606') });
  const cableMats = [
    cableMat,
    cableMat,
    cableMat,
    mat({ map: cableTex('#10261f', '#2c5a4a', '#06100c') }), // green
    mat({ map: cableTex('#3e3a2e', '#6a6452', '#201e18') }), // old beige
  ];
  const cableRed = mat({ map: cableTex('#3a0d10', '#6a2026', '#1a0506') });
  const pickCable = () => (rand() < 0.15 ? cableRed : cableMats[Math.floor(rand() * cableMats.length)]);
  function cable(points, r = 0.012, m = cableMat, parent = scene) {
    const curve = new THREE.CatmullRomCurve3(points);
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, r, 4, false), m);
    mesh.castShadow = true;
    parent.add(mesh);
    mesh.userData.curve = curve;
    return mesh;
  }
  const ties = [];
  const swaying = [];
  for (let i = 0; i < 18; i++) {
    const a = new THREE.Vector3(-1.3 + rand() * 2.6, 2.5, -1.55 + rand() * 1.4);
    const b = new THREE.Vector3(-1.3 + rand() * 2.6, 2.5, -1.55 + rand() * 1.9);
    const sag = 0.45 + rand() * 0.55;
    const pts = [];
    for (let k = 0; k <= 8; k++) {
      const s = k / 8;
      const p = a.clone().lerp(b, s);
      p.y -= Math.sin(s * Math.PI) * sag;
      pts.push(p.sub(a));
    }
    // it swings about the line between its two hooks, as a hanging cable does
    const pivot = new THREE.Group();
    pivot.position.copy(a);
    scene.add(pivot);
    cable(pts, 0.008 + rand() * 0.01, pickCable(), pivot);
    swaying.push({ pivot, axis: b.clone().sub(a).normalize(), amp: 0.012 + rand() * 0.025, w: 0.25 + rand() * 0.35, ph: rand() * 6 });
  }
  for (let i = 0; i < 10; i++) {
    const x = (rand() < 0.5 ? -1 : 1) * (0.9 + rand() * 0.4);
    const z = -1.5 + rand() * 1.2;
    const n = 1 + Math.floor(rand() * 3);
    let main = null;
    for (let j = 0; j < n; j++) {
      const o = new THREE.Vector3((j - (n - 1) / 2) * 0.022, 0, (j % 2) * 0.012);
      const c = cable(
        [new THREE.Vector3(x, 2.5, z), new THREE.Vector3(x * 0.98, 1.6, z + 0.05), new THREE.Vector3(x * 0.95, 0.4, z + 0.12), new THREE.Vector3(x * 0.7, 0.01, z + 0.4)].map((p, k) => (k < 3 ? p.add(o) : p.add(o.clone().multiplyScalar(2)))),
        0.01 + rand() * 0.008,
        j === 0 ? cableMat : pickCable(),
      );
      main ??= c;
    }
    // zip ties every so often down the bundle, a yellow tag on some
    for (const s of [0.22, 0.42, 0.62]) ties.push({ curve: main.userData.curve, s, r: 0.012 + n * 0.012, color: rand() < 0.2 ? 0xc8a030 : 0x8a8a7c });
  }
  for (let i = 0; i < 12; i++) {
    const pts = [];
    let x = -1.2 + rand() * 2.4;
    let z = -1.5;
    for (let k = 0; k < 6; k++) {
      pts.push(new THREE.Vector3(x, 0.012, z));
      x += (rand() - 0.5) * 0.5;
      z += 0.35 + rand() * 0.2;
    }
    cable(pts, 0.012, pickCable());
  }
  {
    const tieMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat({ color: 0xffffff }), ties.length);
    const Y = new THREE.Vector3(0, 1, 0);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    ties.forEach((k, i) => {
      q.setFromUnitVectors(Y, k.curve.getTangentAt(k.s));
      m4.compose(k.curve.getPointAt(k.s), q, new THREE.Vector3(k.r * 2, 0.01, k.r * 2));
      tieMesh.setMatrixAt(i, m4);
      tieMesh.setColorAt(i, new THREE.Color(k.color));
    });
    scene.add(tieMesh);
  }
  let fanSpeed = 1; // the fans idle; a hit spins them up and they wind back down
  let alarm = 0;
  onFrame((t) => {
    for (const s of swaying) s.pivot.quaternion.setFromAxisAngle(s.axis, Math.sin(t * s.w + s.ph) * s.amp * (0.6 + fanSpeed * 0.4));
    fanSpeed += ((alarm > 0 ? 9 : 1) - fanSpeed) * Math.min(1, dt * (alarm > 0 ? 3 : 0.5));
  });


  // -- racks either side behind the agent. Each front is drawn once, unit by unit
  // (servers, a patch panel with its cords, a switch, disk shelves, a fan tray, a UPS),
  // faintly self-lit so it holds up in the dark; its LEDs sit on a layer of their own,
  // redrawn on their own rhythms: steady, slow blink, a heartbeat, disk chatter, and one
  // red fault light that never gets fixed.
  const LED = { green: '#7dffc8', amber: '#ffb347', red: '#ff2e3e', blue: '#9fd0ff' };
  const UNIT_H = { '1u': 5, '2u': 9, patch: 5, switch: 5, blank: 4, disks: 13, fans: 10, ups: 16, empty: 8 };
  const fanTex = canvasTex(16, 16, (ctx) => {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const dx = x - 7.5;
        const dy = y - 7.5;
        const r = Math.hypot(dx, dy);
        if (r > 7.6) continue;
        const blade = ((((Math.atan2(dy, dx) + r * 0.2) * 5) / (2 * Math.PI)) % 1 + 1) % 1 < 0.42;
        if (r < 2.2) P(ctx, r < 1 ? '#56625e' : '#3a4542', x, y);
        else if (blade) P(ctx, r > 6 ? '#2a3431' : '#36423e', x, y);
      }
  });
  const fanMat = mat({ map: fanTex, alphaTest: 0.5, emissive: 0x6a6a6a, emissiveMap: fanTex });
  const fans = [];
  const rackSide = canvasTex(24, 80, (ctx, w, h) => {
    const r = rng(19);
    P(ctx, '#0b100e', 0, 0, w, h);
    for (const y0 of [6, 58])
      for (let y = y0; y < y0 + 14; y += 2) {
        P(ctx, '#18201d', 4, y, 16, 1);
        P(ctx, '#030504', 4, y + 1, 16, 1);
      }
    // the asset sticker, a barcode on it
    P(ctx, '#5e5c4e', 6, 34, 11, 6);
    for (let x = 7; x < 16; x++) if (r() < 0.6) P(ctx, '#1a1a14', x, 35, 1, 3);
    for (let y = 2; y < h; y += 8) {
      P(ctx, '#26302d', 1, y);
      P(ctx, '#26302d', w - 2, y);
    }
  });
  const racks = [];
  function rack(x, z, rotY, plan, seed, label) {
    const r = rng(seed);
    const W = 48;
    const H = 160;
    const leds = [];
    const cords = [];
    const fanAt = [];
    const led = (lx, ly, color, kind) => leds.push({ x: lx, y: ly, color, kind, period: 1.6 + r() * 3.5, phase: r(), on: false, until: 0 });
    const face = (ctx, y, h, col = '#1d2724') => {
      P(ctx, col, 4, y, W - 8, h);
      P(ctx, '#2e3a36', 4, y, W - 8, 1); // its top edge catches the light
      P(ctx, '#070a09', 4, y + h - 1, W - 8, 1);
      P(ctx, '#5a6460', 5, y + 1);
      P(ctx, '#5a6460', W - 6, y + 1);
      if (h > 6) {
        P(ctx, '#5a6460', 5, y + h - 3);
        P(ctx, '#5a6460', W - 6, y + h - 3);
      }
    };
    const pick = (...c) => c[Math.floor(r() * c.length)];
    function unit(ctx, kind, y, h) {
      switch (kind) {
        case '1u':
          face(ctx, y, h);
          for (let i = 0; i < 4; i++) {
            P(ctx, '#111816', 9 + i * 6, y + 1, 5, 2);
            P(ctx, '#3a4643', 9 + i * 6, y + 3, 5, 1);
          }
          for (let vx = 33; vx < 37; vx += 2) P(ctx, '#070a09', vx, y + 2);
          led(38, y + 2, LED.green, 'steady');
          led(40, y + 2, pick(LED.green, LED.amber), 'act');
          break;
        case '2u':
          face(ctx, y, h);
          for (let vy = y + 2; vy < y + 7; vy += 2) for (let vx = 7 + ((vy - y) % 4 === 0 ? 1 : 0); vx < 19; vx += 2) P(ctx, '#070a09', vx, vy);
          for (let i = 0; i < 6; i++) {
            P(ctx, '#2a3431', 21 + i * 3, y + 2, 2, 6);
            P(ctx, '#0f1513', 21 + i * 3, y + 4, 2, 2);
            led(21 + i * 3, y + 1, LED.green, 'act');
          }
          P(ctx, '#6a6858', 8, y + 7, 7, 1); // a paper label, handwritten
          led(40, y + 2, pick(LED.green, LED.blue), 'steady');
          break;
        case 'patch':
          face(ctx, y, h, '#161d1b');
          for (let i = 0; i < 12; i++) {
            P(ctx, '#020303', 7 + i * 3, y + 1, 2, 2);
            P(ctx, '#3a4643', 7 + i * 3, y + 4);
            if (r() < 0.4) cords.push({ x: 7 + i * 3, y: y + 3, len: 4 + r() * 12, side: r() < 0.5 ? -1 : 1, color: pick('#8a7a38', '#2a5070', '#7a2a30', '#5a625e', '#2a6a50') });
          }
          break;
        case 'switch':
          face(ctx, y, h);
          for (let i = 0; i < 15; i++) {
            P(ctx, '#020303', 7 + i * 2, y + 2, 1, 2);
            led(7 + i * 2, y + 1, r() < 0.2 ? LED.amber : LED.green, r() < 0.8 ? 'act' : 'steady');
          }
          led(40, y + 2, LED.green, 'heart');
          break;
        case 'blank':
          face(ctx, y, h, '#171e1c');
          P(ctx, '#6d6a58', 14, y + 1, 12, 2);
          for (let i = 0; i < 10; i++) if (r() < 0.6) P(ctx, '#2a2820', 15 + i, y + 1 + (r() < 0.5 ? 0 : 1));
          break;
        case 'disks': {
          face(ctx, y, h, '#141a18');
          const fault = Math.floor(r() * 7);
          for (let i = 0; i < 7; i++) {
            const cx = 6 + i * 5;
            P(ctx, '#29322f', cx, y + 1, 4, h - 2);
            P(ctx, '#0c1210', cx + 1, y + 2, 2, h - 6);
            P(ctx, '#4a5652', cx, y + h - 3, 4, 1);
            led(cx + 3, y + 2, LED.green, 'act');
            if (i === fault && seed % 2) led(cx + 3, y + 4, LED.red, 'fault');
          }
          break;
        }
        case 'fans':
          face(ctx, y, h);
          for (const cx of [15, 32]) {
            for (let dy = -4; dy <= 4; dy++)
              for (let dx = -4; dx <= 4; dx++) {
                const d = Math.hypot(dx, dy);
                if (d <= 4.3) P(ctx, d > 3.4 ? '#2a3431' : d > 1.6 && d < 2.4 ? '#0f1c18' : '#030605', cx + dx, y + 5 + dy);
              }
            fanAt.push({ x: cx + 0.5, y: y + 5.5 });
          }
          led(40, y + 2, LED.green, 'steady');
          break;
        case 'ups':
          face(ctx, y, h, '#1a2220');
          P(ctx, '#1e4a30', 8, y + 3, 18, 7);
          text3(ctx, '230V', 9, y + 4, '#0a1e12');
          P(ctx, '#3a4643', 29, y + 4, 2, 2);
          P(ctx, '#3a4643', 32, y + 4, 2, 2);
          text3(ctx, 'UPS', 29, y + 8, '#34403c');
          led(37, y + 4, LED.green, 'steady');
          led(39, y + 4, LED.green, 'steady');
          led(41, y + 4, LED.amber, 'blink');
          for (let vx = 8; vx < 41; vx += 2) P(ctx, '#070a09', vx, y + 12, 1, 2);
          break;
        default: // empty: the dark inside, cables running down it
          P(ctx, '#030504', 4, y, W - 8, h);
          for (const cx of [11, 12, 30]) P(ctx, '#121a17', cx, y, 1, h);
          P(ctx, '#8a8a7c', 10, y + 3, 4, 1);
      }
    }
    const frontTex = canvasTex(W, H, (ctx) => {
      P(ctx, '#070a09', 0, 0, W, H);
      for (const px of [0, W - 4]) {
        P(ctx, '#1c2523', px, 0, 4, H);
        P(ctx, '#2e3a36', px, 0, 1, H);
        P(ctx, '#0a0e0d', px + 3, 0, 1, H);
        for (let y = 3; y < H; y += 3) P(ctx, '#040605', px + 1, y, 2, 1);
      }
      P(ctx, '#151c1a', 0, 0, W, 7);
      P(ctx, '#7c7a6a', 16, 1, 15, 6);
      text3(ctx, label, 18, 2, '#1a1a14');
      let y = 8;
      for (const kind of plan) {
        if (y + UNIT_H[kind] > H - 7) break;
        unit(ctx, kind, y, UNIT_H[kind]);
        y += UNIT_H[kind];
      }
      if (y < H - 7) unit(ctx, 'empty', y, H - 7 - y);
      // patch cords drop from their ports and sag over to the posts
      for (const c of cords) {
        const x1 = c.side > 0 ? W - 5 : 4;
        const y1 = c.y + c.len;
        for (let s = 0; s <= 1; s += 1 / 48) P(ctx, c.color, Math.round(c.x + (x1 - c.x) * s), Math.round(c.y + (y1 - c.y) * s + Math.sin(s * Math.PI) * c.len * 0.4));
      }
      P(ctx, '#121816', 0, H - 7, W, 7);
      for (let vx = 6; vx < W - 6; vx += 3) P(ctx, '#040605', vx, H - 5, 2, 2);
      // scuffs on the posts, dust along the top edges
      speckle(ctx, r, 0, 0, 4, H, ['#3a4643', '#0a0e0d'], 14);
      speckle(ctx, r, W - 4, 0, 4, H, ['#3a4643', '#0a0e0d'], 14);
      for (const l of leds) P(ctx, l.color === LED.red ? '#240709' : l.color === LED.amber ? '#22180a' : '#0c1f18', l.x, l.y);
    });
    const g = new THREE.Group();
    const side = mat({ map: rackSide });
    const front = mat({ map: frontTex, emissive: 0x8a9692, emissiveMap: frontTex });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.9, 0.6), [side, side, mat({ color: 0x0b100e }), side, front, side]);
    body.position.y = 0.95;
    body.castShadow = true;
    g.add(body);
    // the LEDs: a layer in front of the face, unfogged, so they prick through the haze
    const layer = liveTex(W, H);
    const lit = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 1.9), new THREE.MeshBasicMaterial({ map: layer.tex, transparent: true, alphaTest: 0.5, fog: false }));
    lit.position.set(0, 0.95, 0.302);
    g.add(lit);
    for (const f of fanAt) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.098, 0.098), fanMat);
      m.position.set((f.x / W - 0.5) * 0.55, (1 - f.y / H) * 1.9, 0.301);
      m.rotation.z = r() * 6;
      g.add(m);
      fans.push(m);
    }
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    scene.add(g);
    racks.push({ leds, layer, g });
  }
  rack(-0.88, -1.22, 0.4, ['patch', 'switch', '1u', '1u', 'blank', '2u', '2u', 'disks', 'empty', 'fans', '1u', '2u', 'blank', '1u', 'empty', 'disks', '2u', 'ups'], 1, 'R07');
  rack(0.88, -1.22, -0.4, ['switch', 'patch', 'patch', '2u', '1u', '1u', 'fans', 'disks', 'blank', '2u', 'empty', '1u', '1u', '2u', 'disks', 'blank', 'empty', 'ups'], 2, 'R08');
  function ledOn(l, t) {
    const k = (t / l.period + l.phase) % 1;
    switch (l.kind) {
      case 'steady':
        return true;
      case 'blink':
        return k < 0.5;
      case 'heart':
        return k < 0.05 || (k > 0.1 && k < 0.15);
      case 'fault':
        return k < 0.12;
      default:
        // disk and network chatter: a state held for a while, then another
        if (t > l.until) {
          l.on = Math.random() < 0.35;
          l.until = t + 0.15 + Math.random() * 0.8;
        }
        return l.on;
    }
  }
  // keep: which LEDs to draw (all of them but for the launch video's wave)
  function drawLeds({ leds, layer }, t, keep = null) {
    layer.ctx.clearRect(0, 0, 48, 160);
    for (const l of leds) {
      if (keep && !keep(l)) continue;
      if (alarm > 0) {
        if (Math.sin(t * 30) > 0) P(layer.ctx, LED.red, l.x, l.y);
      } else if (ledOn(l, t)) P(layer.ctx, l.color, l.x, l.y);
    }
  }
  // on: the launch video's hooks have taken the LEDs over (pv-machine.js)
  const pvRacks = { on: false, draw: drawLeds };
  let nextLeds = 0;
  onFrame((t, now) => {
    for (const f of fans) f.rotation.z -= dt * fanSpeed * 1.4;
    if (pvRacks.on || now < nextLeds) return;
    nextLeds = now + (alarm > 0 ? 60 : 100);
    for (const rack of racks) {
      drawLeds(rack, t);
      rack.layer.tex.needsUpdate = true;
    }
  });
  onFrame(() => (alarm = Math.max(0, alarm - 1 / 60)));

  // -- CRTs: yellowed beige monitors on old UPS boxes, scrolling the agent's logs
  const crts = [];
  const textCache = new Map();
  const glyphs = (text, color) => {
    const k = text + color;
    if (!textCache.has(k)) textCache.set(k, pixelText(text, { color }));
    return textCache.get(k);
  };
  // a log line drawn once in the 3x5 font, kept while it is on some screen
  const lineCache = new Map();
  const lineImg = (text, color) => {
    const k = color + text;
    let c = lineCache.get(k);
    if (!c) {
      c = document.createElement('canvas');
      c.width = 48;
      c.height = 7;
      c.textWidth = text3(c.getContext('2d'), text, 0, 1, color);
      if (lineCache.size > 240) lineCache.clear();
      lineCache.set(k, c);
    }
    return c;
  };
  const beigeTex = (seed, w, h, draw) =>
    canvasTex(w, h, (ctx) => {
      const r = rng(seed);
      P(ctx, '#8d8a7c', 0, 0, w, h);
      speckle(ctx, r, 0, 0, w, h, ['#858273', '#949182', '#7b7869', '#6e6a58'], Math.floor((w * h) / 8));
      draw(ctx, r);
    });
  const crtSide = mat({
    map: beigeTex(43, 24, 24, (ctx) => {
      for (let y = 4; y < 20; y += 3) P(ctx, '#4a473e', 2, y, 8, 1); // vents toward the back
      P(ctx, '#a29f90', 0, 0, 24, 1);
    }),
  });
  const crtTop = mat({
    map: beigeTex(47, 24, 24, (ctx) => {
      for (let y = 3; y < 21; y += 2) P(ctx, '#4a473e', 4, y, 16, 1);
    }),
  });
  const crtFace = (sticker) =>
    beigeTex(53 + sticker, 46, 40, (ctx, r) => {
      // the bevel round the glass; the light from above on the top and left edges
      P(ctx, '#a6a394', 0, 0, 46, 1);
      P(ctx, '#a6a394', 0, 0, 1, 40);
      P(ctx, '#5e5b50', 0, 39, 46, 1);
      P(ctx, '#5e5b50', 45, 0, 1, 40);
      P(ctx, '#4a473e', 2, 2, 42, 33);
      P(ctx, '#b0ad9e', 2, 35, 42, 1);
      // badge, power light, two knobs, a worn patch where thumbs find the switch
      text3(ctx, 'MOYU', 4, 35, '#3e3b32');
      P(ctx, '#3a6a54', 29, 37, 2, 1);
      for (const kx of [34, 39]) {
        P(ctx, '#4a473e', kx, 36, 3, 3);
        P(ctx, '#6e6a5c', kx, 36);
      }
      speckle(ctx, r, 26, 36, 6, 3, ['#a09c8a'], 6);
      if (sticker === 1) {
        // a sticky note somebody drew the agent on
        P(ctx, '#c8b850', 35, 0, 10, 8);
        P(ctx, '#d8c860', 35, 0, 10, 1);
        P(ctx, '#d08060', 37, 2, 6, 4);
        P(ctx, '#1a0e0a', 38, 3);
        P(ctx, '#1a0e0a', 41, 3);
      }
    });
  const glowTex = canvasTex(16, 16, (ctx) => {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const d = Math.max(Math.abs(x - 7.5) / 8, Math.abs(y - 7.5) / 8);
        P(ctx, `rgba(90,230,190,${d < 0.62 ? 0 : Math.max(0, 1 - d) * 1.2})`, x, y);
      }
  });
  function crt(x, y, z, rotY, size, title, signal, sticker = 0) {
    const { ctx, tex } = liveTex(48, 36);
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(size * 1.15, size, size * 1.05), [crtSide, crtSide, crtTop, crtSide, mat({ map: crtFace(sticker) }), crtSide]);
    body.castShadow = true;
    // the tube's housing out the back
    const neck = new THREE.Mesh(new THREE.BoxGeometry(size * 0.78, size * 0.68, size * 0.5), crtSide);
    neck.position.set(0, -size * 0.05, -size * 0.75);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(size * 0.95, size * 0.72), new THREE.MeshBasicMaterial({ map: tex }));
    screen.position.set(0, size * 0.04, size * 0.53);
    // the glass's glow bleeding past its edge
    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(size * 1.5, size * 1.2),
      new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    halo.position.set(0, size * 0.04, size * 0.56);
    g.add(body, neck, screen, halo);
    const glow = new THREE.PointLight(0x5fe0c0, 0.6, 1.3, 1.6);
    glow.position.set(0, 0, size * 0.9);
    g.add(glow);
    g.position.set(x, y, z);
    g.rotation.y = rotY;
    scene.add(g);
    // screen: the glass, for a director's script to put its own picture on (while
    // screen.userData.custom is set the room stops drawing it; web/play/director/screens.js)
    const state = { ctx, tex, screen, halo, lines: [], alertUntil: 0, glow, title, signal, graph: Array(23).fill(1), nextTick: 0, dipUntil: 0, nextDip: 4000 + Math.random() * 8000 };
    crts.push(state);
    return state;
  }
  // the boxes the CRTs stand on: old UPS units, vents and a model plate, a lamp
  const crateFront = canvasTex(32, 48, (ctx, w, h) => {
    const r = rng(17);
    P(ctx, '#1a1f1c', 0, 0, w, h);
    speckle(ctx, r, 0, 0, w, h, ['#202623', '#141917', '#2a302d'], 70);
    P(ctx, '#2e3633', 0, 0, w, 1);
    P(ctx, '#2e3633', 0, 0, 1, h);
    P(ctx, '#0a0d0c', w - 1, 0, 1, h);
    P(ctx, '#0a0d0c', 0, h - 1, w, 1);
    for (let y = 5; y < 19; y += 2) P(ctx, '#080a09', 4, y, 24, 1);
    P(ctx, '#66645a', 4, 23, 24, 10);
    text3(ctx, 'UPS-2', 6, 24, '#1a1a14');
    for (let x = 5; x < 27; x++) if (r() < 0.55) P(ctx, '#2a2a20', x, 30, 1, 2);
    P(ctx, '#080a09', 4, 38, 7, 5);
    P(ctx, '#3a4542', 5, 39, 5, 3);
    P(ctx, '#ffb347', 25, 39, 2, 2);
  });
  const crateSide = canvasTex(32, 48, (ctx, w, h) => {
    const r = rng(13);
    P(ctx, '#171c1a', 0, 0, w, h);
    speckle(ctx, r, 0, 0, w, h, ['#1e2421', '#111513'], 60);
    P(ctx, '#2a322f', 0, 0, w, 1);
    for (let y = 3; y < h; y += 6) {
      P(ctx, '#2e3633', 2, y);
      P(ctx, '#2e3633', w - 3, y);
    }
  });
  function crate(x, z, w, h, d, rotY) {
    const side = mat({ map: crateSide });
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, side, side, mat({ map: crateFront }), side]);
    m.position.set(x, h / 2, z);
    m.rotation.y = rotY;
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  }
  crate(-0.82, -0.5, 0.4, 0.62, 0.4, 0.6);
  const tty1 = crt(-0.82, 0.62 + 0.16, -0.5, 0.6, 0.32, 'TTY1', 'load', 1);
  opp.setProps({ crt: tty1.glow }); // avatar: what it glances at while it thinks
  crate(0.86, -0.42, 0.42, 0.56, 0.42, -0.5);
  crt(0.86, 0.56 + 0.15, -0.42, -0.5, 0.3, 'TTY2', 'pulse');
  crt(0.84, 0.56 + 0.3 + 0.13, -0.45, -0.62, 0.26, 'TTY3', 'wave');
  // their leads, down the back of the boxes to the floor
  cable([new THREE.Vector3(-0.93, 0.7, -0.72), new THREE.Vector3(-1.0, 0.45, -0.78), new THREE.Vector3(-1.04, 0.05, -0.8), new THREE.Vector3(-1.2, 0.012, -0.6)], 0.009);
  cable([new THREE.Vector3(1.0, 0.85, -0.66), new THREE.Vector3(1.08, 0.5, -0.7), new THREE.Vector3(1.1, 0.05, -0.74), new THREE.Vector3(1.25, 0.012, -0.5)], 0.009, cableMats[4]);

  const CHATTER = ['> wait seat', 'tok 2048/200k', 'eval pending', 'loss 2.71', '[ok] sealed', 'grad 0.0031', 'ping you', 'temp 1.0', 'ctx 61%', '> load', 'rng hmac256', 'seat 1 ready', '...', t('ui.roulette.scene.sure'), 'retry 1/3', 'fan2 3120rpm', 'temp 41c', 'heartbeat ok', 'pid 4096 sleep', 'watching', 'hello?', t('ui.roulette.scene.here'), 'kv cache 88%'];
  // each screen's footer: a little trace scrolling past (load, a pulse, a slow wave)
  function tickGraph(s, now) {
    let v;
    if (s.signal === 'pulse') {
      const k = Math.floor(now / 200) % 9;
      v = k === 0 ? 5 : k === 1 ? 0 : 2;
    } else if (s.signal === 'wave') v = Math.round(2.5 + Math.sin(now / 700) * 2.4);
    else v = Math.max(0, Math.min(5, s.graph[s.graph.length - 1] + Math.round((Math.random() - 0.5) * 2.4)));
    s.graph.push(v);
    s.graph.shift();
  }
  // 48x36 is about the size a screen comes out at in the room, so its pixels stay pixels
  const SW = 48;
  const SH = 36;
  function drawCrt(s, now) {
    const { ctx } = s;
    if (now < s.alertUntil) {
      P(ctx, Math.floor(now / 90) % 2 ? '#5a0610' : '#b0101e', 0, 0, SW, SH);
      text3(ctx, 'ERR', 18, 5, '#ffe0e0');
      const g = glyphs(t('terms.quota').toUpperCase(), '#ffe0e0');
      ctx.drawImage(g, Math.round((SW - g.width) / 2), 15);
    } else {
      P(ctx, '#031410', 0, 0, SW, SH);
      // title bar with the time, its colon ticking
      P(ctx, '#0f4a3a', 0, 0, SW, 7);
      text3(ctx, s.title, 2, 1, '#031410');
      const d = new Date();
      text3(ctx, `${String(d.getHours()).padStart(2, '0')}${d.getSeconds() % 2 ? ':' : ' '}${String(d.getMinutes()).padStart(2, '0')}`, 28, 1, '#031410');
      // the last four lines of the log, the newest bright, a cursor after it
      const shown = s.lines.slice(-4);
      let end = 2;
      shown.forEach((line, i) => {
        const img = lineImg(line, i === shown.length - 1 ? '#c8ffe8' : '#4fbf98');
        ctx.drawImage(img, 2, 7 + i * 6);
        end = 2 + img.textWidth + 2;
      });
      if (Math.floor(now / 500) % 2) P(ctx, '#c8ffe8', Math.min(SW - 3, end), 8 + Math.max(0, shown.length - 1) * 6, 2, 5);
      // the trace along the bottom
      P(ctx, '#0a2a20', 0, 31, SW, 1);
      s.graph.forEach((v, i) => v && P(ctx, '#2f9f78', 1 + i * 2, SH - Math.min(4, v), 1, Math.min(4, v)));
      // a bright band rolls down the glass, slowly
      P(ctx, 'rgba(170,255,225,0.09)', 0, Math.floor((now / 90) % 56) - 10, SW, 3);
      if (now < s.dipUntil) P(ctx, 'rgba(0,0,0,0.3)', 0, 0, SW, SH);
    }
    // scanlines, and the tube's rounded corners
    for (let y = 1; y < SH; y += 2) P(ctx, 'rgba(0,0,0,0.2)', 0, y, SW, 1);
    for (const [cx, cy, dx, dy] of [[0, 0, 1, 1], [SW - 1, 0, -1, 1], [0, SH - 1, 1, -1], [SW - 1, SH - 1, -1, -1]]) {
      P(ctx, '#000', cx, cy, 1, 1);
      P(ctx, '#000', cx + dx, cy, 1, 1);
      P(ctx, '#000', cx, cy + dy, 1, 1);
    }
    s.tex.needsUpdate = true;
  }
  function crtWrite(text, which = null) {
    for (const [i, s] of crts.entries()) {
      if (which !== null && i !== which) continue;
      s.lines.push(text);
      while (s.lines.length > 5) s.lines.shift();
    }
  }
  let nextChatter = 0;
  let nextDraw = 0;
  onFrame((t, now) => {
    if (now > nextChatter) {
      crtWrite(CHATTER[Math.floor(Math.random() * CHATTER.length)], Math.floor(Math.random() * crts.length));
      nextChatter = now + 300 + Math.random() * 900;
    }
    if (now > nextDraw) {
      for (const s of crts) {
        if (now > s.nextTick) {
          tickGraph(s, now);
          s.nextTick = now + 200;
        }
        // now and then the tube sags for a moment, as old ones do
        if (now > s.nextDip) {
          s.dipUntil = now + 70;
          s.nextDip = now + 6000 + Math.random() * 9000;
        }
        if (!s.screen.userData.custom) drawCrt(s, now);
      }
      nextDraw = now + 80;
    }
    for (const s of crts) s.glow.intensity = (now < s.dipUntil ? 0.4 : 0.55) + Math.sin(t * 90) * 0.04;
  });

  // -- coolant mist drifting through the light, and dust turning slowly in the lamp
  const mistTex = canvasTex(32, 32, (ctx) => {
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++) {
        const d = Math.hypot(x - 16, y - 16) / 16;
        const a = Math.max(0, 1 - d) * 0.5;
        ctx.fillStyle = `rgba(150,220,200,${a})`;
        ctx.fillRect(x, y, 1, 1);
      }
  });
  const mists = [];
  for (let i = 0; i < 7; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex, transparent: true, opacity: 0.1, depthWrite: false }));
    s.scale.setScalar(0.8 + rand() * 0.7);
    s.position.set(-1 + rand() * 2, 0.2 + rand() * 1.4, -1.4 + rand() * 0.9);
    scene.add(s);
    mists.push({ s, v: 0.02 + rand() * 0.03, base: s.position.clone() });
  }
  // low mist pooling at the racks' feet, where the cold air comes up through the floor
  for (const x of [-0.8, 0.8]) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex, transparent: true, opacity: 0.16, depthWrite: false }));
    s.scale.set(1.1, 0.4, 1);
    s.position.set(x, 0.15, -0.95);
    scene.add(s);
    mists.push({ s, v: 0.03, base: s.position.clone() });
  }
  onFrame((t) => {
    for (const m of mists) {
      m.s.position.x = m.base.x + Math.sin(t * m.v * 3 + m.base.y) * 0.3;
      m.s.position.y = m.base.y + Math.sin(t * m.v * 2) * 0.1;
    }
  });
  const DUST = 30;
  const dust = [];
  const dustPos = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) dust.push({ y: rand(), a: rand() * 6.3, r: Math.sqrt(rand()), sp: 0.008 + rand() * 0.012, ph: rand() * 6 });
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const motes = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xb8f0dc, size: 1, sizeAttenuation: false, transparent: true, opacity: 0.5, depthWrite: false }));
  motes.frustumCulled = false;
  scene.add(motes);
  onFrame((t) => {
    dust.forEach((d, i) => {
      // they sink through the cone and come round again at the top
      const k = (d.y + t * d.sp) % 1;
      const y = 1.78 - k * 0.75;
      const rr = d.r * (0.06 + (1.78 - y) * 0.5);
      const a = d.a + Math.sin(t * 0.2 + d.ph) * 0.4;
      dustPos.set([Math.cos(a) * rr, y, -0.1 + Math.sin(a) * rr * 0.6], i * 3);
    });
    dustGeo.attributes.position.needsUpdate = true;
  });


  // -- the table: a server tray on a rack base, a worn anti-static mat on top. The mat
  // stays quiet (a faint 10cm grid, print only round the edges and where things go) so
  // what lies on it reads at a glance. 1px is 5mm; the top of the canvas is the far side.
  const matTex = canvasTex(260, 168, (ctx, w, h) => {
    const r = rng(41);
    P(ctx, '#2c3a37', 0, 0, w, h);
    // rubbed a shade lighter where the gun lies and where hands rest
    const wear = (cx, cy, rx, ry) => {
      for (let y = -ry; y <= ry; y++)
        for (let x = -rx; x <= rx; x++) {
          const d = (x * x) / (rx * rx) + (y * y) / (ry * ry);
          if (d < 1 && r() < (1 - d) * 0.6) P(ctx, '#30403c', cx + x, cy + y);
        }
    };
    wear(130, 97, 66, 12);
    wear(40, 132, 30, 22);
    wear(222, 120, 28, 18);
    wear(130, 20, 50, 10);
    for (let x = 9; x < w; x += 20) P(ctx, '#33433f', x, 0, 1, h);
    for (let y = 4; y < h; y += 20) P(ctx, '#33433f', 0, y, w, 1);
    // each seat's side of the mat, marked with a dim border; a dashed line between
    P(ctx, '#3e524d', 5, 5, w - 10, 1);
    P(ctx, '#3e524d', 5, h - 6, w - 10, 1);
    P(ctx, '#3e524d', 5, 5, 1, h - 10);
    P(ctx, '#3e524d', w - 6, 5, 1, h - 10);
    for (let x = 6; x < w - 6; x += 6) P(ctx, '#34463f', x, Math.floor(h / 2), 3, 1);
    // a rule along your edge, a long tick every 10cm
    for (let x = 10; x < w - 8; x += 2) P(ctx, '#3a4d48', x, h - 5, 1, (x - 10) % 20 === 0 ? 3 : 1);
    // snap studs at the corners that ground the mat
    for (const [gx, gy] of [[1, 1], [w - 4, 1], [1, h - 4], [w - 4, h - 4]]) {
      P(ctx, '#8a7a48', gx, gy, 3, 3);
      P(ctx, '#2a2418', gx + 1, gy + 1);
      P(ctx, '#d0b878', gx, gy);
    }
    text3(ctx, 'SEAT 02', 116, 8, '#3c504a');
    text3(ctx, 'SEAT 01', 116, h - 13, '#3c504a');
    // where the round is laid out, and where spent shells go, one mark each
    for (let x = 88; x < 173; x += 4) {
      P(ctx, '#384b46', x, 47, 2, 1);
      P(ctx, '#384b46', x, 66, 2, 1);
    }
    text3(ctx, 'LOAD', 88, 40, '#384b46');
    for (let i = 0; i < 8; i++) {
      P(ctx, '#384b46', 84 + i * 9, 144, 5, 1);
      P(ctx, '#384b46', 86 + i * 9, 145);
    }
    // your item bays, corner marks
    for (const [cx, cy] of [[24, 116], [52, 116], [24, 144], [52, 144]]) {
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const x = cx + sx * 12;
        const y = cy + sy * 11;
        P(ctx, '#3e524d', sx < 0 ? x : x - 2, y, 3, 1);
        P(ctx, '#3e524d', x, sy < 0 ? y : y - 2, 1, 3);
      }
    }
    // a scorch where something was put down hot, and an old cup ring
    P(ctx, '#1e2422', 196, 72, 3, 2);
    P(ctx, '#3a2e28', 195, 71, 5, 1);
    P(ctx, '#3a2e28', 195, 74, 5, 1);
    for (let a = 0; a < 6.2; a += 0.22) if (r() < 0.75) P(ctx, '#38403a', Math.round(170 + Math.cos(a) * 6), Math.round(150 + Math.sin(a) * 5));
    ctx.drawImage(pixelText(t('ui.roulette.scene.antiStatic'), { color: '#36493f' }), 200, 150);
    // frayed corners and edge: the mat's rubber gone, the tray showing through
    speckle(ctx, r, 0, 0, w, 2, ['#1a2022'], 30);
    speckle(ctx, r, 0, h - 2, w, 2, ['#1a2022'], 40);
    speckle(ctx, r, 0, 0, w, h, ['#33433f', '#283633'], 160);
  });
  const edgeTex = canvasTex(64, 4, (ctx, w) => {
    P(ctx, '#1a2022', 0, 0, w, 4);
    P(ctx, '#4a5658', 0, 0, w, 1); // the worn top edge, catching the lamp
    for (let x = 4; x < w; x += 16) P(ctx, '#6a7678', x, 2);
  });
  const metal = mat({ map: edgeTex });
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.05, 0.84), [metal, metal, mat({ map: matTex }), metal, metal, metal]);
  top.position.y = TABLE_Y - 0.025;
  top.receiveShadow = true;
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.0, TABLE_Y - 0.05, 0.6), mat({ color: 0x0e1312 }));
  base.position.y = (TABLE_Y - 0.05) / 2;
  scene.add(top, base);
  const railMat = mat({
    map: canvasTex(64, 2, (ctx, w) => {
      P(ctx, '#3a4446', 0, 0, w, 2);
      P(ctx, '#5c686a', 0, 0, w, 1);
      for (let x = 6; x < w; x += 12) P(ctx, '#1a2022', x, 1);
    }),
  });
  for (const z of [-0.41, 0.41]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.02, 0.02), railMat);
    rail.position.set(0, TABLE_Y + 0.005, z);
    scene.add(rail);
  }

  // -- each seat's 额度: a little rack display at its right hand, its face tipped up
  // toward you so both read from your chair. Lit cells are what's left, dead red ones
  // what's gone; a cell that changes blinks.
  const watchers = new Set(); // anything that wants to hear of 额度 and item changes
  const tell = (...a) => watchers.forEach((fn) => fn(...a));
  const hpUnits = {};
  const hpSide = canvasTex(24, 4, (ctx, w) => {
    P(ctx, '#2a3432', 0, 0, w, 4);
    P(ctx, '#3c4845', 0, 0, w, 1);
    for (let x = 3; x < 16; x += 2) P(ctx, '#121816', x, 2);
    P(ctx, '#ffb347', 20, 2);
  });
  function hpUnit(who, x, z, w, tilt) {
    const { ctx, tex } = liveTex(42, 14);
    const d = w / 3 + 0.01;
    const h = 0.03;
    const side = mat({ map: hpSide });
    const box = new THREE.Mesh(new THREE.BoxGeometry(w + 0.016, h, d + 0.014), [side, side, mat({ color: 0x2a3432 }), side, side, side]);
    box.castShadow = true;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: tex }));
    face.rotation.x = -Math.PI / 2;
    face.position.y = h / 2 + 0.001;
    box.add(face);
    box.rotation.x = tilt;
    box.position.set(x, TABLE_Y + (h / 2) * Math.cos(tilt) + ((d + 0.014) / 2) * Math.sin(tilt), z);
    scene.add(box);
    // its lead off the outer end, over the table's edge and down
    const sx = Math.sign(x);
    cable([new THREE.Vector3(x + (sx * w) / 2, TABLE_Y + 0.008, z - 0.01), new THREE.Vector3(sx * 0.64, TABLE_Y + 0.007, z - 0.04), new THREE.Vector3(sx * 0.675, TABLE_Y - 0.04, z - 0.05), new THREE.Vector3(sx * 0.7, TABLE_Y - 0.5, z - 0.08)], 0.006);
    const glowLight = new THREE.PointLight(0x7dffc8, 0.3, 0.5, 1.5);
    glowLight.position.set(x, TABLE_Y + 0.08, z + 0.04);
    scene.add(glowLight);
    hpUnits[who] = { ctx, tex, hp: null, max: MAX_HP, cut: false, flash: [], glowLight, box };
    drawHp(who, 0);
  }
  function drawHp(who, now) {
    const u = hpUnits[who];
    const { ctx } = u;
    ctx.fillStyle = '#04100c';
    ctx.fillRect(0, 0, 42, 14);
    // the bezel's corner screws
    for (const [sx, sy] of [[0, 0], [41, 0], [0, 13], [41, 13]]) P(ctx, '#3a4a46', sx, sy);
    const hp = u.hp ?? u.max;
    // one cell left: it breathes dim and bright, a slow warning. 断线 (a match's last round,
    // one cell left, no healing): the cell burns amber and its line is cut
    const low = hp === 1 && Math.floor(now / 500) % 2 === 1;
    // the round's 额度 spread over the face: wider cells when there are fewer
    const cw = Math.floor((38 - (u.max - 1) * 2) / u.max);
    const x0 = Math.floor((42 - (u.max * cw + (u.max - 1) * 2)) / 2);
    for (let i = 0; i < u.max; i++) {
      const x = x0 + i * (cw + 2);
      const f = u.flash[i];
      const blink = f && now < f.until && Math.floor(now / 110) % 2 === 0;
      if (blink) {
        ctx.fillStyle = f.color;
        ctx.fillRect(x, 2, cw, 10);
      } else if (i < hp && u.cut) {
        ctx.fillStyle = low ? '#b86a20' : '#ffb347';
        ctx.fillRect(x, 2, cw, 10);
        ctx.fillStyle = '#fff0d0';
        ctx.fillRect(x, 2, cw, 2);
        // the cut: a dark break across the cell
        for (let k = 0; k < cw; k++) P(ctx, '#3a1606', x + k, 6 + ((k >> 1) % 2));
      } else if (i < hp) {
        ctx.fillStyle = low ? '#3fbf90' : '#7dffc8';
        ctx.fillRect(x, 2, cw, 10);
        ctx.fillStyle = '#e6fff4';
        ctx.fillRect(x, 2, cw, 2);
        ctx.fillStyle = '#3fbf90';
        ctx.fillRect(x, 11, cw, 1);
        P(ctx, '#b8ffe4', x + 1, 5, 1, 2); // a glint on the cell's glass
      } else {
        ctx.fillStyle = '#8a1a24';
        ctx.fillRect(x, 2, cw, 10);
        ctx.fillStyle = '#26060a';
        ctx.fillRect(x + 1, 3, cw - 2, 8);
      }
    }
    u.tex.needsUpdate = true;
  }
  hpUnit('you', 0.46, 0.25, 0.26, 0.55);
  hpUnit('opp', -0.47, -0.26, 0.3, 1.05);
  // max: the round's 额度 (a new round can change it); cut: 断线
  function setHp(who, n, { max, cut } = {}) {
    const u = hpUnits[who];
    const now = performance.now();
    if (max !== undefined && max !== u.max) {
      // a new round's rack: no old flashes left over
      u.max = max;
      u.flash = [];
      u.hp = null;
    }
    if (cut !== undefined) u.cut = cut;
    // the first 额度 the table hears of is where things stand, not a change
    if (u.hp !== null) for (let i = Math.min(n, u.hp); i < Math.max(n, u.hp); i++) u.flash[i] = { until: now + 1300, color: n < u.hp ? '#ff2e3e' : '#ffffff' };
    u.hp = n;
    u.glowLight.intensity = 0.3 * (n / u.max);
    u.glowLight.color.setHex(u.cut ? 0xffb347 : 0x7dffc8);
    drawHp(who, now);
    tell('hp', who, n);
  }
  // a new round: both racks wiped and lit cell by cell up to the new 额度
  async function refill(max) {
    for (const who in hpUnits) setHp(who, 0, { max, cut: false });
    for (let i = 1; i <= max; i++) {
      await new Promise((r) => setTimeout(r, 180));
      for (const who in hpUnits) setHp(who, i);
    }
  }
  const rackScreen = (who) => project(hpUnits[who].box.position.clone().add(new THREE.Vector3(0, 0.05, 0)));
  onFrame((t, now) => {
    for (const who in hpUnits) if (hpUnits[who].hp === 1 || hpUnits[who].flash.some((f) => f && now < f.until + 120)) drawHp(who, now);
  });

  // -- the gun: ours, a stubby pump gun in the same yellowed beige plastic as the CRTs,
  // a pale steel barrel with red tape round it and a status light. Light parts against
  // the dark mat, so it reads as a gun from any side, muzzle ring included. Its textures
  // carry the wear: a lit edge along each part, scuffed plastic, a stamped serial, a
  // brass glint in the ejection port, and somebody's sticker on the stock.
  const gunTex = (w, h, draw) => canvasTex(w, h, (ctx) => draw(ctx, rng(w * 31 + h)));
  // round parts: a lit stripe and a dark one around the tube read as polish at this size
  const roundTex = (base, hi, lo) =>
    gunTex(8, 2, (ctx) => {
      P(ctx, base, 0, 0, 8, 2);
      P(ctx, hi, 1, 0, 2, 2);
      P(ctx, lo, 5, 0, 2, 2);
    });
  const steel = mat({ map: roundTex('#8a9698', '#c4d0d2', '#5a6466') });
  const darkSteel = mat({ map: roundTex('#4a5557', '#6e7a7c', '#2e3638') });
  const receiverSide = (port) =>
    mat({
      map: gunTex(38, 15, (ctx, r) => {
        P(ctx, '#4a5557', 0, 0, 38, 15);
        speckle(ctx, r, 0, 0, 38, 15, ['#525e60', '#424c4e'], 40);
        P(ctx, '#7a8688', 0, 0, 38, 1);
        P(ctx, '#2e3638', 0, 14, 38, 1);
        P(ctx, '#3a4446', 0, 4, 38, 1);
        if (port) {
          // the ejection port, a shell's brass showing inside
          P(ctx, '#121616', 5, 5, 11, 5);
          P(ctx, '#d8b050', 8, 7, 5, 2);
          P(ctx, '#f8e090', 8, 7);
          P(ctx, '#6a7678', 5, 10, 11, 1);
          text3(ctx, 'M-429', 18, 7, '#2a3234');
        } else text3(ctx, 'SN0429', 6, 7, '#2a3234');
        P(ctx, '#9aa6a8', 30, 2);
        P(ctx, '#9aa6a8', 33, 12);
      }),
    });
  const scuffed = (base, light, dark, seed) =>
    gunTex(16, 16 + seed, (ctx, r) => {
      P(ctx, base, 0, 0, 16, 16 + seed);
      speckle(ctx, r, 0, 0, 16, 16, [light, dark, base], 46);
      for (let i = 0; i < 3; i++) {
        const x = Math.floor(r() * 12);
        const y = Math.floor(r() * 12);
        for (let k = 0; k < 4; k++) P(ctx, dark, x + k, y + (k >> 1));
      }
      P(ctx, light, 0, 0, 16, 1); // worn edges, rubbed pale
      P(ctx, dark, 0, 15, 16, 1);
    });
  const beige = mat({ map: scuffed('#a89c7c', '#c4b898', '#857a5e', 0) });
  const beigeDark = mat({ map: scuffed('#766c52', '#8e8466', '#5a5240', 1) });
  const sideL = receiverSide(false);
  const sideR = receiverSide(true);
  const gun = new THREE.Group();
  const model = new THREE.Group(); // muzzle along +z, grip down
  const part = (geo, m, x, y, z, rx = 0) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.rotation.x = rx;
    model.add(mesh);
    return mesh;
  };
  const tubeGeo = (r, len) => new THREE.CylinderGeometry(r, r, len, 8).rotateX(Math.PI / 2);
  part(new THREE.BoxGeometry(0.056, 0.074, 0.19), [sideR, sideL, darkSteel, darkSteel, darkSteel, darkSteel], 0, 0, 0); // receiver
  part(new THREE.BoxGeometry(0.058, 0.012, 0.15), steel, 0, 0.038, 0.01); // its top rib
  part(tubeGeo(0.017, 0.36), steel, 0, 0.02, 0.27); // barrel
  part(tubeGeo(0.022, 0.026), steel, 0, 0.02, 0.44); // muzzle ring
  part(tubeGeo(0.0115, 0.004), new THREE.MeshBasicMaterial({ color: 0x000000 }), 0, 0.02, 0.4535); // the bore
  part(new THREE.BoxGeometry(0.008, 0.01, 0.01), new THREE.MeshBasicMaterial({ color: 0xfff0c0 }), 0, 0.042, 0.43); // bead sight
  part(new THREE.BoxGeometry(0.006, 0.004, 0.29), steel, 0, 0.038, 0.275); // vent rib along the barrel
  part(tubeGeo(0.012, 0.25), darkSteel, 0, -0.016, 0.22); // magazine tube
  part(tubeGeo(0.0135, 0.012), steel, 0, -0.016, 0.345); // its end cap
  part(new THREE.BoxGeometry(0.03, 0.05, 0.014), darkSteel, 0, 0.002, 0.33); // the band holding tube to barrel
  const tape = mat({
    map: gunTex(8, 3, (ctx) => {
      P(ctx, '#d02a36', 0, 0, 8, 3);
      P(ctx, '#f05a64', 1, 0, 1, 3);
      P(ctx, '#8a1620', 5, 0, 1, 3);
      P(ctx, '#a01e2a', 0, 1, 8, 1); // where the wraps overlap
    }),
  });
  part(tubeGeo(0.019, 0.026), tape, 0, 0.02, 0.35); // tape
  const pump = part(new THREE.BoxGeometry(0.05, 0.044, 0.11), beige, 0, -0.016, 0.2);
  for (const dz of [-0.03, 0, 0.03]) part(new THREE.BoxGeometry(0.052, 0.046, 0.006), beigeDark, 0, -0.016, 0.2 + dz); // grip ridges
  const grip = part(new THREE.BoxGeometry(0.04, 0.085, 0.046), beige, 0, -0.065, -0.075, -0.4);
  part(new THREE.BoxGeometry(0.052, 0.078, 0.2), beige, 0, -0.03, -0.19, 0.16); // stock
  // somebody's sticker on the stock: the agent, drawn small
  const sticker = mat({
    map: gunTex(12, 10, (ctx) => {
      P(ctx, '#d8d2b8', 0, 0, 12, 10);
      P(ctx, '#b0aa92', 0, 9, 12, 1);
      P(ctx, '#d08060', 3, 2, 6, 5);
      P(ctx, '#d08060', 2, 4, 1, 2);
      P(ctx, '#d08060', 9, 4, 1, 2);
      P(ctx, '#1a0e0a', 4, 3, 1, 2);
      P(ctx, '#1a0e0a', 7, 3, 1, 2);
      P(ctx, '#d08060', 4, 7, 1, 1);
      P(ctx, '#d08060', 7, 7, 1, 1);
    }),
  });
  part(new THREE.BoxGeometry(0.054, 0.026, 0.034), sticker, 0, -0.022, -0.2, 0.16);
  part(new THREE.BoxGeometry(0.056, 0.09, 0.02), mat({ color: 0x1a1c1b }), 0, -0.045, -0.29, 0.16); // butt pad
  part(new THREE.BoxGeometry(0.012, 0.03, 0.05), darkSteel, 0, -0.045, 0.0); // trigger guard
  const lightMat = new THREE.MeshBasicMaterial({ color: COL.led });
  part(new THREE.BoxGeometry(0.006, 0.014, 0.014), lightMat, 0.03, 0.012, 0.04); // status light
  part(new THREE.BoxGeometry(0.006, 0.014, 0.014), lightMat, -0.03, 0.012, 0.04);
  // It shadows the mat only while it lies there: held up under the lamp, its shadow
  // stretches across the table into a black post.
  const gunShadow = (on) => model.traverse((o) => o.isMesh && (o.castShadow = on));
  gunShadow(true);
  // the gun is thin; pointing anywhere near it should count
  const grab = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.8), new THREE.MeshBasicMaterial({ visible: false }));
  grab.position.z = 0.08;
  model.add(grab);
  gun.add(model);
  scene.add(gun);

  // On the mat it lies on its side, muzzle to your right, so you see its whole profile.
  const REST = { pos: new THREE.Vector3(0.0, TABLE_Y + 0.03, 0.06), quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, Math.PI / 2)) };
  gun.position.copy(REST.pos);
  gun.quaternion.copy(REST.quat);
  pickable('gun', gun);
  onFrame((t) => lightMat.color.setHex(Math.sin(t * 4) > 0 ? COL.led : 0x14302a));

  // Aim poses: the gun never points straight down your line of sight, where it would
  // shrink to a black stub; it is held off to the side and turned a little, so its
  // length and the muzzle ring both show. roll tips it toward the viewer.
  const seatPos = new THREE.Vector3(0, 1.42, 0.95);
  const oppHead = opp.anchors.target; // avatar: where shots at the agent go
  const AIMS = {
    'you>opp': { pos: new THREE.Vector3(0.2, 1.17, 0.5), at: oppHead.clone().add(new THREE.Vector3(0.04, 0, 0)), roll: -0.25 },
    'you>you': { pos: new THREE.Vector3(0.3, 1.3, 0.22), at: seatPos.clone().add(new THREE.Vector3(0.03, -0.02, 0)), roll: 0.5 },
    'opp>you': { pos: new THREE.Vector3(0.22, 1.28, -0.3), at: seatPos.clone().add(new THREE.Vector3(-0.45, -0.2, 0)), roll: -0.4 },
    'opp>opp': { pos: opp.anchors.holdSelf, at: oppHead, roll: 0.3 }, // avatar: far enough out that the muzzle meets its body, not inside it
  };
  // where hands hold it, in the gun's own space (the avatar's contract) and in world space
  gun.userData.grips = { rear: grip.position.clone(), front: pump.position.clone() };
  const gunHandles = () => ({
    grip: grip.getWorldPosition(new THREE.Vector3()),
    pump: pump.getWorldPosition(new THREE.Vector3()),
  });
  async function moveGun(pos, quat, ms = 450) {
    const p0 = gun.position.clone();
    const q0 = gun.quaternion.clone();
    await tween(ms, (t) => {
      const e = ease(t);
      gun.position.lerpVectors(p0, pos, e);
      gun.quaternion.slerpQuaternions(q0, quat, e);
    });
  }
  const poseOf = (a) => {
    const dummy = new THREE.Object3D();
    dummy.position.copy(a.pos);
    dummy.lookAt(a.at);
    dummy.rotateZ(a.roll);
    return { pos: a.pos, quat: dummy.quaternion };
  };
  // Picked up and not fired yet: it follows where you mean to point it. 'up' is lifted
  // off the mat where it lay, muzzle tipped up, so it covers nothing it didn't already;
  // 'opp' and 'you' are the aims above.
  const HOLD = {
    pos: REST.pos.clone().add(new THREE.Vector3(0.05, 0.07, 0.03)),
    quat: REST.quat.clone().premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.14)),
  };
  let held = null; // the pose it eases toward, or null while a move has it
  function hold(to) {
    held = to === 'up' ? HOLD : poseOf(AIMS[`you>${to}`]);
    gunShadow(false);
  }
  onFrame(() => {
    if (!held) return;
    gun.position.lerp(held.pos, 0.14);
    gun.quaternion.slerp(held.quat, 0.14);
  });
  async function aim(shooter, target) {
    held = null;
    const a = poseOf(AIMS[`${shooter}>${target}`]);
    gunShadow(false);
    await moveGun(a.pos, a.quat, 520);
  }
  const lower = () => {
    held = null;
    return moveGun(REST.pos, REST.quat, 420).then(() => gunShadow(true));
  };

  // muzzle flash: a light spike and a star sprite at the muzzle
  const flashLight = new THREE.PointLight(0xffd9a0, 0, 2.5, 1.5);
  scene.add(flashLight);
  const starTex = canvasTex(16, 16, (ctx) => {
    ctx.fillStyle = '#fff4d0';
    for (let i = 0; i < 16; i++) {
      ctx.fillRect(i, 7, 1, 2);
      ctx.fillRect(7, i, 2, 1);
    }
    ctx.fillRect(4, 4, 8, 8);
  });
  const star = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, transparent: true, fog: false }));
  star.scale.setScalar(0.3);
  star.visible = false;
  scene.add(star);
  async function fire(live) {
    const muzzle = model.localToWorld(new THREE.Vector3(0, 0.02, 0.47));
    // recoil
    const back = gun.position.clone();
    if (!live) {
      await tween(120, (t) => gun.position.copy(back).add(new THREE.Vector3(0, Math.sin(t * Math.PI) * 0.01, 0)));
      return;
    }
    flashLight.position.copy(muzzle);
    star.position.copy(muzzle);
    star.visible = true;
    flashLight.intensity = 14;
    shake(0.06);
    const dir = model.localToWorld(new THREE.Vector3(0, 0, -0.08)).sub(model.localToWorld(new THREE.Vector3()));
    await tween(110, (t) => gun.position.copy(back).addScaledVector(dir, Math.sin(t * Math.PI)));
    star.visible = false;
    flashLight.intensity = 0;
  }

  // the screen tears and goes red; the racks and CRTs alarm
  function hit(who) {
    alarm = 1.2;
    const now = performance.now();
    for (const s of crts) s.alertUntil = now + 1100;
    const strong = who === 'you';
    tween(strong ? 900 : 600, (t) => {
      post.uStatic.value = (1 - t) * (strong ? 1 : 0.6);
      post.uFlash.value.set((1 - t) * (strong ? 0.45 : 0.25), 0, 0.02 * (1 - t));
    }).then(() => {
      post.uStatic.value = 0;
      post.uFlash.value.set(0, 0, 0);
    });
  }

  // -- shells: red is live, blue is blank, big enough to count from the chair. Ribbed
  // hulls with a lit edge, a crimped star at the top, a brass head with its primer.
  const shellGeo = {
    body: new THREE.CylinderGeometry(0.015, 0.015, 0.06, 8),
    cap: new THREE.CylinderGeometry(0.0162, 0.0162, 0.016, 8),
  };
  const shellMats = {};
  // live: true, false, or '?' for one nobody can tell any more (grey, a ? printed on it)
  function hullMats(live) {
    const [base, hi, lo] = live === '?' ? ['#5e6e6a', '#8ea09a', '#34423e'] : live ? ['#d8303a', '#f06870', '#8a1820'] : ['#4f9cd0', '#8ac8f0', '#2a5a80'];
    const side = mat({
      map: canvasTex(8, 8, (ctx) => {
        P(ctx, base, 0, 0, 8, 8);
        for (const x of [3, 7]) P(ctx, lo, x, 0, 1, 8); // the hull's ribs
        P(ctx, hi, 1, 0, 1, 8);
        P(ctx, lo, 0, 5, 8, 1); // a printed band
        P(ctx, hi, 2, 5, 1, 1);
        if (live === '?') for (const [x, y] of [[3, 0], [4, 0], [5, 1], [4, 2], [4, 4]]) P(ctx, '#e8f4ee', x, y);
      }),
    });
    const crimp = mat({
      map: canvasTex(8, 8, (ctx) => {
        P(ctx, base, 0, 0, 8, 8);
        for (let i = 0; i < 4; i++) P(ctx, lo, 3 + Math.round(Math.cos(i) * 2), 3 + Math.round(Math.sin(i) * 2), 2, 2);
        P(ctx, lo, 3, 3, 2, 2);
      }),
    });
    return [side, crimp, side];
  }
  const brassSide = mat({
    map: canvasTex(8, 4, (ctx) => {
      P(ctx, '#d8b050', 0, 0, 8, 4);
      P(ctx, '#f8e8a0', 1, 0, 1, 4);
      P(ctx, '#9a7a30', 5, 0, 1, 4);
      P(ctx, '#b08a38', 0, 3, 8, 1); // the rim
    }),
  });
  const brassHead = mat({
    map: canvasTex(8, 8, (ctx) => {
      P(ctx, '#d0a848', 0, 0, 8, 8);
      P(ctx, '#8a6a28', 2, 2, 4, 4);
      P(ctx, '#c8d0d0', 3, 3, 2, 2); // the primer
      P(ctx, '#f0e090', 1, 1, 2, 1);
    }),
  });
  function shellMesh(live) {
    shellMats[live] ??= hullMats(live);
    const g = new THREE.Group();
    const body = new THREE.Mesh(shellGeo.body, shellMats[live]);
    const cap = new THREE.Mesh(shellGeo.cap, [brassSide, brassHead, brassHead]);
    cap.position.y = -0.036;
    g.add(body, cap);
    g.traverse((o) => o.isMesh && (o.castShadow = true));
    return g;
  }
  const laid = [];
  async function layShells(values) {
    const n = values.length;
    for (let i = 0; i < n; i++) {
      const s = shellMesh(values[i]);
      s.rotation.x = Math.PI / 2;
      const to = new THREE.Vector3((i - (n - 1) / 2) * 0.05, TABLE_Y + 0.016, -0.14);
      s.position.copy(to).add(new THREE.Vector3(0, 0.25, 0));
      scene.add(s);
      laid.push(s);
      tween(260, (t) => s.position.set(to.x, to.y + (1 - ease(t)) * 0.25, to.z));
      await new Promise((r) => setTimeout(r, 90));
    }
  }
  async function loadShells() {
    const into = gun.position.clone();
    for (const s of laid.splice(0)) {
      const from = s.position.clone();
      tween(260, (t) => {
        s.position.lerpVectors(from, into, ease(t));
        s.position.y += Math.sin(t * Math.PI) * 0.06;
        s.scale.setScalar(1 - t * 0.6);
      }).then(() => scene.remove(s));
      await new Promise((r) => setTimeout(r, 110));
    }
    await new Promise((r) => setTimeout(r, 260));
  }
  const spent = [];
  async function spend(live, { instant = false } = {}) {
    const s = shellMesh(live);
    s.rotation.x = Math.PI / 2; // lying with the brass toward you, so a long row stays apart
    const from = model.localToWorld(new THREE.Vector3(0.04, 0.02, 0));
    // spent shells line up in front of you, left to right, in the order they came out
    const to = new THREE.Vector3(-0.18 + spent.length * 0.045, TABLE_Y + 0.016, 0.26);
    scene.add(s);
    spent.push(s);
    if (instant) return s.position.copy(to);
    await tween(420, (t) => {
      s.position.lerpVectors(from, to, ease(t));
      s.position.y += Math.sin(t * Math.PI) * 0.12;
      s.rotation.x = Math.PI / 2 + t * Math.PI * 4;
    });
    s.rotation.x = Math.PI / 2;
  }
  function clearSpent() {
    for (const s of spent.splice(0)) scene.remove(s);
  }

  // -- the shell rack: what is left in the gun, standing in a caddy beside its stock so
  // it can be counted from the chair. Live ones stand from the left, blanks from the
  // right, never in the gun's order. Once a flip hit a shell nobody knew, nobody can tell
  // any more: every one left turns grey with a ? on it. A little screen on its front
  // edge says the count.
  const RACK = { x: -0.49, z: -0.13, holes: 8 };
  const RACK_W = 0.272; // 68 texels at 250 a metre: a hole every 8
  const holeX = (i) => RACK.x - 0.112 + i * 0.032;
  const caddyTop = canvasTex(68, 12, (ctx, w, h) => {
    P(ctx, '#1c2422', 0, 0, w, h);
    P(ctx, '#34403d', 0, 0, w, 1);
    P(ctx, '#0e1412', 0, h - 1, w, 1);
    for (let i = 0; i < RACK.holes; i++) {
      const cx = 4 + i * 8;
      P(ctx, '#050807', cx, 3, 4, 6);
      P(ctx, '#050807', cx - 1, 4, 6, 4);
      P(ctx, '#2c3634', cx, 9, 4, 1); // the lit lip below each hole
    }
    P(ctx, '#b8202c', 1, 1, 2, 1); // which end is which: a red tick on the left, a blue on the right
    P(ctx, '#3a7ab0', w - 3, 1, 2, 1);
  });
  const caddySide = canvasTex(68, 6, (ctx, w) => {
    P(ctx, '#222b29', 0, 0, w, 6);
    P(ctx, '#3a4744', 0, 0, w, 1);
    for (let x = 6; x < w; x += 12) P(ctx, '#141a19', x, 2, 4, 2);
  });
  const rackBox = new THREE.Group(); // the caddy and its screen; hovering it spells out the count
  scene.add(rackBox);
  pickable('rack', rackBox);
  {
    const side = mat({ map: caddySide });
    const caddy = new THREE.Mesh(new THREE.BoxGeometry(RACK_W, 0.024, 0.048), [side, side, mat({ map: caddyTop }), side, side, side]);
    caddy.position.set(RACK.x, TABLE_Y + 0.012, RACK.z);
    caddy.castShadow = true;
    rackBox.add(caddy);
  }
  // its screen, a strip along the front edge stood up to face the chair
  // The room renders at a few hundred rows, so the screen is coarse: a count and a shell
  // of its colour for each kind (the hover tip spells it out). Facing the seat square on,
  // its 8 rows get about 14 of the frame's, so no row of a digit drops out. The screen is
  // the strip's own top face, not a quad laid on it: the snapped box would cut through one.
  const LCD_W = 48;
  const LCD_H = 8;
  const rackLcd = liveTex(LCD_W, LCD_H);
  {
    const side = mat({ map: caddySide });
    const screen = snapped(new THREE.MeshBasicMaterial({ map: rackLcd.tex }));
    const strip = new THREE.Mesh(new THREE.BoxGeometry(RACK_W - 0.02, 0.012, 0.044), [side, side, screen, side, side, side]);
    strip.rotation.x = 1.06; // its face square to the line from the chair (about 29° down)
    strip.position.set(RACK.x, TABLE_Y + 0.0225, RACK.z + 0.045);
    rackBox.add(strip);
  }
  // in the holes: { live, mesh } or null; what the rack says is left
  const holes = Array(RACK.holes).fill(null);
  const loaded = { live: 0, blank: 0, unknown: false };
  function drawRackLcd() {
    const { ctx, tex } = rackLcd;
    P(ctx, '#04100c', 0, 0, LCD_W, LCD_H);
    for (const [x, y] of [[0, 0], [LCD_W - 1, 0], [0, LCD_H - 1], [LCD_W - 1, LCD_H - 1]]) P(ctx, '#3a4a46', x, y);
    // a shell, 2 wide: its hull in the colour, a brass head
    const shell = (x, color) => {
      P(ctx, color, x, 1, 2, 4);
      P(ctx, '#d8b050', x, 5, 2, 1);
    };
    const n = loaded.live + loaded.blank;
    const groups = !n ? [['--', '#2c5a4c']] : loaded.unknown ? [[String(n), '#c8d4d0', '#6a7a76'], ['?', '#ffb347']] : [[String(loaded.live), '#ff6b75', '#d8303a'], [String(loaded.blank), '#7cc4f2', '#4f9cd0']];
    const width = (g) => text3(null, g[0], 0, 0) + (g[2] ? 4 : 0);
    let x = Math.floor((LCD_W - groups.reduce((w, g) => w + width(g), 0) - 7 * (groups.length - 1)) / 2);
    for (const g of groups) {
      const w = text3(ctx, g[0], x, 1, g[1]);
      if (g[2]) shell(x + w + 2, g[2]);
      x += width(g) + 7;
    }
    tex.needsUpdate = true;
  }
  const rackPos = (i) => new THREE.Vector3(holeX(i), TABLE_Y + 0.036, RACK.z - 0.002);
  function rackPut(i, live) {
    const s = shellMesh(live);
    s.position.copy(rackPos(i));
    scene.add(s);
    holes[i] = { live, mesh: s };
    return s;
  }
  function rackClear() {
    for (let i = 0; i < holes.length; i++) if (holes[i]) scene.remove(holes[i].mesh), (holes[i] = null);
  }
  // live from the left, blanks from the right; all grey from the left when unknown
  function rackSlots(live, blank, unknown) {
    if (unknown) return Array.from({ length: live + blank }, (_, i) => [i, '?']);
    return [...Array.from({ length: live }, (_, i) => [i, true]), ...Array.from({ length: blank }, (_, i) => [RACK.holes - blank + i, false])];
  }
  // as the view has it, no animation; nothing changes if it already says so
  function rackSet(live, blank, { unknown = false } = {}) {
    if (loaded.live === live && loaded.blank === blank && loaded.unknown === unknown) return;
    rackClear();
    Object.assign(loaded, { live, blank, unknown });
    for (const [i, k] of rackSlots(live, blank, unknown)) rackPut(i, k);
    drawRackLcd();
  }
  // a fresh load: each one drops into its hole
  async function rackFill(live, blank) {
    rackClear();
    Object.assign(loaded, { live: 0, blank: 0, unknown: false });
    drawRackLcd();
    for (const [i, k] of rackSlots(live, blank, false)) {
      const s = rackPut(i, k);
      const to = s.position.clone();
      loaded[k ? 'live' : 'blank']++;
      drawRackLcd();
      tween(200, (t) => s.position.set(to.x, to.y + (1 - ease(t)) * 0.12, to.z));
      await new Promise((r) => setTimeout(r, 70));
    }
  }
  // one has left the gun: one of its kind lifts out of the rack (any grey one, if
  // nobody can tell any more)
  function rackTake(live) {
    let i = -1;
    if (loaded.unknown) i = holes.findLastIndex(Boolean);
    else if (live) i = holes.findLastIndex((h) => h?.live === true);
    else i = holes.findIndex((h) => h?.live === false);
    if (loaded.unknown) loaded.live = Math.max(0, loaded.live - 1); // unknown: all counted as one kind
    else if (live && loaded.live) loaded.live--;
    else if (!live && loaded.blank) loaded.blank--;
    drawRackLcd();
    if (i < 0) return;
    const { mesh } = holes[i];
    holes[i] = null;
    const from = mesh.position.clone();
    tween(380, (t) => {
      mesh.position.set(from.x, from.y + ease(t) * 0.1, from.z);
      mesh.scale.setScalar(1 - t * 0.7);
    }).then(() => scene.remove(mesh));
  }
  // a flip on a shell nobody knew: the counts are gone, each one left flickers to grey
  async function rackMuddle() {
    if (loaded.unknown) return;
    const n = loaded.live + loaded.blank;
    const at = holes.map((h, i) => (h ? i : -1)).filter((i) => i >= 0);
    for (let f = 0; f < 4; f++) {
      for (const i of at) holes[i].mesh.visible = f % 2 === 1;
      await new Promise((r) => setTimeout(r, 70));
    }
    rackClear();
    Object.assign(loaded, { live: n, blank: 0, unknown: true });
    for (const i of at) rackPut(i, '?');
    drawRackLcd();
  }
  drawRackLcd();

  // -- items: cartridges at each seat's left hand, each with a lit icon screen tipped
  // up toward you. The agent's stand in one row, steeply tipped, so none hides another
  // and they read from across the table.
  // A single game holds 4; a match holds 6: yours in three columns, the agent's in one
  // longer row of smaller tiles.
  const LAYOUT = {
    4: {
      you: [[-0.53, 0.16], [-0.39, 0.16], [-0.53, 0.3], [-0.39, 0.3]],
      opp: [[0.2, -0.3], [0.33, -0.3], [0.46, -0.3], [0.59, -0.3]],
      size: { you: 0.115, opp: 0.12 },
    },
    6: {
      you: [[-0.56, 0.16], [-0.43, 0.16], [-0.3, 0.16], [-0.56, 0.3], [-0.43, 0.3], [-0.3, 0.3]],
      opp: [[0.1, -0.3], [0.2, -0.3], [0.3, -0.3], [0.4, -0.3], [0.5, -0.3], [0.6, -0.3]],
      size: { you: 0.108, opp: 0.094 },
    },
  };
  let SLOTS = LAYOUT[4];
  const TILT = { you: 0.45, opp: 1.0 };
  const TILE = { you: { size: 0.115, tilt: TILT.you }, opp: { size: 0.12, tilt: TILT.opp } };
  function setSlots(n) {
    SLOTS = LAYOUT[n] ?? LAYOUT[4];
    for (const w of ['you', 'opp']) TILE[w] = { size: SLOTS.size[w], tilt: TILT[w] };
  }
  const tiles = { you: [], opp: [] };
  const tileTex = new Map();
  // a little screen in a bezel: the item's colour round the rim, screws in the corners,
  // faint scanlines behind the icon and a glint on the glass
  function itemTex(id, conjured = false) {
    const key = `${id}${conjured ? '?' : ''}`;
    if (!tileTex.has(key)) {
      const it = ITEMS[id];
      tileTex.set(key, canvasTex(24, 24, (ctx, w, h) => {
        P(ctx, '#1a2422', 0, 0, w, h);
        if (conjured) {
          // a dashed rim, as if only half there
          for (let i = 0; i < w; i += 2) {
            P(ctx, i % 4 ? ITEMS.mirage.color : it.color, i, 0, 1, 1);
            P(ctx, i % 4 ? it.color : ITEMS.mirage.color, i, h - 1, 1, 1);
            P(ctx, i % 4 ? ITEMS.mirage.color : it.color, 0, i, 1, 1);
            P(ctx, i % 4 ? it.color : ITEMS.mirage.color, w - 1, i, 1, 1);
          }
        } else {
          P(ctx, it.color, 0, 0, w, 1);
          P(ctx, it.color, 0, h - 1, w, 1);
          P(ctx, it.color, 0, 0, 1, h);
          P(ctx, it.color, w - 1, 0, 1, h);
        }
        P(ctx, '#2e3a37', 1, 1, w - 2, 1);
        P(ctx, '#0a0f0d', 1, h - 2, w - 2, 1);
        P(ctx, conjured ? '#140a1e' : '#0a1a15', 3, 3, 18, 18);
        for (let y = 4; y < 21; y += 2) P(ctx, conjured ? '#0e0616' : '#07130f', 3, y, 18, 1);
        ctx.drawImage(itemIcon(id), 4, 4);
        if (conjured) {
          // the icon smeared sideways a pixel in violet, and a ? in the corner
          ctx.globalAlpha = 0.45;
          ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(itemIcon(id), 5, 4);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1;
          for (const [x, y] of [[18, 2], [19, 2], [20, 3], [19, 4], [19, 6]]) P(ctx, '#ffd6ff', x, y);
        }
        P(ctx, '#3a5a50', 3, 3, 3, 1);
        P(ctx, '#3a5a50', 3, 4, 1, 2);
        if (!conjured) for (const [x, y] of [[1, 1], [w - 2, 1], [1, h - 2], [w - 2, h - 2]]) P(ctx, '#6a7672', x, y);
      }));
    }
    return tileTex.get(key);
  }
  // the cartridge's edge: a groove round it, the contacts showing gold
  const tileSide = canvasTex(24, 6, (ctx, w) => {
    P(ctx, '#2a3432', 0, 0, w, 6);
    P(ctx, '#3e4a47', 0, 0, w, 1);
    P(ctx, '#141b19', 0, 3, w, 1);
    for (let x = 6; x < 18; x += 2) P(ctx, '#c8a040', x, 4);
  });
  function tilePose(who, slot, lift = 0) {
    const { size, tilt } = TILE[who];
    const [x, z] = SLOTS[who][slot];
    return { x, y: TABLE_Y + 0.011 * Math.cos(tilt) + (size / 2) * Math.sin(tilt) + lift, z };
  }
  // conjured: it came out of a 幻觉 and may not exist. It flickers and slips sideways now
  // and then, and comes in out of thin air instead of dropping.
  const shimmer = new Set();
  async function dealItem(who, slot, id, { instant = false, conjured = false } = {}) {
    const { size, tilt } = TILE[who];
    const side = mat({ map: tileSide }); // its own, so hover lights only this one
    const face = new THREE.MeshBasicMaterial({ map: itemTex(id, conjured), transparent: conjured });
    const t = new THREE.Mesh(new THREE.BoxGeometry(size, 0.022, size), [side, side, face, side, side, side]);
    t.castShadow = !conjured;
    t.rotation.x = tilt;
    t.userData = { who, slot, face, conjured, phase: Math.random() * 10 };
    scene.add(t);
    tiles[who][slot] = t;
    pickable(`item:${who}:${slot}`, t);
    tell('item', who, slot, id);
    const p = tilePose(who, slot);
    if (conjured) shimmer.add(t);
    if (instant) return t.position.set(p.x, p.y, p.z);
    if (conjured) {
      t.position.set(p.x, p.y, p.z);
      await tween(520, (k) => {
        t.scale.setScalar(0.2 + ease(k) * 0.8);
        t.scale.x *= 1 + Math.sin(k * 40) * 0.3 * (1 - k);
        face.opacity = Math.random() < k ? 1 : 0.2;
      });
      t.scale.setScalar(1);
      return;
    }
    await tween(300, (k) => {
      t.position.set(p.x, p.y + (1 - ease(k)) * 0.3, p.z);
      t.rotation.y = (1 - k) * 2;
    });
  }
  // the thing under your cursor rises a little
  let lifted = null;
  onFrame((time) => {
    for (const t of shimmer) {
      const { face, phase, who, slot } = t.userData;
      const k = time * 2.2 + phase;
      // breathes between there and not quite there, tinted violet
      face.opacity = 0.62 + Math.sin(k) * 0.18 + (Math.random() < 0.03 ? -0.3 : 0);
      face.color.setRGB(0.85 + Math.sin(k * 0.7) * 0.15, 0.78, 1);
      // and now and then slips a hair sideways, a glitch
      const x = SLOTS[who][slot][0];
      t.position.x = x + (Math.sin(time * 1.3 + phase) > 0.97 ? (Math.random() - 0.5) * 0.012 : 0);
    }
  });
  stage.onHover((name) => {
    const m = /^item:(you|opp):(\d)$/.exec(name ?? '');
    const t = m && tiles[m[1]][Number(m[2])];
    if (lifted && lifted.t !== t) {
      const { t: old, who, slot } = lifted;
      old.position.y = tilePose(who, slot).y;
      lifted = null;
    }
    if (t && !lifted) {
      lifted = { t, who: m[1], slot: Number(m[2]) };
      t.position.y = tilePose(m[1], Number(m[2]), 0.025).y;
    }
  });
  async function useItem(who, slot) {
    const t = tiles[who][slot];
    tiles[who][slot] = null;
    drop(`item:${who}:${slot}`);
    if (lifted?.t === t) lifted = null;
    shimmer.delete(t);
    tell('item', who, slot, null);
    const y0 = t.position.y;
    await tween(380, (k) => {
      t.position.y = y0 + ease(k) * 0.12;
      t.rotation.y = k * 6;
      t.scale.setScalar(1 - k * 0.8);
    });
    scene.remove(t);
  }
  // A 幻觉 item that was never there: it lifts, tears sideways, flattens to a line and is
  // gone, the screen glitching with it.
  async function vanishItem(who, slot) {
    const t = tiles[who][slot];
    if (!t) return;
    tiles[who][slot] = null;
    drop(`item:${who}:${slot}`);
    if (lifted?.t === t) lifted = null;
    shimmer.delete(t);
    tell('item', who, slot, null);
    const { face } = t.userData;
    face.transparent = true;
    const p = t.position.clone();
    await tween(700, (k) => {
      t.position.set(p.x + (Math.random() - 0.5) * 0.03 * (1 - k), p.y + ease(Math.min(1, k * 3)) * 0.05, p.z);
      t.scale.set(1 + k * 1.6, 1, Math.max(0.02, 1 - ease(k)));
      face.opacity = Math.random() < 0.5 ? 1 - k : 0.15;
      face.color.setRGB(1, 0.5 + Math.random() * 0.5, 1);
      post.uStatic.value = 0.3 * (1 - k);
    });
    post.uStatic.value = 0;
    scene.remove(t);
  }
  // a slot's tile on screen: its near edge (toward you) and its far edge, which a tipped
  // tile raises
  function slotScreen(who, slot) {
    const { size, tilt } = TILE[who];
    const p = tilePose(who, slot);
    const h = size / 2;
    return {
      near: project(new THREE.Vector3(p.x, p.y - Math.sin(tilt) * h, p.z + Math.cos(tilt) * h)),
      top: project(new THREE.Vector3(p.x, p.y + Math.sin(tilt) * h, p.z - Math.cos(tilt) * h)),
    };
  }
  function clearItems() {
    lifted = null;
    shimmer.clear();
    for (const w of ['you', 'opp'])
      tiles[w].forEach((t, slot) => {
        if (!t) return;
        drop(`item:${w}:${slot}`);
        scene.remove(t);
        tiles[w][slot] = null;
        tell('item', w, slot, null);
      });
  }

  return {
    gun, // avatar: its hands follow the gun while it aims
    clearItems,
    setSlots,
    setHp,
    refill,
    rackScreen,
    vanishItem,
    aim,
    hold,
    lower,
    fire,
    hit,
    layShells,
    loadShells,
    spend,
    clearSpent,
    rackSet,
    rackFill,
    rackTake,
    rackMuddle,
    // where the aim choice sits: in front of the agent across the table, and at your edge
    aimSpots: () => ({ opp: project(new THREE.Vector3(0, TABLE_Y + 0.13, -0.36)), you: project(new THREE.Vector3(0.05, TABLE_Y, 0.42)) }),
    dealItem,
    useItem,
    crtWrite,
    // the screens a director's script can put its own picture on: the left CRT, and the small one
    // on top at the right (nothing stands in front of it, so a camera can go right up to its glass)
    screens: { crt: crts[0].screen, crtTop: crts[2].screen },
    gunHandles,
    watch: (fn) => watchers.add(fn),
    gunScreen: () => project(gun.position.clone().add(new THREE.Vector3(0, 0.06, 0))),
    slotScreen,
    // what the launch video's hooks work on (pv-machine.js)
    pvParts: { racks, crts, cables: swaying.map((s) => ({ pivot: s.pivot, curve: s.pivot.children[0].userData.curve })), table: new THREE.Vector3(0, TABLE_Y, 0), pvRacks },
  };
}

// ---- the table: server state in, your moves out ----------------------------------

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const EMOJI_ONLY = /^\p{Extended_Pictographic}[\p{Extended_Pictographic}‍️]*$/u;

// The machine room with the agent seated in it: the scene. Its state (lights, items,
// shells) belongs to one game, so each roulette game gets a freshly built room.
export function buildMachine(stage) {
  const opp = addOpponent(stage, { body: 0x141a18, chairColor: 0x0b0f0e, eye: 0x7dffc8 });
  const room = buildRoom(stage, opp);
  reviewAvatar(opp, room); // ?avatar-review: every avatar state on buttons
  // pv: the launch video's hooks; screens: what it puts its pictures on
  const pv = machinePv(stage, room.pvParts);
  const screens = room.screens;
  // sound: with ⚙ music from the radio on, the music plays from the left CRT's speaker
  return { opp, room, pv, screens, sound: { radio: new THREE.Vector3(-0.82, 0.78, -0.5) } };
}

// The game on the machine room's table: stage is the game's own layer (see stage.js
// layer()), scene the room from buildMachine. director: a script's name, to play a
// scripted game instead of a table's (web/play/director/).
export function mount(stage, { scene, createHud, table, k, director } = {}) {
  const { opp, room } = scene;
  const send = async (path, body) => {
    const r = await fetch(`/api/tables/${table}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ k, ...body }) });
    return r.json();
  };
  const hud = createHud(stage, opp, { game: 'roulette', nudge: t('ui.roulette.nudge'), send: table ? (text) => send('say', { text }) : director ? () => {} : null });
  const { status, log, toast } = hud;
  const say = (text, mood) => {
    hud.say(text, mood);
    opp.setState('talking', { text, mood }); // avatar: mood, the face it says it with
    sfx('chat');
    room.crtWrite(`> ${text}`);
  };

  // Each seat's 额度 and items, the shells left, the seal; the room reports its changes.
  const thud = createTableHud();

  // HUD bits pinned in the room: what you know, above the gun; with the gun up, each
  // target pinned where it points (the agent across the table, you at your edge)
  const peek = document.createElement('div');
  peek.className = 'handtag after peek';
  peek.hidden = true;
  const choice = document.createElement('div');
  choice.className = 'choice';
  choice.hidden = true;
  const aimBtn = (cls, key, label) => {
    const b = document.createElement('button');
    b.className = `pixbtn aim ${cls}`;
    const k = document.createElement('span');
    k.className = 'key';
    k.textContent = key;
    b.append(k, label);
    return b;
  };
  const atOpp = aimBtn('at-opp', '1', t('ui.roulette.aim'));
  const atSelf = aimBtn('at-self', '2', t('ui.roulette.aimSelf'));
  const putDown = aimBtn('put-down', 'Esc', t('ui.roulette.putDown'));
  const selfRow = document.createElement('div');
  selfRow.className = 'aim-self';
  selfRow.append(atSelf, putDown);
  choice.append(atOpp, selfRow);
  // 断线, over a seat's rack in a match's last round when it is down to its last 额度
  const cutTags = {};
  for (const who of ['you', 'opp']) {
    cutTags[who] = document.createElement('div');
    cutTags[who].className = 'handtag after cut';
    cutTags[who].textContent = t('ui.roulette.cutTag');
    cutTags[who].hidden = true;
  }
  document.querySelector('.hud').append(peek, choice, cutTags.you, cutTags.opp);
  stage.onFrame(() => {
    const g = room.gunScreen();
    peek.style.left = `${g.x + 40}px`;
    peek.style.top = `${g.y - 30}px`;
    if (!choice.hidden) {
      // a target under the pointer stays exactly where it is until you've chosen
      const a = room.aimSpots();
      if (!atOpp.matches(':hover')) {
        atOpp.style.left = `${a.opp.x}px`;
        atOpp.style.top = `${a.opp.y}px`;
      }
      if (!selfRow.matches(':hover')) {
        selfRow.style.left = `${a.you.x}px`;
        selfRow.style.top = `${Math.min(a.you.y, window.innerHeight - 112)}px`;
      }
    }
    for (const who in cutTags) {
      if (cutTags[who].hidden) continue;
      const r = room.rackScreen(who);
      cutTags[who].style.left = `${r.x - 50}px`;
      cutTags[who].style.top = `${r.y - (who === 'opp' ? 34 : 40)}px`;
    }
  });

  if (!table && !director) {
    status(t('ui.roulette.preview'));
    room.setHp('you', 4);
    room.setHp('opp', 4);
    return;
  }

  // live mode: a quiet HUD over the full-size table, for a stream played by danmaku
  const liveHud = live && createLive({ room, stage, items: ITEMS, untakeable: UNTAKEABLE, maybe: (item) => t('ui.roulette.maybe', { item }) });
  if (live) stage.onDispose(() => liveHud.dispose());

  let v = null; // the latest view
  let shown = null; // how much of the log the room has played out
  let chatShown = 0;
  let busy = false; // a move of yours is on its way
  let playing = false;
  let peekToast = null;
  let wins = null; // a match's rounds won, as far as the room has played it out
  const queue = [];
  const idlers = []; // the director, waiting for the room to finish playing
  const names = {};
  const side = (id) => (id === v.you ? 'you' : 'opp');
  const oppId = () => v.seats.find((s) => s.id !== v.you).id;
  const nameOf = (id) => (liveHud ? liveHud.name(id) : id === v.you ? t('ui.common.you') : names[id]);
  const yourTurn = () => v && v.phase === 'playing' && v.turn === v.you && !busy && !queue.length && !playing;

  // a match's racks and tags as the view has them
  function seatState() {
    for (const s of v.seats) {
      cutTags[side(s.id)].hidden = !s.cut || v.phase !== 'playing';
      room.setHp(side(s.id), s.hp, { max: v.maxHp ?? MAX_HP, cut: !!s.cut });
    }
  }

  // the shells left, on the rack beside the gun
  const rackFrom = (v) => (v.phase !== 'playing' || !v.left ? room.rackSet(0, 0) : v.liveLeft === null ? room.rackSet(v.left, 0, { unknown: true }) : room.rackSet(v.liveLeft, v.blankLeft));

  function settle() {
    if (liveHud) liveHud.update(v, names);
    thud.seal(v.commit);
    rackFrom(v);
    thud.match(v, names);
    wins = v.wins;
    seatState();
    if (v.phase === 'over') thud.result(v, names);
    const known = [];
    const word = (live) => (live ? t('ui.roulette.live') : t('ui.roulette.blank'));
    if (v.know) known.push(t('ui.roulette.peekThis', { shell: word(v.know.live) }));
    peek.hidden = !known.length;
    peek.textContent = known.join(' · ');
    const oppSeat = v.seats.find((s) => s.id !== v.you);
    // avatar: its resting state follows the table
    if (v.phase === 'over') opp.setState(!v.winner ? 'offline' : v.winner === v.you ? 'lost' : 'won', { hp: oppSeat.hp });
    else opp.setState(v.turn === v.you ? 'idle' : 'thinking', { hp: oppSeat.hp });
    const match = v.rules === 'bo3';
    if (v.phase === 'over') status(!v.winner ? t('ui.roulette.gameOver') : v.winner === v.you ? (match ? t('ui.roulette.matchWonStatus', { a: v.wins[v.you], b: v.wins[oppId()] }) : t('ui.roulette.oppOfflineYouWin', { name: names[oppId()] })) : match ? t('ui.roulette.matchLostStatus', { name: names[oppId()], a: v.wins[oppId()], b: v.wins[v.you] }) : t('ui.roulette.youOfflineStatus'));
    else if (v.turn === v.you) status(v.double ? t('ui.roulette.yourTurnHot') : t('ui.roulette.yourTurn'), 'you');
    else status(t('ui.roulette.thinking', { name: names[v.turn] }), 'opp');
    setMood(v);
  }

  // Lay the table out as the view says, without animation: on first load and reconnect.
  function syncInstant() {
    room.clearItems();
    room.clearSpent();
    room.setSlots(v.seats[0].items.length);
    wins = v.wins;
    for (const s of v.seats) {
      room.setHp(side(s.id), s.hp, { max: v.maxHp ?? MAX_HP, cut: !!s.cut });
      s.items.forEach((id, slot) => id && room.dealItem(side(s.id), slot, id, { instant: true, conjured: !!s.conjured?.[slot] }));
    }
    for (const f of v.fired) room.spend(f.live, { instant: true });
    rackFrom(v);
  }
  const FAKE = t('terms.fakeTool');

  async function play(e) {
    const w = side(e.seat ?? v.you);
    switch (e.type) {
      case 'load': {
        room.clearSpent();
        room.rackSet(0, 0);
        status(t('ui.roulette.loading'));
        if (liveHud && e.round === 1 && (e.stage ?? 1) === 1) liveHud.newGame();
        toast(e.stage ? t('ui.roulette.loadStage', { stage: e.stage, live: e.live, blank: e.blank }) : t('ui.roulette.loadRound', { round: e.round, live: e.live, blank: e.blank }), 2000);
        if (e.stage) thud.match({ ...v, stage: e.stage, wins: wins ?? v.wins }, names);
        log(t('ui.roulette.loaded', { live: e.live, blank: e.blank }));
        sfx('round');
        sfx('lay', { count: e.live + e.blank, gap: 0.09 });
        await room.layShells([...Array(e.live).fill(true), ...Array(e.blank).fill(false)]);
        await wait(1500);
        sfx('load', { count: e.live + e.blank, gap: 0.11 });
        await room.loadShells();
        await room.rackFill(e.live, e.blank);
        for (const [id, dealt] of Object.entries(e.dealt)) {
          for (const d of dealt) {
            sfx('deal', { slot: d.slot });
            await room.dealItem(side(id), d.slot, d.item);
          }
          if (e.lost[id]) log(t('ui.roulette.itemsFull', { who: nameOf(id), n: e.lost[id] }));
        }
        break;
      }
      case 'use': {
        const it = ITEMS[e.item];
        const id = e.took?.item ?? e.item; // what actually happens: a 越狱 uses what it took
        const them = w === 'you' ? 'opp' : 'you';
        const themId = e.seat === v.you ? oppId() : v.you;
        if (e.fake) {
          // a 幻觉 item that never existed: it tears and is gone, nothing happens
          opp.setState(w === 'opp' ? 'fakeItem' : 'noticeFake', { item: e.item }); // avatar
          sfx('fake');
          await room.vanishItem(w, e.slot);
          if (liveHud) liveHud.used({ seat: e.seat ?? v.you, item: e.item, fake: true });
          else toast(FAKE, 1800);
          log(t('ui.roulette.usedFake', { who: nameOf(e.seat), item: it.name, fake: FAKE }));
          await wait(500);
          break;
        }
        const healed = id === 'cache' && !e.cut && !e.took?.fake;
        opp.setState(healed && w === 'opp' ? 'healed' : w === 'opp' ? 'useItem' : 'noticeItem', { item: e.item }); // avatar
        sfx('use', { item: e.item });
        await room.useItem(w, e.slot);
        if (liveHud) liveHud.used({ seat: e.seat ?? v.you, item: e.item, took: e.took && { item: id, fake: e.took.fake } });
        log(t('ui.roulette.used', { who: nameOf(e.seat), item: it.name }));
        if (e.took?.fake) {
          sfx('fake');
          await room.vanishItem(them, e.took.slot);
          if (!liveHud) toast(FAKE, 1800);
          log(t('ui.roulette.jailbreakFake', { item: ITEMS[id].name, fake: FAKE }));
          await wait(500);
          break;
        }
        if (e.took) {
          sfx('use', { item: id });
          await room.useItem(them, e.took.slot);
          log(themId === v.you ? t('ui.roulette.jailbreakTookYours', { item: ITEMS[id].name }) : t('ui.roulette.jailbreakTook', { name: names[themId], item: ITEMS[id].name }));
        }
        if (id === 'mirage') {
          // two items out of thin air, each maybe not there at all
          for (const m of e.made) {
            sfx('conjure');
            await room.dealItem(w, m.slot, m.item, { conjured: true });
          }
          const made = e.made.map((m) => ITEMS[m.item].name).join(t('ui.roulette.and'));
          log(e.lost ? t('ui.roulette.conjuredLost', { items: made, n: e.lost }) : t('ui.roulette.conjured', { items: made }));
        } else if (id === 'compact') {
          sfx('spend');
          room.rackTake(e.live);
          await room.spend(e.live);
          log(t('ui.roulette.compacted', { shell: e.live ? t('ui.roulette.live') : t('ui.roulette.blank') }));
        } else if (id === 'cache') {
          if (e.cut) {
            toast(t('ui.roulette.cacheCutToast'), 1600);
            log(t('ui.roulette.cacheCutLog'));
          } else room.setHp(w, e.hp, { max: e.max });
        }
        else if (id === 'inject') {
          log(t('ui.roulette.injected'));
          await room.rackMuddle();
        }
        else if (id === 'limit') log(t('ui.roulette.limited', { who: nameOf(themId) }));
        await wait(500);
        break;
      }
      case 'shoot': {
        const tg = side(e.target);
        status(w === 'you' ? (e.target === e.seat ? t('ui.roulette.aimYouSelf') : t('ui.roulette.aimYouThem', { name: names[e.target] })) : e.target === e.seat ? t('ui.roulette.aimThemSelf', { name: names[e.seat] }) : t('ui.roulette.aimThemYou', { name: names[e.seat] }), w === 'opp' ? 'opp' : null);
        // avatar: holds the gun, or watches yours
        opp.setState(w === 'opp' ? (tg === 'you' ? 'aimYou' : 'aimSelf') : tg === 'opp' ? 'aimedAt' : 'watching', { gun: room.gun });
        sfx('aim');
        await room.aim(w, tg);
        await wait(w === 'opp' ? 1200 : 700);
        if (w === 'opp') opp.setState('fire', { live: e.live, target: tg }); // avatar
        sfx(e.live ? 'shot' : 'blank');
        await room.fire(e.live);
        if (!e.live) toast(t('ui.roulette.click'), 900);
        else if (e.refused !== undefined) {
          sfx('refused');
          await room.useItem(tg, e.refused);
          toast(t('ui.roulette.refused'), 1800);
        } else {
          if (e.refuseFake !== undefined) {
            // the refusal was a 幻觉: it tears away and the shot goes through
            sfx('fake');
            room.vanishItem(tg, e.refuseFake);
            log(t('ui.roulette.refuseFake', { who: nameOf(e.target), item: ITEMS.refuse.name }));
          }
          room.setHp(tg, e.hp, { max: e.max });
          room.hit(tg);
          sfx('hit', { who: tg });
          toast(e.refuseFake !== undefined ? t('ui.roulette.refuseFail', { fake: FAKE }) : t('ui.roulette.bang', { who: nameOf(e.target), n: e.damage }), 1300);
        }
        // avatar: how it takes the outcome
        if (tg === 'opp') opp.setState(!e.live ? 'relief' : e.refused !== undefined ? 'refused' : 'hit', { damage: e.damage, by: w });
        else if (e.live && e.refused === undefined) opp.setState(w === 'opp' ? 'scored' : 'wince');
        const shell = e.live ? t('ui.roulette.live') : t('ui.roulette.blank');
        log(w === 'you' ? (e.target === e.seat ? t('ui.roulette.shotYouSelf', { shell }) : t('ui.roulette.shotYouThem', { name: names[e.target], shell })) : e.target === e.seat ? t('ui.roulette.shotThemSelf', { name: names[e.seat], shell }) : t('ui.roulette.shotThemYou', { name: names[e.seat], shell }));
        sfx('spend');
        room.rackTake(e.live);
        await room.spend(e.live);
        opp.setState('idle'); // avatar: lets go of the gun
        await room.lower();
        break;
      }
      case 'skip':
        if (w === 'opp') opp.setState('limited'); // avatar
        sfx('skip');
        log(t('ui.roulette.skipped', { who: nameOf(e.seat) }));
        break;
      case 'quit':
        if (w === 'opp') opp.setState('offline'); // avatar
        sfx('quit');
        log(t('ui.roulette.quit', { who: nameOf(e.seat) }));
        break;
      case 'round_over': {
        const won = e.winner === v.you;
        const last = Math.max(...Object.values(e.wins)) >= 2;
        room.rackSet(0, 0);
        wins = e.wins;
        thud.match({ ...v, stage: e.stage, wins }, names);
        opp.setState(e.winner === v.you ? 'roundLost' : 'roundWon', { stage: e.stage, wins: e.wins }); // avatar
        sfx(won ? 'roundWin' : 'roundLose');
        if (liveHud) liveHud.roundOver({ stage: e.stage, stages: v.stages ?? 3, winner: e.winner });
        log(t('ui.roulette.roundLog', { stage: e.stage, who: nameOf(e.winner), a: e.wins[v.you], b: e.wins[oppId()] }));
        await thud.banner({ stage: e.stage, stages: v.stages ?? 3, won, who: nameOf(e.winner), wins: e.wins, you: v.you, opp: oppId(), names, last, next: last ? null : { hp: ROUND_HP[e.stage], first: nameOf(won ? oppId() : v.you) } });
        if (!last) {
          for (const who in cutTags) cutTags[who].hidden = true;
          room.clearSpent();
          await room.refill(ROUND_HP[e.stage]);
        }
        break;
      }
      case 'game_over':
        if (e.winner && e.winner !== v.you) opp.setState('cheer'); // avatar: the match is its
        room.rackSet(0, 0);
        sfx(!e.winner ? 'over' : e.winner === v.you ? 'win' : 'lose');
        if (liveHud) liveHud.gameOver(e.winner);
        else if (e.wins) toast(!e.winner ? t('ui.roulette.matchOver') : e.winner === v.you ? t('ui.roulette.matchWonToast', { a: e.wins[v.you], b: e.wins[oppId()] }) : t('ui.roulette.matchLostToast', { name: names[oppId()] }), 3000);
        else toast(!e.winner ? t('ui.roulette.gameOver') : e.winner === v.you ? t('ui.roulette.oppOut', { name: names[oppId()] }) : t('ui.roulette.youOut'), 3000);
        log(t('ui.roulette.gameOverLog'));
        break;
    }
  }

  // States arrive faster than the room can play them out; play them in order.
  async function drain() {
    if (playing) return;
    playing = true;
    while (queue.length) {
      const s = queue.shift();
      const first = shown === null;
      v = s.view;
      for (const seat of s.seats) names[seat.id] = seat.name;
      hud.setOppName?.(s.seats.find((x) => x.id !== v.you)?.name);
      // Chat first: a line the agent sent with its move belongs before the move plays.
      for (const c of s.chat.slice(chatShown)) {
        const text = c.text.trim();
        if (c.rename) log(hud.renameLine(c.rename));
        else if (c.seat === v.you) {
          if (first) log(text, 'you'); // your own lines were logged when you sent them
          else if (EMOJI_ONLY.test(text)) setTimeout(() => opp.setState('catch', { emoji: text }), 650); // avatar: your emoji lands, as the thrown one reaches it
        } else if (first) log(text, 'opp');
        else if (EMOJI_ONLY.test(text)) {
          opp.setState('emote', { emoji: text, mood: c.mood }); // avatar
          sfx('emote');
        }
        else say(text, c.mood); // avatar
      }
      chatShown = s.chat.length;
      if (first) {
        syncInstant();
        shown = v.log.length;
        if (v.phase !== 'over') greet(opp); // avatar: you sat down
      }
      for (const e of v.log.slice(shown)) {
        await play(e);
        if (e.mood) opp.setState('emote', { mood: e.mood }); // avatar: how it looks after its move
      }
      shown = v.log.length;
    }
    playing = false;
    settle();
    if (yourTurn() && peekToast) {
      toast(peekToast, 1400);
      peekToast = null;
    }
    for (const r of idlers.splice(0)) r();
  }

  // A reconnect lays the table out again from scratch.
  let ws = null;
  let closed = false; // the game was taken off the table: no more reconnects
  stage.onDispose(() => {
    closed = true;
    ws?.close();
  });
  function connect() {
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?table=${table}&k=${k}&lang=${lang}`);
    ws.onopen = () => {
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
    ws.onclose = async () => {
      if (closed || v?.phase === 'over') return;
      // The server stops when nobody uses it, and only the agent's next command starts it.
      const up = await serverUp();
      status(t(up ? 'ui.roulette.reconnecting' : 'ui.table.asleep'));
      setTimeout(connect, up ? 1500 : 5000);
    };
  }
  // A director's script stands in for the server: its states go through the same queue.
  if (director)
    import('./director/index.js').then((d) =>
      d.run(director, {
        game: 'roulette',
        scene,
        stage,
        room,
        opp,
        hud,
        push: (s) => (queue.push(s), drain()),
        idle: () => (playing || queue.length ? new Promise((r) => idlers.push(r)) : Promise.resolve()),
        // your hand on the gun before a shot, as a player's pointer would have it
        async before(m) {
          if (m.who !== 'you' || !m.shoot || m.aim === 0 || document.documentElement.classList.contains('live')) return;
          showChoice();
          preview(m.shoot === 'self' ? 'you' : 'opp')();
          await new Promise((r) => setTimeout(r, m.aim ?? 900));
          putAway(false);
        },
      }),
    );
  else connect();

  // ---- your hands on the table ----
  async function move(body) {
    busy = true;
    const shot = body.action === 'shoot';
    if (!choice.hidden) putAway(!shot); // a shot keeps the gun where you pointed it
    const r = await send('act', body).catch((err) => ({ error: String(err) }));
    busy = false;
    if (r.error) {
      if (shot) room.lower();
      toast(r.error, 1800);
      settle();
    }
  }
  const tips = (name) => {
    if (!v) return null;
    if (name === 'gun') return yourTurn() ? t('ui.roulette.tipGun') : null;
    if (name === 'rack') {
      if (v.phase !== 'playing' || !v.left) return { title: t('ui.roulette.tipRack'), text: t('ui.roulette.tipEmpty') };
      return { title: t('ui.roulette.tipLeft', { n: v.left }), text: v.liveLeft === null ? t('ui.roulette.tipMuddled') : t('ui.roulette.tipCounts', { live: v.liveLeft, blank: v.blankLeft }), color: '#ff6b75' };
    }
    const m = /^item:(you|opp):(\d)$/.exec(name);
    if (!m) return null;
    const seat = v.seats.find((s) => side(s.id) === m[1]);
    const id = seat?.items[Number(m[2])];
    if (!id) return null;
    const it = ITEMS[id];
    const conj = seat.conjured?.[Number(m[2])];
    const text = conj ? `${CONJURED_TIP} · ${it.tip}` : it.tip;
    const shown = conj ? t('ui.roulette.maybe', { item: it.name }) : it.name;
    if (picking !== null && m[1] === 'opp') return { title: t('ui.roulette.jailbreakPick', { item: shown }), text: UNTAKEABLE.has(id) ? t('ui.roulette.untakeable') : text, color: ITEMS.jailbreak.color };
    return { title: m[1] === 'opp' ? t('ui.roulette.theirItem', { name: seat.name, item: shown }) : shown, text, color: conj ? ITEMS.mirage.color : it.color };
  };
  let picking = null; // the slot of your 越狱, waiting for you to pick one of theirs
  async function act(name) {
    if (!yourTurn()) return;
    const taken = /^item:opp:(\d)$/.exec(name);
    if (taken && picking !== null) {
      const id = v.seats.find((s) => s.id === oppId()).items[Number(taken[1])];
      if (UNTAKEABLE.has(id)) return toast(t('ui.roulette.cantTake', { item: ITEMS[id].name }), 1400);
      const slot = picking;
      picking = null;
      if (id === 'cot') peekToast = t('ui.roulette.peekToast');
      return move({ action: 'use', slot, pick: Number(taken[1]) });
    }
    picking = null;
    if (name === 'gun') return showChoice();
    const m = /^item:you:(\d)$/.exec(name);
    if (!m) return;
    const slot = Number(m[1]);
    const id = v.seats.find((s) => s.id === v.you).items[slot];
    if (id === 'refuse') return toast(t('ui.roulette.refuseClick'), 1600);
    if (id === 'jailbreak') {
      if (!v.seats.find((s) => s.id === oppId()).items.some((x) => x && !UNTAKEABLE.has(x))) return toast(t('ui.roulette.nothingToTake'), 1600);
      picking = slot;
      return toast(t('ui.roulette.pickTheirs'), 2000);
    }
    if (id === 'cot') peekToast = t('ui.roulette.peekToast');
    await move({ action: 'use', slot });
  }
  hud.interact(tips, act);

  // The gun up: it turns toward whichever target the pointer is on, and the camera
  // holds still meanwhile so a target never slides out from under the pointer.
  // 1 shoots the agent, 2 yourself, Esc puts it down.
  function showChoice() {
    atOpp.lastChild.textContent = t('ui.roulette.aimAt', { name: names[oppId()] });
    choice.hidden = false;
    stage.holdLook(true);
    room.hold('up');
  }
  function putAway(lower = true) {
    choice.hidden = true;
    stage.holdLook(false);
    opp.setState('idle'); // avatar
    if (lower) room.lower();
  }
  const preview = (to) => () => {
    if (choice.hidden) return;
    room.hold(to);
    // avatar: it sees where the muzzle went
    if (to === 'opp') opp.setState('aimedAt', { gun: room.gun });
    else if (to === 'you') opp.setState('watching', { gun: room.gun });
    else opp.setState('idle');
  };
  atOpp.onpointerenter = preview('opp');
  atSelf.onpointerenter = preview('you');
  atOpp.onpointerleave = atSelf.onpointerleave = preview('up');
  atOpp.onclick = () => move({ action: 'shoot', target: 'other' });
  atSelf.onclick = () => move({ action: 'shoot', target: 'self' });
  putDown.onclick = () => putAway();
  const typing = () => document.activeElement?.matches('input, textarea');
  const keys = new AbortController();
  window.addEventListener(
    'keydown',
    (e) => {
      if (choice.hidden || typing() || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '1') move({ action: 'shoot', target: 'other' });
      else if (e.key === '2') move({ action: 'shoot', target: 'self' });
      else if (e.key === 'Escape') putAway();
    },
    { signal: keys.signal },
  );
  stage.onDispose(() => {
    keys.abort();
    stage.holdLook(false);
  });
}
