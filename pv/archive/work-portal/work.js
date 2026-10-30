// TRIAL (not main): the morning. Inside the work world from the first frame: tight on the test
// run's rail as Clawd hops up and hauls on it, in on its face as it gives up and asks us,
// then out to the whole window, your 来 flying up out of the trough, the link, Clawd diving home.
// Then the camera backs away and keeps going, out through the CRT's glass, and the machine
// room opens up around it. ?t= freezes a frame (seconds).
import { lang } from '/web/play/i18n.js';
import { createStage, layer, THREE } from '/web/play/stage.js';
import { buildMachine, roomOptions } from '/web/play/roulette.js';
import { createPortal } from '/web/play/portal.js';
import { buildWorld } from './world.js';

await document.fonts.load('12px FusionPixel');
const q = new URLSearchParams(location.search);
const L = (zh, en) => (lang === 'en' ? en : zh);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (x) => (x = clamp(x), x * x * (3 - 2 * x));

const events = [
  // the day so far, climbing away into the dark
  { t: -30, type: L('早上好，先看看昨天的 PR 评论', 'Morning. Start with the PR comments from yesterday'), cps: 24 },
  { t: -28.5, step: ['Read', 'PR #1287 · 3 comments'] },
  { t: -28, say: L('三条评论，改了两条，剩一条等你拍板。', 'Three comments: two fixed, one needs your call.') },
  { t: -26, type: L('第三条按你的来', 'Go with yours on the third'), cps: 24 },
  { t: -24.5, step: ['Edit', 'src/auth/token.ts'] },
  { t: -24, say: L('改好了，顺手补了个测试。', 'Done, and I added a test for it.') },
  { t: -9, type: L('把登录模块重构一下，然后跑测试', 'Refactor the login module, then run the tests'), cps: 24 },
  { t: -7.4, say: L('好的，先改再测。', 'On it: refactor first, then test.') },
  { t: -7.2, tasks: [[L('重构 session.ts', 'Refactor session.ts'), -7], [L('重构 login.ts', 'Refactor login.ts'), -6.8], [L('跑测试', 'Run the tests'), null]] },
  { t: -6.5, tool: ['Bash', 'npm test'], run: { total: 1204 } },
  { t: 0.3, clawd: 'hop', to: 'tip', ms: 0.5, h: 0.9 },
  { t: 0.85, clawd: 'tug', until: 1.9 },
  { t: 2.0, clawd: 'yawn' },
  { t: 3.0, clawd: 'turn' },
  { t: 3.45, say: L('测试要跑三分钟……来一局？', 'Tests take three minutes… wanna play a round?'), bubble: L('来一局？', 'Play a round?') },
  { t: 3.72, clawd: 'hop', to: 'tip', ms: 0.26, h: 0.05 },
  { t: 4.3, type: L('来', 'sure'), cps: 8 },
  { t: 5.0, link: [L('来这里坐下', 'Take a seat'), '127.0.0.1:7330/t/8f2a1c'] },
  { t: 5.05, clawd: 'wave' },
  { t: 5.8, clawd: 'hop', to: 'input', ms: 0.55, h: 1.3 },
  { t: 6.35, clawd: 'dive' },
];
const runKeys = [[-6.5, 0], [0.85, 0.22], [1.9, 0.235], [7.5, 0.27]];

const stage = createStage(document.querySelector('#view'), roomOptions);
const room = buildMachine(layer(stage));
const sessions = [[L('重构登录模块', 'Refactor login'), true], [L('部署到预发', 'Deploy to staging'), false], [L('支付模块', 'Payments module'), false], [L('暗色主题', 'Dark theme'), false]];
stage.renderer.localClippingEnabled = true; // the chat is cut off under the window's title bar
const world = buildWorld({ L, events, runKeys, sessions });
// the layers part as the camera pulls back from the haul, and close again as it squares up
world.setExplode((t) => smooth((t - 4.15) / 0.9) * (1 - smooth((t - 5.5) / 0.9)));
let portal = null, T = 0, roomShadow = null;
// before the portal's own hook, so it draws the world as it is this frame
stage.onFrame(() => {
  world.at(T);
  if (T < OUT) portal.enter(inside(T));
  else portal.leave();
  // inside, the machine room's own post look (its shadows broken up by red dots) is off
  if (T < OUT) (roomShadow ??= stage.post.uShadowAmt.value), (stage.post.uShadowAmt.value = 0);
  else if (roomShadow !== null) (stage.post.uShadowAmt.value = roomShadow), (roomShadow = null);
});

