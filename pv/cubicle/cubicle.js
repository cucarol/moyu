// The desk: square on to your own station in an open-plan office, and nothing past it: lights
// off, the low divider, the frosted glass on top going into the dark. The desk says who you are:
// thermos with goji, the nap pillow, the takeaway bag, the pothos, the desk calendar, the badge,
// the power strip, notes on the divider. On the laptop the session (story.js) in the pixel Code
// tab (ui.js), the little Clawd on its input box. Twice a day, ?shot=:
//   noon   the film's opening. Afternoon sun through the blinds. Close on the laptop, the camera
//          pushing in without stopping. First your own sigh, the hook: a pixel 😭 over 工作好无聊
//          in big pixel type, a third of the frame, the room dimmed. Then you type 跑一下测试 and
//          hit Enter, the tests start and
//          crawl. Clawd, fishing, gets restless, puts the rod down, jumps out of the screen as the
//          game's 3D Clawd onto the keyboard (the camera taking it up and riding with it), and
//          shouts in big letters in the air: 等测试的时候 / 玩会游戏吧！
//   dusk   back from the machine room: the whole game has just shrunk into a window at the top
//          left of the laptop's desktop (the room's last frame in it, pv/cubicle/gen/machine-<lang>.png;
//          the shrink itself is laid over in pv/cut/join.py), in a red low sun, the camera still on
//          the glass. The window closes, Clawd drops back onto the input box, you ask for the build,
//          and it's straight out again; the camera cuts in on it as it bursts out: 等打包的时候 / 再来一局！
// Each ends with Clawd diving back into the screen and the camera following it in, onto the cut's
// frame (ui.js CUT), where the next game's screen picks up the same picture. Clawd shouts in its
// babble voice (audio.js speak), heard in a render too.
// ?t= freezes a frame (seconds).
import { lang } from '/web/play/i18n.js';
import { createStage, mat, canvasTex, noiseTex, pixelText, THREE } from '/web/play/stage.js';
import { createAvatar } from '/web/play/avatar/core.js';
import clawdAvatar from '/web/play/avatar/clawd.js';
import { renderSound, speak } from '/web/play/audio.js';
import { createUI, CUT } from './ui.js';
import { createSession, ASKS, PARTS } from './story.js';

await document.fonts.load('12px FusionPixel');
const q = new URLSearchParams(location.search);
const SHOT = q.get('shot') ?? 'noon';
if (SHOT !== 'noon' && SHOT !== 'dusk') throw new Error(`shot: noon or dusk, not ${SHOT}`);
const L = (zh, en) => (lang === 'en' ? en : zh);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

const stage = createStage(document.querySelector('#view'), { background: 0x16161a, fog: [0x17161a, 0.3], look: 0, vignette: 0.55, far: 8 });
const { scene, camera } = stage;
stage.post.uLofi.value = 0.35; // drowsy: softer contrast, lifted blacks, a little grain

// ---- building blocks ----
function box(w, h, d, color, x, y, z, { map, r = [0, 0, 0], shadow = true, parent = scene, opts = {} } = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat({ color, map, ...opts }));
  m.position.set(x, y, z);
  m.rotation.set(...r);
  m.castShadow = m.receiveShadow = shadow;
  parent.add(m);
  return m;
}
function cyl(rt, rb, h, color, x, y, z, { seg = 14, r = [0, 0, 0], map, parent = scene } = {}) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat({ color, map }));
  m.position.set(x, y, z);
  m.rotation.set(...r);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}
// a flat thing with print on it (paper, a note), facing +z, its canvas at about one texel per frame pixel
const PPM = 960; // texels a metre, near enough to the frame's pixels at the divider
function card(w, h, draw, x, y, z, { r = [0, 0, 0], ppm = PPM, parent = scene } = {}) {
  const px = [Math.round(w * ppm), Math.round(h * ppm)];
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat({ map: canvasTex(px[0], px[1], (ctx) => draw(ctx, ...px)), side: THREE.DoubleSide }));
  m.position.set(x, y, z);
  m.rotation.set(...r);
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
const ink = (ctx, s, x, y, color) => ctx.drawImage(pixelText(s, { size: 12, color }), x, y);
function tube(points, radius, color) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => V(...p)));
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, points.length * 8, radius, 5), mat({ color }));
  m.castShadow = m.receiveShadow = true;
  scene.add(m);
  return m;
}

// ---- the desk and its divider ----
const D = 0.74; // the desktop's height
box(1.6, 0.025, 0.9, 0xd9d6cf, 0, D - 0.0125, -0.1, { map: noiseTex(64, 32, [217, 214, 207], 6, 3) });
box(1.6, 0.02, 0.01, 0x9a9a98, 0, D - 0.012, 0.35); // the edge band
const P = -0.5; // the divider's face
box(1.6, 0.26, 0.03, 0x5f6874, 0, D + 0.12, P - 0.015, { map: noiseTex(96, 24, [95, 104, 116], 14, 7) });
box(1.6, 0.018, 0.04, 0xa8adb3, 0, D + 0.258, P - 0.015);
// frosted glass above it, a pale pane going off into the dark office
const frost = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.2, 0.006), mat({ color: 0xaab4bf, transparent: true, opacity: 0.5 }));
frost.position.set(0, D + 0.367, P - 0.015);
frost.receiveShadow = true;
scene.add(frost);
box(1.6, 0.012, 0.03, 0xa8adb3, 0, D + 0.472, P - 0.015);
// the side panels to the neighbours, the station's walls
for (const sx of [-0.74, 0.74]) {
  box(0.03, 0.4, 0.75, 0x5f6874, sx, D + 0.2, P + 0.36, { map: noiseTex(48, 24, [95, 104, 116], 14, sx > 0 ? 9 : 11) });
  box(0.04, 0.018, 0.76, 0xa8adb3, sx, D + 0.405, P + 0.36);
}
// a U-shaped neck pillow hooked on the left panel
const neck = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.03, 6, 12, Math.PI * 1.5), mat({ color: 0x8a6fa8 }));
neck.position.set(-0.71, D + 0.3, -0.05);
neck.rotation.set(0, Math.PI / 2, Math.PI * 0.75);
neck.castShadow = true;
scene.add(neck);

