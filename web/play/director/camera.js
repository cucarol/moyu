// The director's camera: named shots for each scene, and moves between them: from wherever
// the camera is to a shot, through any number of shots on the way (one continuous move
// along a smooth curve), round an orbit, with a duration and an easing. It moves the
// camera on from where the seat put it each frame (stage.setRig), so the seat's own view
// is always one move away. Moves run on the film's time (film below), so they carry on
// while a script has slowed or frozen the scene.
//
// A shot is a name (SHOTS below, per game), 'seat', a pose, or a screen shot:
//   { pos, at, fov, near, roll, breath }
//     pos, at   where the camera is and what it looks at, in the room's metres
//     fov       vertical, degrees (default 50)
//     near      the near clip plane, metres: raise it to cut away what stands between the
//               camera and a close subject (a screen push-in does)
//     roll      degrees about the view axis
//     breath    how much of the seat's slow breathing it keeps (1 default, 0 dead still)
//   { screen: 'crt', fit: 'cover' | 'contain' | k, fov }
//     square onto a named screen: 'cover' (default) the glass fills the frame edge to edge
//     (a 4:3 screen in a 16:9 frame loses its top and bottom), 'contain' all of it shows, a
//     number k is the glass's height over the frame's; aim: [u, v] centres a point of the glass
//     instead of its middle (u across from its left, v down from its top, 0 to 1)
import { THREE } from '../stage.js';

// The film's time: the renderer's clock keeps it apart from the scene's (bullet time); a
// page in a browser has only the one.
export const film = {
  now: () => window.__vt?.film?.now ?? performance.now(),
  wait: (ms) => new Promise((r) => (window.__vt?.film ?? window).setTimeout(r, ms)),
};

// ---- easing: by name, or a CSS-style cubic-bezier [x1, y1, x2, y2] ----
function bezier([x1, y1, x2, y2]) {
  const at = (a, b, t) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  return (x) => {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (at(x1, x2, mid) < x) lo = mid;
      else hi = mid;
    }
    return at(y1, y2, (lo + hi) / 2);
  };
}
export const EASES = {
  linear: (k) => k,
  in: (k) => k * k * k,
  out: (k) => 1 - (1 - k) ** 3,
  inOut: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  sine: (k) => -(Math.cos(Math.PI * k) - 1) / 2,
  expoIn: (k) => (k === 0 ? 0 : Math.pow(2, 10 * k - 10)),
  expoOut: (k) => (k === 1 ? 1 : 1 - Math.pow(2, -10 * k)),
  expoInOut: (k) => (k === 0 || k === 1 ? k : k < 0.5 ? Math.pow(2, 20 * k - 10) / 2 : (2 - Math.pow(2, -20 * k + 10)) / 2),
};
export function easeOf(e = 'inOut') {
  if (Array.isArray(e)) return bezier(e);
  if (typeof e === 'function') return e;
  if (!EASES[e]) throw new Error(`no easing '${e}'; one of ${Object.keys(EASES).join(', ')}, or [x1, y1, x2, y2]`);
  return EASES[e];
}

// ---- screens ----
// A screen's glass in the room: its centre, the way it faces, its size (see screens.js).
export function screenFrame(mesh) {
  mesh.updateWorldMatrix(true, false);
  const c = new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld);
  const n = new THREE.Vector3(0, 0, 1).transformDirection(mesh.matrixWorld);
  const up = new THREE.Vector3(0, 1, 0).transformDirection(mesh.matrixWorld);
  const { width, height } = mesh.geometry.parameters;
  const scale = new THREE.Vector3().setFromMatrixScale(mesh.matrixWorld);
  return { c, n, up, w: width * scale.x, h: height * scale.y };
}
export function screenShot(mesh, { fit = 'cover', fov = 30, aim, aspect = innerWidth / innerHeight } = {}) {
  const { c: mid, n, up, h, w } = screenFrame(mesh);
  // aimed at a point on the glass other than its middle: [u, v] across and down it, 0 to 1
  const c = aim ? mid.clone().addScaledVector(new THREE.Vector3().crossVectors(up, n), (aim[0] - 0.5) * w).addScaledVector(up, (0.5 - aim[1]) * h) : mid;
  const half = Math.tan(THREE.MathUtils.degToRad(fov / 2));
  // the distances at which the glass's height, or its width, just spans the frame
  const dh = h / 2 / half;
  const dw = w / 2 / (half * aspect);
  const d = fit === 'cover' ? Math.min(dh, dw) : fit === 'contain' ? Math.max(dh, dw) : dh / Number(fit);
  const pos = c.clone().addScaledVector(n, d);
  // nothing between the camera and the glass: the near plane just short of it
  return { pos: pos.toArray(), at: c.toArray(), fov, near: Math.max(0.05, d * 0.8), breath: 0 };
}