// ---- the camera in the world: [t, position, what it looks at], eased through ----
const KEYS = [
  [0, V(0.35, 0.8, 1.95), V(-0.65, 0.42, 0.3)],
  [2.4, V(0.2, 0.75, 2.05), V(-0.65, 0.42, 0.3)],
  [3.3, V(-0.25, 1.02, 1.95), V(-0.55, 0.92, 0.3)],
  [4.25, V(-0.27, 1.05, 1.9), V(-0.55, 0.95, 0.3)],
  [5.15, V(3.3, 1.1, 5.0), V(0.2, 0, 0.2)],
  [5.75, V(2.2, 0.6, 4.9), V(0.3, -0.25, 0)],
  [6.4, V(0, 0, 4.4), V(0, 0, 0)],
];
const OUT = 7.3; // through the glass
const BACK = 1.1; // how far it backs off inside before it goes through
function keyed(t) {
  if (t <= KEYS[0][0]) return [KEYS[0][1].clone(), KEYS[0][2].clone()];
  for (let i = 1; i < KEYS.length; i++) {
    const [t1, p1, a1] = KEYS[i], [t0, p0, a0] = KEYS[i - 1];
    if (t <= t1) {
      const k = smooth((t - t0) / (t1 - t0));
      return [p0.clone().lerp(p1, k), a0.clone().lerp(a1, k)];
    }
  }
  return [KEYS.at(-1)[1].clone(), KEYS.at(-1)[2].clone()];
}
const look = (cam, p, at) => (cam.position.copy(p), cam.lookAt(at), cam);
// the pose it leaves the world from: the last key, backed off
const last = look(new THREE.PerspectiveCamera(), ...keyed(KEYS.at(-1)[0]));
const backDir = V(0, 0, 1).applyQuaternion(last.quaternion);
function inside(t) {
  if (t <= KEYS.at(-1)[0]) return look(world.camera, ...keyed(t));
  const u = clamp((t - KEYS.at(-1)[0]) / (OUT - KEYS.at(-1)[0]));
  world.camera.position.copy(last.position).addScaledVector(backDir, BACK * u * u);
  world.camera.quaternion.copy(last.quaternion);
  return world.camera;
}

// ---- the portal: the window sits just past where the camera leaves the world, so the
// camera crosses the glass exactly there, 6 cm in front of it in the room ----
const SCALE = 12, NEAR = 0.06;
const glass = room.screens.crt;
const leave = inside(OUT).clone();
const anchor = new THREE.Object3D();
anchor.quaternion.copy(leave.quaternion);
anchor.position.copy(leave.position).addScaledVector(backDir, -NEAR * SCALE);
world.scene.add(anchor);
portal = createPortal(stage, glass, world.scene, { anchor, scale: SCALE });

// ---- the camera in the room: from the glass, backing away fast and easing, its distance
// growing as a power (a steady zoom out), turning to take in the table and Clawd ----
glass.updateMatrixWorld(true);
const gq = glass.getWorldQuaternion(new THREE.Quaternion());
const normal = V(0, 0, 1).applyQuaternion(gq);
const g0 = glass.getWorldPosition(V(0, 0, 0)).addScaledVector(normal, NEAR);
const P1 = V(0, 1.42, 0.95), AT1 = V(0, 0.88, -0.45); // your seat, where the game's camera starts
const q1 = look(new THREE.PerspectiveCamera(), P1, AT1).quaternion;
const DUR = 2.8, R = 30;
// straight back off the glass first, then round to the seat
const C1 = g0.clone().addScaledVector(normal, 0.55).add(V(0, 0.38, 0)); // up over the table's displays
function outside(cam, t) {
  const s = 1 - (1 - clamp((t - OUT) / DUR)) ** 3;
  const f = (R ** s - 1) / (R - 1);
  cam.position.copy(g0).multiplyScalar((1 - f) ** 2).addScaledVector(C1, 2 * f * (1 - f)).addScaledVector(P1, f * f);
  cam.quaternion.copy(gq).slerp(q1, smooth(s));
}

let t0 = null;
const clock = () => {
  const now = performance.now();
  t0 ??= now;
  return q.has('t') ? Number(q.get('t')) : (now - t0) / 1000 + Number(q.get('t0') ?? 0);
};
window.__vtReady = true;
stage.setRig((cam) => {
  T = clock();
  if (T >= OUT) outside(cam, T);
});