// ---- the divider's face: what's pinned and stuck there ----
const PIN = P + 0.002;
const pin = (x, y, c = 0xd23c2c) => box(0.008, 0.008, 0.008, c, x, y, PIN + 0.004, { shadow: false });
function sticky(x, y, rz, color, lines, w = 0.072) {
  card(w, w, (ctx, W, H) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fillRect(0, 0, W, 6);
    lines.forEach((s, i) => ink(ctx, s, 4, 9 + i * 14, '#2a2620'));
  }, x, y, PIN, { r: [0, 0, rz] });
}
sticky(-0.37, D + 0.17, 0.05, '#f2d45c', [L('需求', 'spec'), L('又改了', 'changed'), L('!!!', 'AGAIN')], 0.078);
sticky(-0.285, D + 0.19, -0.07, '#f39ab3', [L('周五', 'ship'), L('上线', 'Fri')]);
sticky(0.3, D + 0.18, 0.08, '#8fd3c7', [L('打卡', 'clock'), L('别忘', 'out!')]);
sticky(0.38, D + 0.13, -0.04, '#f2d45c', [L('周报', 'weekly'), L('周报', 'report')]);
// the quarter's OKRs, printed and pinned, never read again
card(0.12, 0.16, (ctx, W, H) => {
  ctx.fillStyle = '#eceae3';
  ctx.fillRect(0, 0, W, H);
  ink(ctx, 'Q4 OKR', 6, 4, '#2a2620');
  ctx.fillStyle = '#aaa59a';
  for (let i = 0; i < 8; i++) ctx.fillRect(8, 26 + i * 14, 40 + ((i * 29) % 50), 3);
  ctx.fillStyle = '#d23c2c';
  for (let i = 0; i < 3; i++) ctx.fillRect(6, 25 + i * 28, 4, 4);
}, -0.5, D + 0.13, PIN, { r: [0, 0, 0.03] });
pin(-0.5, D + 0.2);
// a postcard of the sea
card(0.11, 0.072, (ctx, W, H) => {
  ctx.fillStyle = '#f2efe6';
  ctx.fillRect(0, 0, W, H);
  for (const [c, y, h] of [['#8fc6e8', 0.05, 0.4], ['#3f8fc4', 0.45, 0.25], ['#e8d29a', 0.7, 0.25]]) (ctx.fillStyle = c), ctx.fillRect(4, y * H, W - 8, h * H);
  ctx.fillStyle = '#fff3c4';
  ctx.fillRect(W * 0.72, H * 0.12, 8, 8);
}, 0.5, D + 0.18, PIN, { r: [0, 0, -0.05] });
pin(0.5, D + 0.21);
// the badge, hung on its lanyard from a pin
card(0.055, 0.082, (ctx, W, H) => {
  ctx.fillStyle = '#f5f5f2';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#3a6fd8';
  ctx.fillRect(0, 0, W, 10);
  ctx.fillStyle = '#7a8496';
  ctx.fillRect(W / 2 - 12, 16, 24, 28);
  ink(ctx, 'cuca', W / 2 - 12, 50, '#2a2620');
}, 0.19, D + 0.1, PIN + 0.008, { r: [0, 0, 0.05] });
tube([[0.18, D + 0.14, PIN + 0.008], [0.16, D + 0.19, PIN + 0.012], [0.2, D + 0.235, PIN + 0.006], [0.23, D + 0.19, PIN + 0.012], [0.2, D + 0.14, PIN + 0.008]], 0.0025, 0x3a6fd8);
pin(0.2, D + 0.235);