// ---- the shots ----
// Both scenes seat you at 0, 1.42, 0.95 looking at 0, 0.88, -0.45, the table top at y 0.76
// and the agent across it at z about -0.6.
const common = (opp) => {
  const head = opp.anchors.head;
  return {
    // the agent from your side of the table: its body and what's in front of it; its face
    agent: () => ({ pos: [head.x + 0.05, head.y + 0.02, head.z + 1.45], at: [head.x, head.y - 0.26, head.z], fov: 44 }),
    face: () => ({ pos: [head.x + 0.03, head.y - 0.02, head.z + 1.0], at: [head.x, head.y - 0.14, head.z], fov: 36 }),
    low: () => ({ pos: [0.32, 0.9, 0.62], at: [-0.05, 1.0, -0.6], fov: 50 }),
    wide: () => ({ pos: [0.9, 1.55, 1.1], at: [-0.05, 0.95, -0.45], fov: 58 }),
    // for a portrait frame: back and up from the seat, wide, so both hands and the agent fit
    tall: () => ({ pos: [0, 1.62, 1.22], at: [0, 0.98, -0.42], fov: 88 }),
  };
};

const SHOTS = {
  roulette: (room) => ({
    gun: () => {
      const g = room.gun.position;
      return { pos: [g.x + 0.12, g.y + 0.32, g.z + 0.42], at: [g.x, g.y, g.z], fov: 42 };
    },
    table: () => ({ pos: [0, 1.9, 0.25], at: [0, 0.76, -0.15], fov: 60 }),
    // the left CRT: square on with the glass filling the frame, and a step back from it
    crt: { screen: 'crt' },
    crtNear: { screen: 'crt', fit: 0.45, fov: 40 },
  }),
  blackjack: (room) => ({
    table: () => ({ pos: [0, 1.75, 0.42], at: [0, 0.76, -0.02], fov: 48 }),
    // both hands, low over the felt
    cards: () => ({ pos: [0, 1.12, 0.62], at: [0, 0.77, -0.02], fov: 40 }),
    hand: () => ({ pos: [-0.1, 1.05, 0.55], at: [-0.1, 0.77, 0.18], fov: 34 }),
    shoe: () => {
      const s = room.shoe.position;
      return { pos: [s.x - 0.1, s.y + 0.32, s.z + 0.42], at: [s.x, s.y + 0.05, s.z], fov: 38 };
    },
    laptop: { screen: 'laptop' },
  }),
  yacht: (room) => ({
    table: () => ({ pos: [0, 1.75, 0.42], at: [0, 0.76, -0.02], fov: 48 }),
    // the tray and its dice, from above your cup
    tray: () => {
      const t = room.tray.position;
      return { pos: [t.x, t.y + 0.62, t.z + 0.42], at: [t.x, t.y, t.z], fov: 40 };
    },
    // the same, from up on the right (50 degrees round), where an orbit going right lands
    trayRight: () => {
      const t = room.tray.position;
      const a = THREE.MathUtils.degToRad(50);
      return { pos: [t.x + Math.sin(a) * 0.42, t.y + 0.62, t.z + Math.cos(a) * 0.42], at: [t.x, t.y, t.z], fov: 40 };
    },
    dice: () => {
      const t = room.tray.position;
      return { pos: [t.x + 0.05, t.y + 0.3, t.z + 0.36], at: [t.x, t.y + 0.02, t.z], fov: 36 };
    },
    // the dice wherever they are as the move starts, in the air included (an orbit's centre
    // in bullet time)
    air: () => {
      const up = room.dice.filter((d) => d.visible);
      const at = up.reduce((a, d) => a.add(d.getWorldPosition(new THREE.Vector3())), new THREE.Vector3()).divideScalar(up.length || 1);
      return { pos: [at.x, at.y + 0.08, at.z + 0.4], at: at.toArray(), fov: 36 };
    },
    laptop: { screen: 'laptop' },
  }),
};

