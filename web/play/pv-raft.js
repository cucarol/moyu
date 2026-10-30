// The raft's hooks for the launch video (scene.pv, called by a director script): the
// agent's work grows into the world round the raft. Nothing here exists until a hook
// first runs, so the normal page never sees it.
//
//   boatsProgress(k)    k 0..1: a dozen fishing boats out on the horizon light their
//                       lanterns one by one (only their lights are drawn: the hulls
//                       read as black blots against the dusk)
//   boatsDone()         the whole horizon becomes a string of warm lights, each with its
//                       reflection on the water
//   starsProgress(k)    k 0..1: stars come out one by one, up to a few hundred, the
//                       brightest first
//   starsDone()         a twinkle runs across them, east to west
//   fishSchool(t0, at)  a school of glowing fish rises round the raft and swims into the
//                       word "moyu", readable from straight above (screen up = toward the
//                       horizon, -z), then holds, shimmering. t0: the stage time it
//                       starts (default now). at: { x, z, cell } where the word lies,
//                       default behind the agent's chair, past the raft's back edge
//   fishScatter()       they scatter and sink away
//   laptop(k)           k 0..1: the laptop lifts off its side table, leaving its lead,
//                       and floats over to hover in front of your seat, its glass to you
//                       (k 1); back down again as k goes back to 0
//
// Everything moves as a function of the stage clock (onFrame's t), so a frame-stepped
// render comes out the same every time. The sky and the night light are the pv
// director's; this only adds things to it.
import { THREE, canvasTex, drawBits } from './stage.js';
import { swellAt } from './sea.js';
import { RAFT } from './raft.js';

function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}
const smooth = (a, b, x) => {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};
const add = (opts) => ({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, ...opts });

// a soft warm glow, for lanterns and their reflections
const lampTex = canvasTex(32, 32, (ctx) => {
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const d = Math.hypot(x - 15.5, y - 15.5) / 16;
      ctx.fillStyle = `rgba(255,${Math.round(190 - d * 60)},${Math.round(110 - d * 50)},${Math.max(0, 1 - d) ** 2.2})`;
      ctx.fillRect(x, y, 1, 1);
    }
});
// a lantern's broken path down the water: short bright dashes, fading downward
const streakTex = canvasTex(8, 32, (ctx) => {
  const r = rng(9);
  for (let y = 0; y < 32; y++) {
    if (r() < 0.35) continue;
    const w = Math.max(1, Math.round((1 - y / 32) * 5 * (0.5 + r() * 0.5)));
    ctx.fillStyle = `rgba(255,190,120,${(1 - y / 32) ** 1.4})`;
    ctx.fillRect(4 - Math.ceil(w / 2), y, w, 1);
  }
});