// ---- the laptop ----
const lap = new THREE.Group();
lap.position.set(0, D, 0.03);
scene.add(lap);
const LW = 0.38, LD = 0.26, TILT = 0.26; // how far the lid leans back
const keys = canvasTex(66, 44, (ctx) => {
  ctx.fillStyle = '#2c2d31';
  ctx.fillRect(0, 0, 66, 44);
  ctx.fillStyle = '#16171a';
  for (let r = 0; r < 5; r++) for (let c = 0; c < 14; c++) ctx.fillRect(3 + c * 4.4, 3 + r * 4.4, 3.4, 3.4);
  ctx.fillRect(15, 25, 36, 3.4);
  ctx.fillStyle = '#26272b';
  ctx.fillRect(21, 31, 24, 11);
});
box(LW, 0.016, LD, 0x3a3b40, 0, 0.008, -LD / 2, { parent: lap });
const deck = new THREE.Mesh(new THREE.PlaneGeometry(LW - 0.02, LD - 0.02), mat({ map: keys }));
deck.rotation.x = -Math.PI / 2;
deck.position.set(0, 0.0165, -LD / 2);
deck.receiveShadow = true;
lap.add(deck);
const hinge = new THREE.Group();
hinge.position.set(0, 0.016, -LD + 0.005);
hinge.rotation.x = -TILT;
lap.add(hinge);
const LH = 0.25;
box(LW, LH, 0.007, 0x2a2b2f, 0, LH / 2, -0.004, { parent: hinge });
const ui = createUI({ L });
const SW = 0.344, SH = 0.215; // the glass, 16:10
const glass = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), new THREE.MeshBasicMaterial({ map: ui.tex, toneMapped: false, fog: false }));
glass.position.set(0, LH / 2 + 0.006, 0.0002);
hinge.add(glass);
// a sticky note on the bezel's corner
card(0.03, 0.03, (ctx, W, H) => ((ctx.fillStyle = '#f2d45c'), ctx.fillRect(0, 0, W, H), ink(ctx, 'pwd?', 0, 4, '#2a2620')), LW / 2 - 0.008, LH - 0.01, 0.001, { parent: hinge, r: [0, 0, -0.18], ppm: 700 });

scene.updateMatrixWorld(true);
const S = glass.getWorldPosition(V(0, 0, 0));
const N = V(0, 0, 1).applyQuaternion(glass.getWorldQuaternion(new THREE.Quaternion()));

// ---- left of the laptop ----
// the thermos, its lid off, goji afloat
cyl(0.03, 0.03, 0.17, 0xb4bcc4, -0.3, D + 0.085, -0.3);
cyl(0.031, 0.031, 0.02, 0x2e3a52, -0.3, D + 0.16, -0.3);
cyl(0.026, 0.026, 0.004, 0x6b4a2a, -0.3, D + 0.169, -0.3);
for (const [dx, dz] of [[0.01, 0.005], [-0.012, 0], [0, -0.012], [0.006, 0.014]]) box(0.008, 0.006, 0.006, 0xd0281e, -0.3 + dx * 0.8, D + 0.172, -0.3 + dz * 0.8, { shadow: false });
cyl(0.032, 0.032, 0.05, 0x2e3a52, -0.37, D + 0.032, -0.2, { r: [Math.PI / 2, 0.6, 0] });
// the pothos in a pot, its vines over the desk's back
cyl(0.05, 0.04, 0.09, 0xe8e4da, -0.46, D + 0.045, -0.38);
const leaf = (x, y, z, s = 1, r = 0) => box(0.03 * s, 0.004, 0.026 * s, [0x4f8a3a, 0x63a04a, 0x3f7430][Math.abs(Math.round(x * 100 + z * 50)) % 3], x, y, z, { r: [0.3 + r, r * 2, r] });
for (const [x, y, z, s, r] of [[-0.46, 0.12, -0.38, 1.3, 0], [-0.43, 0.11, -0.35, 1.1, 0.4], [-0.49, 0.115, -0.4, 1.2, -0.5], [-0.45, 0.14, -0.41, 1, 0.2], [-0.42, 0.13, -0.4, 1, -0.3], [-0.5, 0.1, -0.35, 1, 0.6]]) leaf(x, D + y, z, s, r);
tube([[-0.43, D + 0.09, -0.35], [-0.38, D + 0.05, -0.28], [-0.36, D + 0.005, -0.2], [-0.4, D + 0.004, -0.1], [-0.47, D + 0.004, -0.05]], 0.0025, 0x3f7430);
for (const [x, z] of [[-0.37, -0.26], [-0.365, -0.19], [-0.39, -0.12], [-0.45, -0.06]]) leaf(x, D + 0.008, z, 0.9, 0.1);
// the desk calendar, flipped to today
function deskCal(x, z) {
  const g = new THREE.Group();
  g.position.set(x, D, z);
  g.rotation.y = 0.2;
  scene.add(g);
  box(0.13, 0.1, 0.004, 0x3a3a3c, 0, 0.045, -0.025, { parent: g, r: [-0.45, 0, 0] });
  card(0.12, 0.095, (ctx, W, H) => {
    ctx.fillStyle = '#f1eee6';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(0, 0, W, 16);
    ink(ctx, L('十月', 'OCT'), 6, 2, '#fff');
    ctx.drawImage(pixelText('31', { size: 12, color: '#2a2620' }), 0, 0, 14, 12, W / 2 - 18, 24, 42, 36);
    ink(ctx, L('周五', 'FRI'), W / 2 - 12, H - 18, '#7a756a');
  }, 0, 0.048, 0.002, { parent: g, r: [0.45, 0, 0] });
}
deskCal(-0.5, -0.12);
// eye drops, the phone face down
cyl(0.009, 0.011, 0.04, 0xf0f0ee, -0.2, D + 0.02, -0.1, { seg: 8 });
cyl(0.004, 0.006, 0.012, 0x3a6fd8, -0.2, D + 0.046, -0.1, { seg: 6 });
box(0.075, 0.009, 0.155, 0x1a1a1d, -0.3, D + 0.0045, 0.06, { r: [0, 0.35, 0] });
// a parcel nobody opened, a ream of paper under it
box(0.22, 0.05, 0.3, 0xe8e6e0, -0.58, D + 0.025, -0.36);
box(0.2, 0.09, 0.15, 0xb08a5a, -0.57, D + 0.095, -0.36, { r: [0, 0.2, 0] });
box(0.2, 0.004, 0.03, 0xd8c070, -0.57, D + 0.141, -0.36, { r: [0, 0.2, 0], shadow: false });

