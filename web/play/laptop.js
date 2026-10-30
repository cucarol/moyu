// The agent's laptop, open on the raft's side table among the radio and the lantern: an
// old cream clamshell with a dark keyboard deck, a couple of stickers and its charger
// lead trailing off the table. Its glass is one of the scene's screens (the director puts
// its pictures on it, see director/screens.js): a 16:10 plane facing its local +z, with a
// MeshBasicMaterial. With no picture up it rests on a quiet screen of its own, dim, a
// little fish drifting across now and then, and glows a touch more as night falls.
//
// Unsnapped (plain Lambert, not stage.js mat()): a push-in squares onto the glass, and the
// shell's edges must stay put round it.
import { THREE, canvasTex, drawBits } from './stage.js';

export const LAPTOP = { w: 0.29, d: 0.2, lid: 0.19, glass: [0.25, 0.25 * 0.625] };

const SHELL = '#c9c2b0';
const lambert = (opts) => new THREE.MeshLambertMaterial(opts);

// the deck from above: the keys, a trackpad, the palm rest and a sticker on it
const deckTex = canvasTex(58, 40, (ctx) => {
  const P = (c, x, y, w = 1, h = 1) => ((ctx.fillStyle = c), ctx.fillRect(x, y, w, h));
  P(SHELL, 0, 0, 58, 40);
  P('#b5ae9c', 0, 0, 58, 1); // the edge by the hinge, in its shadow
  // the keyboard well and its keys, five rows, a long space bar
  P('#2a2a30', 3, 3, 52, 19);
  for (let row = 0; row < 5; row++)
    for (let k = 0; k < 13; k++) {
      if (row === 4 && k > 3 && k < 9) continue;
      P('#4a4a52', 4 + k * 4, 4 + row * 4, 3, 3);
      P('#5c5c66', 4 + k * 4, 4 + row * 4, 3, 1);
    }
  P('#4a4a52', 20, 20, 19, 3);
  P('#5c5c66', 20, 20, 19, 1);
  // the trackpad and its button bar
  P('#b8b1a0', 21, 25, 16, 10);
  P('#aaa392', 21, 33, 16, 2);
  // stickers: a fish on the left of the palm rest, a little green 'ok' on the right
  drawBits(ctx, ['..XXX..X', '.XXXXXXX', 'XX.XXXXX', '.XXXXXXX', '..XXX..X'], 5, 28, 1, '#5aa8c8');
  P('#2f7a5a', 46, 28, 7, 5);
  P('#9fe8b8', 47, 30, 2, 1);
  P('#9fe8b8', 50, 29, 1, 3);
  P('#9fe8b8', 51, 30, 1, 1);
});
// the back of the lid: the maker's mark worn off, and two stickers
const lidBackTex = canvasTex(58, 38, (ctx) => {
  const P = (c, x, y, w = 1, h = 1) => ((ctx.fillStyle = c), ctx.fillRect(x, y, w, h));
  P(SHELL, 0, 0, 58, 38);
  P('#bdb6a4', 26, 16, 6, 6);
  // a Clawd, orange, a little crooked
  P('#d97757', 8, 8, 12, 8);
  P('#d97757', 6, 11, 2, 2);
  P('#d97757', 20, 11, 2, 2);
  for (const x of [9, 12, 16, 18]) P('#d97757', x, 16, 1, 2);
  P('#1a0e0a', 11, 10, 1, 2);
  P('#1a0e0a', 17, 10, 1, 2);
  // a round one from somewhere, half peeled
  for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) if (x * x + y * y <= 26 && !(x > 2 && y < -1)) P(x * x + y * y > 15 ? '#e8d070' : '#3a5a9a', 43 + x, 25 + y);
});
// the lid's front: the bezel round the glass, a webcam dot
const bezelTex = canvasTex(58, 38, (ctx) => {
  ctx.fillStyle = '#1c1c22';
  ctx.fillRect(0, 0, 58, 38);
  ctx.fillStyle = '#2a2a32';
  ctx.fillRect(0, 0, 58, 1);
  ctx.fillStyle = '#3a3a44';
  ctx.fillRect(28, 1, 2, 1);
});