// Points round a circle about centre, for an orbit: radius and height (over the centre) in
// metres, from and to in degrees (0 looks from +z, the seat's side; positive goes round to
// the right), fov. With no from, it picks up from start (where the camera is): from its angle
// round the centre, spiralling in to the radius and height over the first half, so the move
// never doubles back on itself; start itself is left out.
function orbitPoses({ center, radius = 0.6, height = 0.3, from, to = 30, fov = 40, look = [0, 0, 0] }, start) {
  const spiral = from === undefined && start;
  const r0 = spiral ? Math.hypot(start.pos.x - center[0], start.pos.z - center[2]) : radius;
  const h0 = spiral ? start.pos.y - center[1] : height;
  if (from === undefined) from = spiral ? THREE.MathUtils.radToDeg(Math.atan2(start.pos.x - center[0], start.pos.z - center[2])) : -30;
  const n = Math.max(2, Math.ceil(Math.abs(to - from) / 15) + 1);
  const target = new THREE.Vector3(center[0] + look[0], center[1] + look[1], center[2] + look[2]);
  const poses = Array.from({ length: n }, (_, i) => {
    const a = THREE.MathUtils.degToRad(from + ((to - from) * i) / (n - 1));
    const x = spiral ? Math.min(1, (2 * i) / (n - 1)) : 1;
    const b = x * x * (3 - 2 * x);
    const r = r0 + (radius - r0) * b, h = h0 + (height - h0) * b;
    const at = spiral ? start.at.clone().lerp(target, b) : target;
    return { pos: [center[0] + Math.sin(a) * r, center[1] + h, center[2] + Math.cos(a) * r], at: at.toArray(), fov: spiral ? start.fov + (fov - start.fov) * b : fov };
  });
  return spiral ? poses.slice(1) : poses;
}