// ---- right of the laptop ----
// the folding nap pillow, waiting
const pillow = new THREE.Group();
pillow.position.set(0.5, D, -0.3);
pillow.rotation.y = -0.15;
scene.add(pillow);
{
  const lump = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), mat({ color: 0x9aa6b8 }));
  lump.scale.set(0.16, 0.075, 0.11);
  lump.position.y = 0.05;
  lump.castShadow = lump.receiveShadow = true;
  pillow.add(lump);
  const hollow = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), mat({ color: 0x5a6476 }));
  hollow.scale.set(0.07, 0.02, 0.05);
  hollow.position.set(0, 0.112, 0.02);
  pillow.add(hollow);
}
// the coffee, paper cup and sleeve
cyl(0.04, 0.03, 0.11, 0xf2f0ea, 0.27, D + 0.055, -0.18);
cyl(0.039, 0.035, 0.04, 0x9a6a42, 0.27, D + 0.06, -0.18);
cyl(0.042, 0.042, 0.01, 0xf2f0ea, 0.27, D + 0.115, -0.18);
// the takeaway bag, knotted, chopsticks out
box(0.16, 0.08, 0.12, 0xf0efe8, 0.5, D + 0.04, -0.04, { r: [0, 0.4, 0], opts: { transparent: true, opacity: 0.85 } });
box(0.13, 0.05, 0.1, 0xb8442e, 0.5, D + 0.026, -0.04, { r: [0, 0.4, 0] });
box(0.03, 0.06, 0.012, 0xf0efe8, 0.47, D + 0.1, -0.03, { r: [0, 0.4, 0.5] });
box(0.03, 0.06, 0.012, 0xf0efe8, 0.53, D + 0.1, -0.05, { r: [0, 0.4, -0.5] });
cyl(0.003, 0.003, 0.2, 0xd9c08a, 0.43, D + 0.1, -0.0, { seg: 4, r: [0.2, 0, -0.6] });
cyl(0.003, 0.003, 0.2, 0xd9c08a, 0.435, D + 0.1, 0.01, { seg: 4, r: [0.15, 0, -0.55] });
// tissues, one pulled up
box(0.12, 0.07, 0.11, 0xe6dcc8, 0.24, D + 0.035, -0.4);
box(0.04, 0.05, 0.002, 0xffffff, 0.24, D + 0.09, -0.4, { r: [0, 0.3, 0.2] });
// the little USB fan, aimed at nobody
cyl(0.012, 0.016, 0.06, 0xf0f0ee, 0.12, D + 0.03, -0.42, { seg: 8 });
cyl(0.04, 0.04, 0.012, 0xf0f0ee, 0.12, D + 0.09, -0.42, { r: [Math.PI / 2 - 0.2, 0.3, 0] });
// the mouse on its pad
box(0.22, 0.003, 0.18, 0x22252b, 0.33, D + 0.0015, 0.08);
box(0.06, 0.025, 0.1, 0x3a3b40, 0.32, D + 0.014, 0.09, { r: [0, -0.15, 0] });

// ---- the power strip and its cables, the badge's spare lanyard ----
box(0.26, 0.03, 0.05, 0xeeeeea, -0.05, D + 0.015, -0.42, { r: [0, -0.08, 0] });
for (const x of [-0.13, -0.07, 0.0]) box(0.03, 0.035, 0.03, 0x1e1e20, x, D + 0.045, -0.425);
tube([[-0.165, D + 0.008, -0.06], [-0.22, D + 0.006, -0.16], [-0.16, D + 0.006, -0.3], [-0.13, D + 0.04, -0.41]], 0.004, 0x18181a);
tube([[0.32, D + 0.02, 0.04], [0.29, D + 0.008, -0.08], [0.18, D + 0.006, -0.22], [0.0, D + 0.04, -0.42]], 0.0025, 0x18181a);
tube([[0.12, D + 0.06, -0.42], [0.06, D + 0.006, -0.36], [-0.07, D + 0.04, -0.42]], 0.0025, 0xf0f0ee);