// env: the sea and sky (they rock against the raft, sea.js); sky: the dome's middle;
// avoid: directions to keep the boats out of (the island, the afterglow), as azimuths
export function raftPv(stage, { env, SEA_Y, sky, avoid = [], laptop }) {
  const { scene, onFrame } = stage;
  let now = 0;
  onFrame((t) => (now = t));
  const out = {};

  // ---- the boats on the horizon ----
  const BOAT = { w: 24, h: 12 }; // a boat's size in its old sprite's pixels, for where its lights hang
  let boats = null;
  function makeBoats() {
    if (boats) return boats;
    const r = rng(61);
    const list = [];
    const lights = [];
    for (let i = 0; i < 14 && list.length < 13; i++) {
      const az = -1.0 + (i / 13) * 2.0 + (r() - 0.5) * 0.08;
      if (avoid.some(([a, b]) => az > a && az < b)) continue;
      const dist = 26 + r() * 9;
      const x = sky.x + Math.sin(az) * dist;
      const z = sky.z - Math.cos(az) * dist;
      const g = new THREE.Group();
      g.position.set(x, SEA_Y, z);
      g.lookAt(sky.x, SEA_Y, sky.z);
      const size = 2.6 + r() * 1.2;
      const flip = r() < 0.5 ? -1 : 1;
      env.add(g);
      // the lantern: on the mast, a third of the way up
      const lx = flip * (((BOAT.w / 2 - 6) / BOAT.w) * -size);
      const lamp = bulb(g, lx, size * 0.3, size * 0.4, 0.26);
      const boat = { g, x, z, size, lamp, lx, flip, phase: r() * 10, order: 0, litAt: null, ph: r() * 10 };
      list.push(boat);
    }
    // the order they light in: from the middle of the view outward, side to side
    [...list].sort((a, b) => Math.abs(Math.atan2(a.x - sky.x, sky.z - a.z)) - Math.abs(Math.atan2(b.x - sky.x, sky.z - b.z))).forEach((b, i, all) => (b.order = (i + 1) / all.length));
    onFrame((t) => {
      for (const b of list) {
        b.g.position.y = SEA_Y + swellAt(b.x, b.z, t) * 0.6;
        b.g.rotation.z = Math.sin(t * 0.7 + b.phase) * 0.04;
        const on = b.litAt === null ? 0 : smooth(0, 0.6, t - b.litAt);
        b.lamp(on * (0.85 + 0.15 * Math.sin(t * 2.3 + b.ph)));
      }
      for (const l of lights) {
        const on = l.at === null ? 0 : smooth(0, 0.5, t - l.at);
        l.s?.(on * l.k * (0.8 + 0.2 * Math.sin(t * 1.7 + l.ph)));
        if (l.streak) l.streak.material.opacity = on * l.k * 0.5 * (0.7 + 0.3 * Math.sin(t * 3.1 + l.ph));
      }
    });
    boats = { list, lights };
    return boats;
  }
  // a lit bulb: a crisp warm core, so it reads as a light even against the afterglow, in
  // a soft glow; returns how to set how lit it is
  function bulb(parent, x, y, glowSize, coreSize) {
    const glow = new THREE.Sprite(new THREE.SpriteMaterial(add({ map: lampTex, opacity: 0, fog: false })));
    glow.position.set(x, y, 0.05);
    glow.scale.setScalar(glowSize);
    const core = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xfff0c8, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    core.position.set(x, y, 0.06);
    core.scale.setScalar(coreSize);
    parent.add(glow, core);
    return (k) => {
      glow.material.opacity = k * 0.8;
      core.material.opacity = Math.min(1, k * 1.4);
    };
  }
  // a light hung somewhere: on a boat (parent), or out on the horizon past them.
  // lit false: only the reflection (for a lantern already lit)
  function hang(parent, x, y, size, k, at, streak = true, lit = true) {
    const s = lit ? bulb(parent, x, y, size, Math.max(0.18, size * 0.22)) : null;
    let st = null;
    if (streak) {
      // its reflection: a broken path lying on the water, from under it toward us (the
      // group faces the middle of the sky), long, since we see it at a graze
      const len = 4 + size * 6;
      const geo = new THREE.PlaneGeometry(Math.max(0.12, size * 0.22), len);
      geo.rotateX(-Math.PI / 2);
      st = new THREE.Mesh(geo, new THREE.MeshBasicMaterial(add({ map: streakTex, opacity: 0, fog: false })));
      // just over the swell's crests, so the water never swallows it
      st.position.set(x, SEA_Y + 0.07 - parent.position.y, len / 2);
      parent.add(st);
    }
    boats.lights.push({ s, streak: st, k, at, ph: (boats.lights.length * 2.39) % 10 });
  }
  out.boatsProgress = (k) => {
    const { list } = makeBoats();
    for (const b of list) {
      if (k >= b.order - 1e-6 && b.litAt === null) b.litAt = now;
      if (k < b.order - 1e-6) b.litAt = null;
    }
  };
  let boatsDoneAt = null;
  out.boatsDone = () => {
    const { list } = makeBoats();
    out.boatsProgress(1);
    if (boatsDoneAt !== null) return;
    boatsDoneAt = now;
    const r = rng(83);
    // each boat strings lights from its mast to bow and stern, the lantern gets its
    // reflection, and they come on as a sweep across the horizon
    for (const b of list) {
      const sweep = now + 0.3 + (Math.atan2(b.x - sky.x, sky.z - b.z) + 1.1) * 0.9;
      hang(b.g, b.lx, b.size * 0.3, b.size * 0.55, 1, sweep, true, false); // the lantern's reflection
      const n = 4 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n;
        hang(b.g, (u - 0.5) * b.size * 0.8, b.size * (0.12 + 0.12 * Math.sin(u * Math.PI)), b.size * 0.22, 0.75, sweep + u * 0.25, i % 2 === 0);
      }
    }
    // and further out, more lights strung along the horizon between them
    const far = new THREE.Group();
    env.add(far);
    for (let i = 0; i < 46; i++) {
      const az = -1.15 + (i / 45) * 2.3 + (r() - 0.5) * 0.03;
      if (avoid.some(([a, b]) => az > a && az < b)) continue;
      const g = new THREE.Group();
      const dist = 38 + r() * 4;
      g.position.set(sky.x + Math.sin(az) * dist, SEA_Y + 0.25 + r() * 0.15, sky.z - Math.cos(az) * dist);
      g.lookAt(sky.x, g.position.y, sky.z);
      far.add(g);
      hang(g, 0, 0, 0.9 + r() * 0.5, 0.6, now + 0.3 + (az + 1.15) * 0.9, r() < 0.5);
    }
  };

  // ---- the stars ----
  let stars = null;
  function makeStars() {
    if (stars) return stars;
    const r = rng(29);
    const N = 520;
    const all = [];
    for (let i = 0; i < N; i++) {
      // even over the dome: an even height above the horizon in sin(elevation)
      const e = Math.asin(0.07 + r() * 0.9);
      const az = r() * Math.PI * 2;
      const dir = new THREE.Vector3(Math.sin(az) * Math.cos(e), Math.sin(e), -Math.cos(az) * Math.cos(e));
      // magnitude: a few bright ones, many faint
      const mag = r() ** 2.6;
      const warm = r();
      all.push({ dir, mag, az, col: warm < 0.2 ? [1, 0.86, 0.7] : warm > 0.85 ? [0.78, 0.86, 1] : [1, 0.97, 0.92], at: null, rank: 0, ph: r() * 10, w: 0.6 + r() * 1.6 });
    }
    // the brightest come out first, then the rest, a little shuffled
    [...all].sort((a, b) => b.mag + r() * 0.15 - (a.mag + r() * 0.15)).forEach((s, i) => (s.rank = (i + 1) / N));
    // the brightest are little crosses, the rest one or two pixels
    const crossTex = canvasTex(3, 3, (ctx) => drawBits(ctx, ['.X.', 'XXX', '.X.'], 0, 0, 1, '#ffffff'));
    const layer = (list, size, map = null) => {
      const pos = [];
      for (const s of list) pos.push(...s.dir.clone().multiplyScalar(45).add(sky).toArray());
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0), 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial(add({ size, map, sizeAttenuation: false, vertexColors: true, fog: false })));
      pts.frustumCulled = false;
      env.add(pts);
      return { list, geo };
    };
    const layers = [layer(all.filter((s) => s.mag < 0.3), 1), layer(all.filter((s) => s.mag >= 0.3 && s.mag < 0.85), 2), layer(all.filter((s) => s.mag >= 0.85), 3, crossTex)];
    onFrame((t) => {
      for (const { list, geo } of layers) {
        const c = geo.attributes.color;
        list.forEach((s, i) => {
          let k = s.at === null ? 0 : smooth(0, 0.9, t - s.at);
          k *= (0.6 + 0.4 * s.mag) * (0.82 + 0.18 * Math.sin(t * s.w + s.ph));
          if (stars.waveAt !== null) {
            // the twinkle: a band sweeping round the sky from the east
            const front = (t - stars.waveAt) * 1.6;
            const d = front - ((s.az + Math.PI * 0.5) % (Math.PI * 2));
            k *= 1 + 0.9 * Math.exp(-((d / 0.35) ** 2));
          }
          k = Math.min(1, k);
          c.setXYZ(i, s.col[0] * k, s.col[1] * k, s.col[2] * k);
        });
        c.needsUpdate = true;
      }
    });
    stars = { all, waveAt: null };
    return stars;
  }
  out.starsProgress = (k) => {
    const { all } = makeStars();
    for (const s of all) {
      if (k >= s.rank - 1e-6 && s.at === null) s.at = now;
      if (k < s.rank - 1e-6) s.at = null;
    }
  };
  out.starsDone = () => {
    out.starsProgress(1);
    if (stars.waveAt === null) stars.waveAt = now;
  };

  // ---- the fish ----
  // the word, lower case, a stroke one cell wide; y's tail drops below the line
  const WORD = [
    ['XXXX.', 'X.X.X', 'X.X.X', 'X.X.X', 'X.X.X', '.....', '.....'],
    ['.XX.', 'X..X', 'X..X', 'X..X', '.XX.', '....', '....'],
    ['X..X', 'X..X', 'X..X', 'X..X', '.XXX', '...X', 'XXX.'],
    ['X..X', 'X..X', 'X..X', 'X..X', '.XXX', '....', '....'],
  ];
  const fishTex = canvasTex(8, 4, (ctx) => {
    drawBits(ctx, ['.XXXX..X', 'XXXXXXXX', 'XXXXXXXX', '.XXXX..X'], 0, 0, 1, '#ffffff');
    ctx.fillStyle = '#ffffff';
  });
  const haloTex = canvasTex(16, 16, (ctx) => {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const d = Math.hypot(x - 7.5, y - 7.5) / 8;
        ctx.fillStyle = `rgba(255,255,255,${Math.max(0, 1 - d) ** 2})`;
        ctx.fillRect(x, y, 1, 1);
      }
  });
  let fish = null;
  const FISH_COL = new THREE.Color(0.35, 0.95, 0.85);
  const HALO_COL = new THREE.Color(0.03, 0.12, 0.14);
  function makeFish() {
    if (fish) return fish;
    const r = rng(47);
    const cells = [];
    let col = 0;
    for (const L of WORD) {
      L.forEach((row, y) => [...row].forEach((ch, x) => ch === 'X' && cells.push([col + x, y])));
      col += L[0].length + 1;
    }
    const width = col - 1;
    const per = 7;
    const N = cells.length * per;
    const list = [];
    for (let i = 0; i < N; i++) {
      const [cx, cy] = cells[Math.floor(i / per)];
      // its place in its school: round, thicker in the middle
      const rr = Math.sqrt(r()) * 1.1;
      const ra = r() * Math.PI * 2;
      // a sub-school each, circling the raft; each fish keeps its place in its own
      list.push({
        u: (cx + 0.5 + (r() - 0.5) * 0.95) / width - 0.5, // across the word, -0.5..0.5
        v: (cy + 0.5 + (r() - 0.5) * 0.95) / 7 - 0.5, // down it
        school: Math.floor(r() * 4),
        off: [Math.cos(ra) * rr * 1.3, Math.sin(ra) * rr],
        ph: r() * 10,
        delay: r() * 0.9,
        bend: (r() - 0.5) * 2,
        size: 0.8 + r() * 0.5,
        scat: [r() - 0.5, r() - 0.5],
      });
    }
    const quad = new THREE.PlaneGeometry(1, 1);
    quad.rotateX(-Math.PI / 2);
    const body = new THREE.InstancedMesh(quad, new THREE.MeshBasicMaterial(add({ map: fishTex, fog: false })), N);
    const halo = new THREE.InstancedMesh(quad, new THREE.MeshBasicMaterial(add({ map: haloTex, fog: false })), N);
    for (const m of [body, halo]) {
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.visible = false;
      env.add(m);
    }
    fish = { list, body, halo, width, t0: null, at: null, scatterAt: null, N };
    onFrame(drawFish);
    return fish;
  }
  // where fish f is at time t (the sea's frame), and how lit
  const mid = new THREE.Vector2((RAFT.x0 + RAFT.x1) / 2, (RAFT.z0 + RAFT.z1) / 2);
  function fishAt(f, t) {
    const { at, t0 } = fish;
    const s = t - t0;
    // circling: four sub-schools round the raft, each on its own loop
    const a = t * 0.32 + f.school * 1.57 + Math.sin(t * 0.5 + f.school) * 0.3;
    const R = 5.2 + Math.sin(t * 0.4 + f.school * 2) * 0.8;
    const wx = mid.x + Math.cos(a) * R * 1.15 + f.off[0] + Math.sin(t * 1.3 + f.ph) * 0.12;
    const wz = mid.y + Math.sin(a) * R + f.off[1] + Math.cos(t * 1.1 + f.ph) * 0.12;
    // the word: its place in the letters
    const tx = at.x + f.u * fish.width * at.cell + Math.sin(t * 2.1 + f.ph) * 0.03;
    const tz = at.z + f.v * 7 * at.cell + Math.cos(t * 1.7 + f.ph) * 0.03;
    // gathering: from 0.9 s in, each fish on its own schedule, over about two seconds,
    // on a curve (sideways out and back) rather than a straight line
    const g = smooth(0.9 + f.delay, 2.9 + f.delay, s);
    const side = Math.sin(g * Math.PI) * f.bend;
    const dx = tx - wx;
    const dz = tz - wz;
    let x = wx + dx * g - dz * side * 0.15;
    let z = wz + dz * g + dx * side * 0.15;
    let lit = smooth(0, 1.0, s) * (0.85 + 0.15 * Math.sin(t * 5 + f.ph * 3));
    if (fish.scatterAt !== null) {
      const q = t - fish.scatterAt;
      const away = 1 - Math.exp(-q * 1.6);
      const ox = x - at.x + f.scat[0] * 2;
      const oz = z - at.z + f.scat[1] * 2;
      const n = Math.hypot(ox, oz) || 1;
      x += (ox / n) * away * 4.5;
      z += (oz / n) * away * 4.5;
      lit *= 1 - smooth(0.2, 1.8, q);
    }
    return { x, z, lit };
  }
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const Y = new THREE.Vector3(0, 1, 0);
  const scale = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const tint = new THREE.Color();
  function drawFish(t) {
    if (fish.t0 === null) return;
    const { list, body, halo } = fish;
    let any = false;
    list.forEach((f, i) => {
      const p = fishAt(f, t);
      const p2 = fishAt(f, t + 0.05);
      const heading = Math.atan2(-(p2.z - p.z), p2.x - p.x);
      const y = SEA_Y + swellAt(p.x, p.z, t) + 0.015;
      // a tail beat: the body narrows and widens a little
      const beat = 1 + Math.sin(t * 14 + f.ph * 5) * 0.08;
      q.setFromAxisAngle(Y, heading);
      pos.set(p.x, y, p.z);
      body.setMatrixAt(i, m4.compose(pos, q, scale.set(0.2 * f.size * beat, 1, 0.09 * f.size)));
      body.setColorAt(i, tint.copy(FISH_COL).multiplyScalar(p.lit));
      pos.y -= 0.004;
      halo.setMatrixAt(i, m4.compose(pos, q, scale.set(0.7 * f.size, 1, 0.55 * f.size)));
      halo.setColorAt(i, tint.copy(HALO_COL).multiplyScalar(p.lit));
      any ||= p.lit > 0.002;
    });
    for (const m of [body, halo]) {
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor.needsUpdate = true;
      m.visible = any;
    }
  }
  out.fishSchool = (t0 = null, at = {}) => {
    makeFish();
    fish.at = { x: at.x ?? 0, z: at.z ?? RAFT.z0 - 2.7, cell: at.cell ?? 0.42 };
    fish.t0 = t0 ?? now;
    fish.scatterAt = null;
  };
  out.fishScatter = () => {
    if (!fish || fish.t0 === null || fish.scatterAt !== null) return;
    fish.scatterAt = now;
  };

  // ---- the laptop, floated over to you ----
  // where it hovers: over the table's near edge, a little right, square to the seat and
  // tipped back to look up at it (the seat's eye is at 0, 1.42, 0.95)
  const HOVER = { at: new THREE.Vector3(0.1, 1.15, 0.28), tilt: -0.16 };
  let float = null;
  out.laptop = (k) => {
    const g = laptop.body;
    if (!float) {
      // off the table into the world, its lead left lying where it was
      const parent = g.parent;
      scene.attach(g);
      parent.attach(laptop.cord);
      float = {
        from: g.position.clone(),
        q0: g.quaternion.clone(),
        to: HOVER.at,
        q1: new THREE.Quaternion().setFromEuler(new THREE.Euler(HOVER.tilt, 0, 0)),
      };
    }
    // up, over in an arc, a little wobble on the way, settling square at the end
    const { from, to, q0, q1 } = float;
    g.position.lerpVectors(from, to, k);
    g.position.y += 0.22 * Math.sin(Math.PI * k);
    g.quaternion.slerpQuaternions(q0, q1, k);
    g.rotateZ(0.12 * Math.sin(Math.PI * 2 * k) * (1 - k));
  };

  return { pv: out };
}