// the screen with nothing up: deep blue going to black at the edges, a faint band of
// light, and now and then a small fish crossing slowly. Drawn small: it is a few pixels
// in the room.
const IDLE_W = 80;
const IDLE_H = 50;
const fishBits = ['..XXX...X', '.XXXXX.XX', 'XX.XXXXXX', '.XXXXX.XX', '..XXX...X'];
function drawIdle(ctx, t, night) {
  for (let y = 0; y < IDLE_H; y++) {
    const v = 1 - Math.abs(y - IDLE_H / 2) / (IDLE_H / 2);
    const k = 0.55 + 0.45 * v;
    ctx.fillStyle = `rgb(${Math.round(10 * k)},${Math.round(22 * k)},${Math.round(40 * k)})`;
    ctx.fillRect(0, y, IDLE_W, 1);
  }
  // a soft glow in the middle, a little more at night
  const g = ctx.createRadialGradient(IDLE_W / 2, IDLE_H / 2, 2, IDLE_W / 2, IDLE_H / 2, IDLE_W * 0.55);
  g.addColorStop(0, `rgba(70,120,170,${0.22 + 0.12 * night})`);
  g.addColorStop(1, 'rgba(70,120,170,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, IDLE_W, IDLE_H);
  // the fish: one crossing every 24 s, taking 14 of them, bobbing a little
  const u = (t % 24) / 14;
  if (u < 1) {
    const x = Math.round(-10 + u * (IDLE_W + 12));
    const y = Math.round(IDLE_H * 0.55 + Math.sin(t * 1.3) * 2);
    drawBits(ctx, fishBits, x, y, 1, `rgba(120,200,220,${0.45 + 0.2 * night})`);
  }
}

// at: where it stands (its middle, the table top under it), turn: about y (0 faces +z)
export function buildLaptop(stage, { parent, at, turn = 0 }) {
  const { onFrame } = stage;
  const { w: W, d: D, lid: LH } = LAPTOP;
  const g = new THREE.Group();
  const shell = lambert({ color: 0xc9c2b0 });
  const shellDark = lambert({ color: 0xa8a190 });
  // the base: a slim slab, its top the deck
  const base = new THREE.Mesh(new THREE.BoxGeometry(W, 0.016, D), [shellDark, shellDark, lambert({ map: deckTex }), shellDark, shellDark, shellDark]);
  base.position.y = 0.008;
  // rubber feet, just showing
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.003, 0.018), lambert({ color: 0x2a2a2a }));
    f.position.set(x * (W / 2 - 0.02), -0.0015, z * (D / 2 - 0.02));
    base.add(f);
  }
  // the hinge: a barrel along the back edge
  const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, W * 0.8, 8), shellDark);
  hinge.rotation.z = Math.PI / 2;
  hinge.position.set(0, 0.016, -D / 2 + 0.004);
  g.add(base, hinge);
  // the lid, open a little past upright, the glass on its front
  const lid = new THREE.Group();
  lid.position.set(0, 0.016, -D / 2 + 0.004);
  lid.rotation.x = -0.27;
  const lidBox = new THREE.Mesh(new THREE.BoxGeometry(W, LH, 0.009), [shell, shell, shell, shell, lambert({ map: bezelTex }), lambert({ map: lidBackTex })]);
  lidBox.position.set(0, LH / 2 + 0.004, -0.0045);
  // the glass: what the director draws on (screens.laptop)
  const idle = document.createElement('canvas');
  idle.width = IDLE_W;
  idle.height = IDLE_H;
  const idleCtx = idle.getContext('2d');
  const idleTex = new THREE.CanvasTexture(idle);
  idleTex.colorSpace = THREE.SRGBColorSpace;
  idleTex.magFilter = idleTex.minFilter = THREE.NearestFilter;
  idleTex.generateMipmaps = false;
  const [GW, GH] = LAPTOP.glass;
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(GW, GH), new THREE.MeshBasicMaterial({ map: idleTex, fog: false, toneMapped: false }));
  glass.position.set(0, LH / 2 + 0.004 + 0.006, 0.0002);
  lid.add(lidBox, glass);
  g.add(lid);
  // its light on the keys and the table round it, cool
  const light = new THREE.PointLight(0x8fb8ff, 0.18, 0.7, 1.8);
  light.position.set(0, 0.1, 0.05);
  g.add(light);
  // the charger lead: out of the right side, over the table's edge and down
  const lead = new THREE.CatmullRomCurve3([
    new THREE.Vector3(W / 2, 0.008, -0.03),
    new THREE.Vector3(W / 2 + 0.04, 0.004, -0.02),
    new THREE.Vector3(W / 2 + 0.07, 0.002, 0.03),
    new THREE.Vector3(W / 2 + 0.085, -0.03, 0.06),
    new THREE.Vector3(W / 2 + 0.09, -0.3, 0.08),
  ]);
  const cord = new THREE.Mesh(new THREE.TubeGeometry(lead, 24, 0.0035, 4, false), lambert({ color: 0x1a1a1c }));
  g.add(cord);
  g.traverse((o) => o.isMesh && o !== glass && (o.castShadow = o.receiveShadow = true));
  g.position.copy(at);
  g.rotation.y = turn;
  parent.add(g);

  // the idle screen, redrawn a few times a second, and never while a picture is up
  let night = 0;
  let next = 0;
  onFrame((t) => {
    if (glass.userData.custom || t < next) return;
    next = t + 0.12;
    drawIdle(idleCtx, t, night);
    idleTex.needsUpdate = true;
  });
  drawIdle(idleCtx, 0, 0);
  return {
    glass,
    // the whole laptop and its charger lead, for a script that moves it (pv-raft.js laptop)
    body: g,
    cord,
    // n: 0 at dusk, 1 at night (casino.js onNight)
    night(n) {
      night = n;
      light.intensity = 0.18 + 0.22 * n;
    },
  };
}