// ---- light: the time of day ----
// the office lights off all day; through the blinds over your right shoulder, the afternoon,
// then a low red sun from behind you throwing the laptop's shadow up the divider
const LIGHT = {
  noon: { hemi: [0x8a8a90, 0x2e261e, 0.85], sun: [0xffbf80, 3.4], dir: [-0.6, -0.45, -0.66], screen: 0.9, fill: [0xffe2c8, 0.5], bg: 0x16161a },
  dusk: { hemi: [0x6a5560, 0x24160f, 0.42], sun: [0xff6a2c, 5.2], dir: [-0.32, -0.2, -0.92], screen: 0.9, fill: [0xffb894, 0.3], bg: 0x170f0c },
}[SHOT];
scene.background = new THREE.Color(LIGHT.bg);
scene.add(new THREE.HemisphereLight(...LIGHT.hemi));
// the screen, on whatever faces it: a broad wash (a point light rings through the colour steps)
const screenLight = new THREE.DirectionalLight(0xa4b6dc, LIGHT.screen);
screenLight.position.copy(S);
screenLight.target.position.copy(S).add(V(0, -0.6, 1));
scene.add(screenLight, screenLight.target);
// one window's worth through the blinds
const SUN_DIR = V(...LIGHT.dir).normalize();
const sunAt = V(0.3, D + 0.13, P); // on the divider right of the screen, in frame
const sun = new THREE.DirectionalLight(...LIGHT.sun);
sun.position.copy(sunAt).addScaledVector(SUN_DIR, -3);
sun.target.position.copy(sunAt);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -1, right: 1, top: 1, bottom: -1, near: 0.5, far: 6 });
sun.shadow.bias = -0.0008;
scene.add(sun, sun.target);
// the window and its blinds: a wall with one opening, slats across it, casting but never drawn
const blinds = new THREE.Group();
blinds.position.copy(sunAt).addScaledVector(SUN_DIR, -1.4);
blinds.lookAt(sunAt);
scene.add(blinds);
const unseen = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide });
const WIN = { w: 0.36, h: 0.3 };
const wall = new THREE.Shape([V(-3, -3), V(3, -3), V(3, 3), V(-3, 3)].map((v) => new THREE.Vector2(v.x, v.y)));
wall.holes.push(new THREE.Path([[-WIN.w / 2, -WIN.h / 2], [WIN.w / 2, -WIN.h / 2], [WIN.w / 2, WIN.h / 2], [-WIN.w / 2, WIN.h / 2]].map(([x, y]) => new THREE.Vector2(x, y))));
const wallMesh = new THREE.Mesh(new THREE.ShapeGeometry(wall), unseen);
wallMesh.castShadow = true;
blinds.add(wallMesh);
for (let i = -4; i <= 4; i++) {
  const s = new THREE.Mesh(new THREE.BoxGeometry(WIN.w, 0.022, 0.004), unseen);
  s.position.set(0, i * 0.04, 0.01);
  s.castShadow = true;
  blinds.add(s);
}
// a soft fill from your side, so Clawd's face isn't lost against the screen behind it
const fill = new THREE.DirectionalLight(...LIGHT.fill);
fill.position.copy(S).addScaledVector(N, 2).add(V(0.3, 0.4, 0));
fill.target.position.copy(S);
scene.add(fill, fill.target);

// ---- Clawd: the game's model, its server stack hidden, about a pivot at its feet ----
const opp = createAvatar({ scene, camera, onFrame: stage.onFrame, project: stage.project }, clawdAvatar, { at: V(0, 0, 0) });
opp.autoActs = false;
opp.group.children[0].children[0].children.forEach((o) => o.isMesh && (o.visible = false));
// its feet, height and width at scale 1 (clawd.js: the stack's top, legs and body, 24 cells wide)
const FEET = 0.904, HEAD = 0.456, WIDTH = 0.576;
const SIZE = 0.15;
const pivot = new THREE.Group();
pivot.position.set(0, FEET, 0);
scene.add(pivot);
pivot.attach(opp.group);
pivot.visible = false;

// ---- the beats (seconds): your ask (story.js), then Clawd ----
// noon: it's been fishing; it notices, puts the rod down, bounces about, hops. dusk: the game's
// window holds, then closes (win: from, to), it drops back onto the box (back), already waiting
// for the next one.
// out: through the glass; land: on the keys; shout: each half of its line; dive: it turns and
// leaps back at the screen; in: through it; cut: the camera on the cut's frame (the part's end).
const ASK = ASKS[SHOT];
const DUR = PARTS[SHOT].dur;
const B = SHOT === 'noon'
  ? { hook: [0.12, 1.5], glance: 4.8, drop: 5.2, hop: 5.9, jump: 6.35, out: 6.7, land: 7.2, shout: [7.4, 8.15], dive: 9.35, in: 9.9 }
  : { win: [0.85, 1.0], back: 1.1, hop: 2.3, jump: 2.6, out: 2.9, land: 3.35, shout: [3.5, 4.1], dive: 5.0, in: 5.5 };
B.cut = DUR;
// dusk: the machine room's last frame, for the window
const winImg = SHOT === 'dusk' ? new Image() : null;
if (winImg) {
  winImg.src = `./gen/machine-${lang}.png`;
  await winImg.decode().catch(() => console.error(`[cubicle] no ${winImg.src}: render the machine room first (pv/cut/render.sh)`));
}
const session = createSession(ui, L);

const clamp = (x) => Math.min(1, Math.max(0, x));
const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3);
const texel = (x, y, z = 0.002) => glass.localToWorld(V((x / ui.W - 0.5) * SW, (0.5 - y / ui.H) * SH, z));
// where it lands: the middle of the keyboard
const LAND = lap.localToWorld(V(0.02, 0.017, -LD * 0.5));
// where it goes back in: the box under where it sits
const homeAt = () => texel(ui.home.x + 9, ui.home.y + 5, 0);