export function createCamera(stage, room, opp, game, screens = {}) {
  const named = { ...common(opp), ...SHOTS[game](room) };
  const SEAT = 'seat';
  const v = (a) => (a instanceof THREE.Vector3 ? a.clone() : new THREE.Vector3(...a));
  let seatNear = null;
  let seatFov = null;
  const where = (x) => (typeof x === 'string' ? resolve(x).at.toArray() : x);
  function resolve(shot) {
    if (shot === null || shot === undefined || shot === SEAT) return SEAT;
    let s = typeof shot === 'string' ? named[shot] : shot;
    if (typeof s === 'function') s = s();
    if (s?.screen) {
      const mesh = screens[s.screen];
      if (!mesh) throw new Error(`no screen '${s.screen}' here; this scene has ${Object.keys(screens).join(', ') || 'none'}`);
      s = { ...screenShot(mesh, s), ...(s.near !== undefined && { near: s.near }) };
    }
    if (!s || !s.pos || !s.at) throw new Error(`no camera shot '${JSON.stringify(shot)}'; one of ${['seat', ...Object.keys(named)].join(', ')}, a { pos, at, fov } or { screen }`);
    return { pos: v(s.pos), at: v(s.at), fov: s.fov ?? 50, near: s.near ?? seatNear ?? 0.05, roll: s.roll ?? 0, breath: s.breath ?? 1 };
  }

  // the move now: the poses it passes through, when it began (film time) and how long it takes
  let path = null; // { pts, ease, t0, ms } or null: in the seat
  let gen = 0; // the newest move
  let base = null; // the seat's camera this frame
  const real = (p) => (p === SEAT ? base : p);
  function sample(path, e) {
    const ps = path.pts.map(real);
    if (ps.length === 1) return ps[0];
    const n = ps.length - 1;
    let pos;
    let at;
    let k = e; // how far along the points, 0 to 1, each stretch between two an equal share
    if (n === 1) {
      pos = ps[0].pos.clone().lerp(ps[1].pos, e);
      at = ps[0].at.clone().lerp(ps[1].at, e);
    } else {
      // through every point on a smooth curve at an even speed along it (by its length, not
      // an equal time a stretch), what it looks at keeping step; made once a move unless it
      // ends in the seat, which breathes
      const curves = path.curves ?? { pos: new THREE.CatmullRomCurve3(ps.map((p) => p.pos), false, 'centripetal'), at: new THREE.CatmullRomCurve3(ps.map((p) => p.at), false, 'centripetal') };
      if (!path.pts.includes(SEAT)) path.curves = curves;
      k = curves.pos.getUtoTmapping(Math.min(1, Math.max(0, e)));
      pos = curves.pos.getPoint(k);
      at = curves.at.getPoint(k);
    }
    const u = Math.min(n - 1e-9, Math.max(0, k) * n);
    const i = Math.floor(u);
    const f = u - i;
    const lerp = (key) => ps[i][key] + (ps[i + 1][key] - ps[i][key]) * f;
    return { pos, at, fov: lerp('fov'), near: lerp('near'), roll: lerp('roll'), breath: lerp('breath') };
  }
  const progress = () => (!path || !path.ms ? 1 : Math.min(1, (film.now() - path.t0) / path.ms));
  const now = () => (path ? sample(path, path.ease(progress())) : SEAT);
  // where a move starts: fixed when it starts, the seat included (its breathing and the swell
  // would otherwise move the whole curve under the move)
  const freeze = (p) => {
    const q = real(p);
    return q ? { ...q, pos: q.pos.clone(), at: q.at.clone() } : SEAT;
  };

  stage.setRig((camera, t) => {
    seatFov ??= camera.fov;
    seatNear ??= camera.near;
    // the seat as the stage placed it (breathing and riding the swell already in it)
    base = { pos: camera.position.clone(), at: camera.position.clone().add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(1.5)), fov: seatFov, near: seatNear, roll: 0, breath: 0 };
    if (path?.home && progress() >= 1) path = null;
    const p = now();
    if (p === SEAT) {
      if (camera.fov !== seatFov || camera.near !== seatNear) {
        camera.fov = seatFov;
        camera.near = seatNear;
        camera.updateProjectionMatrix();
      }
      return;
    }
    camera.position.copy(p.pos);
    // a breath like the seat's, so a held shot never goes dead still
    camera.position.y += Math.sin(film.now() / 1000 * 1.4) * 0.004 * p.breath;
    camera.lookAt(p.at);
    if (p.roll) camera.rotateZ(THREE.MathUtils.degToRad(p.roll));
    if (camera.fov !== p.fov || camera.near !== p.near) {
      camera.fov = p.fov;
      camera.near = p.near;
      camera.updateProjectionMatrix();
    }
  });

  return {
    // shot: where to end (an array: a path through each in turn); from: where to start
    // (default: wherever the camera is now, mid-move included); via: shots to pass through
    // first; orbit: { center (or a shot whose `at` it is), radius, height, from (default: where
    // the camera is, spiralling in), to, fov, look }, then on to shot if one is given, all one
    // move; ms 0 cuts.
    async move(shot, { ms = 0, ease = 'inOut', from, via = [], orbit } = {}) {
      const after = shot === undefined ? [] : [shot].flat().map(resolve);
      const start = from !== undefined ? resolve(from) : freeze(now());
      const keys = orbit ? [...orbitPoses({ ...orbit, center: where(orbit.center ?? 'table') }, real(start)).map(resolve), ...after] : after;
      const e = easeOf(ease);
      const mine = ++gen;
      const to = keys.at(-1);
      if (!ms) {
        path = to === SEAT ? null : { pts: [to], ease: e, t0: film.now(), ms: 0 };
        return;
      }
      path = { pts: [start, ...[via].flat().map(resolve), ...keys], ease: e, t0: film.now(), ms, home: to === SEAT };
      await film.wait(ms);
      if (mine === gen && to === SEAT) path = null;
    },
    resolve,
    names: () => ['seat', ...Object.keys(named)],
  };
}