// ---- the little Clawd on the screen ----
function clawdIn(T) {
  const { home } = ui;
  // bouncing on the spot, three little hops a second, two texels up
  const bounce = (from) => (T > from ? Math.round(2 * Math.abs(Math.sin(Math.PI * 3 * (T - from)))) : 0);
  if (SHOT === 'noon' && T < B.drop) return { rod: 'up', alert: T > B.glance && T < B.glance + 0.6 };
  if (B.back !== undefined && T < B.back) return { rod: 'down', hidden: true };
  if (B.back !== undefined && T < B.back + 0.3) {
    // dropping back in from the top of the screen, a bump as it lands
    const u = (T - B.back) / 0.3;
    return { rod: 'down', y: home.y - Math.round(70 * (1 - u) * (1 - u)) };
  }
  if (T < B.jump) {
    // it bounces about, impatient, then one bigger hop; a '!' as your ask goes in
    const u = clamp((T - B.hop) / 0.28);
    const alertAt = SHOT === 'noon' ? B.drop : ASK.send;
    const up = Math.max(T < B.hop ? bounce(SHOT === 'noon' ? B.drop : ASK.send + 0.3) : 0, Math.round(5 * Math.sin(Math.PI * u)));
    return { rod: 'down', y: home.y - up, alert: T > alertAt && T < alertAt + 0.5 };
  }
  if (T < B.out) {
    // the big jump: up out of the box toward you, growing as it comes
    const u = (T - B.jump) / (B.out - B.jump);
    const sz = 1 + Math.min(2, Math.floor(u * 3));
    const cx = home.x + 9 + (ui.W * 0.5 - home.x - 9) * u, cy = home.y + 5 - 70 * Math.sin(Math.PI * 0.5 * u);
    return { rod: 'down', s: sz, x: cx - 9 * sz, y: cy - 5 * sz, legs: 0 };
  }
  return { rod: 'down', hidden: true };
}
const exitAt = () => texel(ui.W * 0.5, ui.home.y + 5 - 70);

// ---- the 3D Clawd: out of the glass in an arc onto the keys, growing to its size; then back ----
const s0 = (3 * ui.CLAWD_W * (SW / ui.W)) / WIDTH; // the sprite's size at the jump's top, 3x
const s1 = (ui.CLAWD_W * (SW / ui.W)) / WIDTH; // its size sitting on the box
function clawdPose(T) {
  if (T < B.dive + 0.25) {
    const u = clamp((T - B.out) / (B.land - B.out));
    const p = exitAt().addScaledVector(N, 0.01).lerp(LAND, easeOut(u));
    p.addScaledVector(N, 0.05 * Math.sin(Math.PI * u)).y += 0.06 * Math.sin(Math.PI * u);
    return { p, sc: s0 + (SIZE - s0) * (u * u * (3 - 2 * u)), u, turn: (1 - easeOut(u)) * 0.6 + Math.PI * smoothK((T - B.dive) / 0.25) };
  }
  // the dive: turned to the screen, a leap in an arc back to the box, shrinking to the sprite
  const u = clamp((T - B.dive - 0.25) / (B.in - B.dive - 0.25));
  const e = u * u;
  const p = LAND.clone().lerp(homeAt().addScaledVector(N, 0.004), e);
  p.addScaledVector(N, 0.04 * Math.sin(Math.PI * u)).y += 0.05 * Math.sin(Math.PI * u);
  return { p, sc: SIZE + (s1 - SIZE) * e, u: 1, turn: Math.PI };
}

// ---- the camera ----
// Square on to the glass at the distance that puts one texel on one pixel (the stills' frame);
// the opening frame part way in from it toward FILL, the glass edge to edge, its bezel just out.
// The cut's frame: square on to CUT's texel, CUT.rows texels down the frame.
const FOV = 48;
camera.fov = FOV;
camera.updateProjectionMatrix();
const tanH = Math.tan((FOV / 2) * (Math.PI / 180));
const HFOV = 2 * Math.atan(tanH * camera.aspect);
const FILL = (1.12 * SW) / 2 / Math.tan(HFOV / 2);
const fitDist = () => stage.frame.height / (2 * (ui.H / SH) * tanH); // a texel a pixel
const CUT_AT = texel(CUT.x, ui.H - CUT.up, 0);
const CUT_D = (CUT.rows * (SH / ui.H)) / 2 / tanH;
const sq = (d, at = S) => ({ p: at.clone().addScaledVector(N, d), a: at.clone() });
const mix = (A, Bp, k) => ({ p: A.p.clone().lerp(Bp.p, k), a: A.a.clone().lerp(Bp.a, k) });
const smoothK = (x) => ((x = clamp(x)), x * x * (3 - 2 * x));
const easeIO = (x) => ((x = clamp(x)), x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
// The move, never stopping: in on the screen from the opening frame until it fills the
// picture; when Clawd comes out the camera takes it up and rides with it down onto
// the keys, then eases round and in as it shouts; when it dives back, the camera follows it
// in and settles on the cut's frame. Each frame is the average of the raw path around it, so
// the hand-overs are one smooth move; the average narrows to nothing at either end, so the
// part starts and ends exactly on its frame.
// At dusk the camera holds on the glass, edge to edge, and cuts in close on Clawd just as it
// bursts out (CUT_IN), riding with it down onto the keys: a cut on the action.
const CUT_IN = SHOT === 'dusk' ? B.out + 0.12 : null;
function rawCam(t) {
  const fit = fitDist();
  const D0 = fit + (FILL - fit) * 0.45; // noon's opening frame
  const screen = sq(SHOT === 'dusk' ? FILL : D0 + (FILL - D0) * easeIO(t / B.out));
  // the follow: on Clawd, from straight on to a little above it, a slow swing round as it shouts
  const c = clawdPose(Math.max(t, B.out));
  const body = c.p.clone().add(V(0, HEAD * c.sc * 0.55, 0));
  const g = CUT_IN !== null ? 1 : smoothK((t - B.out) / (B.land - B.out + 0.2));
  const swing = 0.22 * smoothK((t - B.land) / 3);
  const dir = N.clone().lerp(V(0, 0.22, 1).normalize(), g).applyAxisAngle(V(0, 1, 0), swing).normalize();
  const d = FILL + (0.32 - FILL) * g - 0.07 * smoothK((t - B.land) / 3);
  const follow = { p: body.clone().addScaledVector(dir, d), a: body };
  const onIt = CUT_IN !== null ? (t < CUT_IN ? screen : follow) : mix(screen, follow, smoothK((t - B.out + 0.15) / 0.4));
  // the dive: after it, into the glass, onto the cut's frame
  return mix(onIt, sq(CUT_D, CUT_AT), easeIO((t - B.dive) / (B.cut - B.dive)));
}
let T = 0, t0 = null;
stage.setRig((cam, now) => {
  t0 ??= now;
  T = q.has('t') ? Number(q.get('t')) : now - t0;
  // the raw path averaged over up to 0.4 s around now, weighted to the middle; never across a cut
  const r = clamp(Math.min(T, DUR - T, CUT_IN !== null ? Math.abs(T - CUT_IN) : 1) / 0.2) * 0.033;
  const p = V(0, 0, 0), a = V(0, 0, 0);
  let wsum = 0;
  for (let i = -6; i <= 6; i++) {
    const w = 7 - Math.abs(i);
    const c = rawCam(T + i * r);
    p.addScaledVector(c.p, w), a.addScaledVector(c.a, w);
    wsum += w;
  }
  cam.position.copy(p.divideScalar(wsum));
  cam.up.set(0, 1, 0);
  cam.lookAt(a.divideScalar(wsum));
  // lookAt leaves the world matrix on the last turn until the render; the shouts project before it
  cam.updateMatrixWorld();
});

// ---- its shout: the words themselves in the air by it, pixel type over the picture; and the plop ----
const plop = document.querySelector('.plop');
// the line in two shouts, at a whole multiple of the font's 12px so every glyph pixel stays
// square: the words, side (of its head), how far up, the tilt
const LINES = {
  noon: [L('等测试的时候', 'While tests run'), L('玩会游戏吧！', "let's play!")],
  dusk: [L('等打包的时候', 'While it builds'), L('再来一局！', 'one more round!')],
}[SHOT];
const SHOUTS = [
  { side: -1, up: 30, tilt: -4 },
  { side: 1, up: 150, tilt: 5 },
].map((o, i) => {
  const el = document.querySelector(`#shout${i}`);
  el.textContent = LINES[i];
  return { ...o, el };
});
// ---- an emoji pixelated into a canvas of n cells: the system's own glyph drawn big, cropped to
// its ink, averaged down, hard-edged and ringed in ink like the type; shown at s px a cell ----
function pixelEmoji(canvas, emoji, n, s) {
  const big = Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
  const b = big.getContext('2d', { willReadFrequently: true });
  b.font = '200px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
  b.textAlign = 'center';
  b.textBaseline = 'middle';
  b.fillText(emoji, 128, 128);
  const a = b.getImageData(0, 0, 256, 256).data;
  let x0 = 256, y0 = 256, x1 = 0, y1 = 0;
  for (let i = 3; i < a.length; i += 4) if (a[i] > 8) {
    const x = (i >> 2) % 256, y = (i >> 2) >> 8;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  const side = Math.max(x1 - x0, y1 - y0) + 1, cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2;
  canvas.width = canvas.height = n;
  const c = canvas.getContext('2d', { willReadFrequently: true });
  c.imageSmoothingQuality = 'high';
  c.drawImage(big, cx - side / 2, cy - side / 2, side, side, 1, 1, n - 2, n - 2);
  const img = c.getImageData(0, 0, n, n), p = img.data;
  const solid = (x, y) => x >= 0 && y >= 0 && x < n && y < n && p[(y * n + x) * 4 + 3] >= 110;
  const keep = [...Array(n * n)].map((_, i) => solid(i % n, (i / n) | 0));
  keep.forEach((on, i) => {
    const x = i % n, y = (i / n) | 0, o = i * 4;
    if (on) p[o + 3] = 255;
    else if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => keep[(y + dy) * n + x + dx] && x + dx >= 0 && x + dx < n)) p.set([0x1a, 0x12, 0x0c, 255], o);
    else p[o + 3] = 0;
  });
  c.putImageData(img, 0, 0);
  Object.assign(canvas.style, { width: `${n * s}px`, height: `${n * s}px` });
}
const backOut = (x) => ((x = clamp(x)), 1 + 2.7 * Math.pow(x - 1, 3) + 1.7 * Math.pow(x - 1, 2));
const fired = new Set();
const once = (k, fn) => !fired.has(k) && (fired.add(k), fn());

function ring(at, k, size) {
  if (k <= 0 || k >= 1) return (plop.style.display = 'none');
  const r = 10 + k * size;
  Object.assign(plop.style, { display: 'block', left: `${at.x - r}px`, top: `${at.y - r}px`, width: `${2 * r}px`, height: `${2 * r}px`, opacity: String(1 - k) });
}

function scene3d(T) {
  if (T < B.out || T >= B.in) {
    pivot.visible = false;
    SHOUTS.forEach((o) => (o.el.style.display = 'none'));
    plop.style.display = 'none';
    return;
  }
  pivot.visible = true;
  const { p, sc, turn } = clawdPose(T);
  // the landing squash, and the crouch before the dive
  const l = clamp((T - B.land) / 0.22);
  const crouch = clamp((T - B.dive) / 0.25);
  const squash = (T > B.land && T < B.dive ? 0.22 * Math.sin(Math.PI * l) : 0) + (T > B.dive ? 0.25 * Math.sin(Math.PI * crouch) : 0);
  pivot.position.copy(p);
  pivot.scale.set(sc * (1 + squash * 0.6), sc * (1 - squash), sc * (1 + squash * 0.6));
  pivot.rotation.y = turn;
  // the plop: a ring where it came through
  ring(stage.project(exitAt()), (T - B.out) / 0.35, 90);
  // the line: a glance back at the crawling job on the first half, a cheer on the second
  B.shout.forEach((t, i) => T >= t && once(`shout${i}`, () => {
    if (i === 0) opp.setState('glance', { at: S.clone() });
    else opp.setState('cheer');
    opp.setState('talking', { text: LINES[i], mood: i ? 'happy' : 'smug', ms: 700 });
    speak(LINES[i], { voice: opp.voice, onBlip: opp.blip });
  }));
  // each shout pops out of the air beside its head with a punch, then drifts up a little; they
  // shrink away as it turns to dive
  const head = stage.project(pivot.position.clone().add(V(0, HEAD * SIZE, 0)));
  const edge = stage.project(pivot.position.clone().add(V((WIDTH * SIZE) / 2, HEAD * SIZE, 0))).x - head.x;
  const gone = clamp((T - B.dive + 0.2) / 0.25);
  SHOUTS.forEach((o, i) => {
    const k = (T - B.shout[i]) / 0.28;
    o.el.style.display = k >= 0 && gone < 1 ? 'block' : 'none';
    if (k < 0 || gone >= 1) return;
    const w = o.el.offsetWidth, h = o.el.offsetHeight;
    // pinned where they were once it turns, not chasing its head into the screen
    const hx = T < B.dive - 0.2 ? head.x : (o.hx ??= head.x), hy = T < B.dive - 0.2 ? head.y : (o.hy ??= head.y), he = T < B.dive - 0.2 ? edge : (o.he ??= edge);
    const x = o.side < 0 ? hx - he - 20 - w : hx + he + 20;
    const y = hy - o.up - h - 6 * (T - B.shout[i]);
    o.el.style.left = `${Math.round(x / 2) * 2}px`;
    o.el.style.top = `${Math.round(y / 2) * 2}px`;
    o.el.style.transform = `rotate(${o.tilt}deg) scale(${backOut(k) * (1 - easeOut(gone))})`;
  });
}

// ---- the hook (noon): your sigh, a third of the frame: a pixel 😭 over 工作好无聊 ----
const hook = document.querySelector('#hook');
const face = hook.querySelector('.face');
const dim = document.querySelector('#dim');
if (B.hook) {
  hook.querySelector('.words').textContent = L('工作好无聊', 'Sooo bored');
  pixelEmoji(face, '😭', 24, 15);
}
function hookAt(T) {
  if (!B.hook) return;
  const k = (T - B.hook[0]) / 0.28;
  const gone = clamp((T - B.hook[1]) / 0.25);
  dim.style.opacity = String(0.45 * clamp(k / 0.6) * (1 - gone));
  hook.style.display = k >= 0 && gone < 1 ? 'flex' : 'none';
  if (k < 0 || gone >= 1) return;
  // the block slumps a little as it holds, then drops away; the face pops a beat after the words
  // and sobs, a hop of one cell every few frames
  const t = T - B.hook[0];
  hook.style.transform = `translate(-50%, calc(-50% + ${Math.round(8 * t) * 2}px)) rotate(-3deg) scale(${backOut(k) * (1 - easeOut(gone))})`;
  const sob = Math.floor(t * 10) % 2 ? -15 : 0;
  face.style.transform = `translateY(${t > 0.4 ? sob : 0}px) scale(${backOut((t - 0.1) / 0.28)})`;
}

// ---- each frame (the rig has set T) ----
stage.onFrame(() => {
  const film = session.at(SHOT, T);
  ui.state.clawd = clawdIn(T);
  // a ring over the box where it went back in
  ui.state.ripple = T >= B.in ? { k: (T - B.in) / 0.6 } : null;
  // the game's window, folding away
  ui.state.win = winImg ? { img: winImg, k: 1 - easeOut((T - B.win[0]) / (B.win[1] - B.win[0])) } : null;
  ui.draw(film);
  scene3d(T);
  hookAt(T);
});
ui.state.win = winImg ? { img: winImg, k: 1 } : null;
ui.draw(session.at(SHOT, 0));
// in a render, the page's sound goes to the renderer's clock: only the voice, no bed
if (window.__vt?.sound?.ctx) await renderSound(window.__vt.sound.ctx, { bgm: 'off', ambience: 0 });
window.__vtReady = true;
