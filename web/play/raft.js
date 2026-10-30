// What stands on the raft besides our table (casino.js builds the sky, the sea and the
// table): the raft itself, lashed logs with the water lapping at their edges; string
// lights on bamboo poles; a low side table with a lamp and a radio, and on the right a
// small one with the agent's laptop; a rod over the back edge, its float out on the water, and the cat sitting by it, watching.
// Far off, a gull goes over now and then. The raft never moves; only the water, the
// lights' sway, the gull, the cat and the float do, all slow.
import { THREE, canvasTex, drawBits, mat } from './stage.js';
import { swellAt, SWELL_MAX } from './sea.js';
import { buildLaptop } from './laptop.js';

function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

// a soft round glow for bulbs and lamps: added on top, the bloom of the lofi look
const bloomTex = canvasTex(32, 32, (ctx) => {
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const d = Math.hypot(x - 15.5, y - 15.5) / 16;
      ctx.fillStyle = `rgba(255,${Math.round(196 - d * 50)},${Math.round(120 - d * 50)},${Math.max(0, 1 - d) ** 2.2})`;
      ctx.fillRect(x, y, 1, 1);
    }
});
function bloom(at, size, opacity = 0.5) {
  const m = new THREE.SpriteMaterial({ map: bloomTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity, fog: false });
  const s = new THREE.Sprite(m);
  s.position.copy(at);
  s.scale.setScalar(size);
  return s;
}

// The raft's extent: a roomy deck, not a plank under the table. It runs out of frame at
// our near corners, well past the side table on the left and the cat and rod on the
// right, and on for a couple of metres behind the agent's chair.
export const RAFT = { x0: -3.1, x1: 3.0, z0: -3.3, z1: 2.2 };

// env: the sea and sky, which rock against the raft (sea.js); what floats goes in it
export function buildRaftProps(stage, { SEA_Y, glow, env }) {
  const { scene, onFrame } = stage;
  // where the water is at a point of the raft's, now: the swell, as the rocking tilts it
  const toEnv = new THREE.Vector3();
  const waterAt = (x, z, t) => {
    env.worldToLocal(toEnv.set(x, SEA_Y, z));
    const h = swellAt(toEnv.x, toEnv.z, t);
    return { y: env.localToWorld(toEnv.setY(SEA_Y + h)).y, crest: h / SWELL_MAX };
  };
  const r = rng(77);

  // ---- the raft: logs laid side by side across our view, lashed with rope near each end.
  // Their tops are the floor (y = 0); the water comes a third of the way up their sides ----
  const LOG_R = 0.085;
  const barkTex = canvasTex(32, 8, (ctx) => {
    ctx.fillStyle = '#7a5a3c';
    ctx.fillRect(0, 0, 32, 8);
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = r() < 0.5 ? '#6a4c32' : r() < 0.6 ? '#8a6a48' : '#5a4028';
      ctx.fillRect(Math.floor(r() * 32), Math.floor(r() * 8), 2 + Math.floor(r() * 6), 1);
    }
  });
  barkTex.wrapS = THREE.RepeatWrapping;
  const endTex = canvasTex(12, 12, (ctx) => {
    for (let y = 0; y < 12; y++)
      for (let x = 0; x < 12; x++) {
        const d = Math.hypot(x - 5.5, y - 5.5);
        ctx.fillStyle = d > 5 ? '#5a4028' : Math.round(d) % 2 ? '#b8946a' : '#a8845a';
        ctx.fillRect(x, y, 1, 1);
      }
  });
  const tones = [0xffffff, 0xf0e8e0, 0xe4dcd0, 0xfaf0e4];
  const n = Math.round((RAFT.z1 - RAFT.z0) / (LOG_R * 2));
  for (let i = 0; i < n; i++) {
    const z = RAFT.z1 - LOG_R - i * LOG_R * 2;
    const len = RAFT.x1 - RAFT.x0 - r() * 0.12;
    const tex = barkTex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(len * 2.5, 1);
    tex.offset.x = r();
    const bark = mat({ map: tex, color: tones[i % 4] });
    const ends = mat({ map: endTex, color: tones[i % 4] });
    const g = new THREE.CylinderGeometry(LOG_R, LOG_R * 1.04, len, 9);
    g.rotateZ(Math.PI / 2);
    const log = new THREE.Mesh(g, [bark, ends, ends]);
    log.position.set((RAFT.x0 + RAFT.x1) / 2 + (r() - 0.5) * 0.06, -LOG_R, z);
    log.receiveShadow = true;
    scene.add(log);
  }
  // rope lashings across the logs near each end
  const ropeTex = canvasTex(4, 16, (ctx) => {
    ctx.fillStyle = '#c8b080';
    ctx.fillRect(0, 0, 4, 16);
    ctx.fillStyle = '#9a8458';
    for (let y = 0; y < 16; y += 2) ctx.fillRect(0, y, 4, 1);
  });
  ropeTex.wrapT = THREE.RepeatWrapping;
  ropeTex.repeat.set(1, 30);
  const rope = mat({ map: ropeTex });
  for (const x of [RAFT.x0 + 0.25, RAFT.x1 - 0.25]) {
    const lash = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.02, RAFT.z1 - RAFT.z0), rope);
    lash.position.set(x, 0.004, (RAFT.z0 + RAFT.z1) / 2);
    lash.receiveShadow = true;
    scene.add(lash);
  }

  // the water lapping at the edges: pale ripples along each side, riding the water line
  // up and down the logs and brightening as a swell comes up against them
  const foamTex = canvasTex(32, 4, (ctx) => {
    for (let x = 0; x < 32; x++) {
      const a = 0.35 + 0.35 * Math.sin(x * 0.7) * Math.sin(x * 0.23);
      ctx.fillStyle = `rgba(200,210,240,${Math.max(0, a)})`;
      ctx.fillRect(x, 1, 1, 1);
      ctx.fillStyle = `rgba(160,170,220,${Math.max(0, a * 0.5)})`;
      ctx.fillRect(x, 2, 1, 1);
    }
  });
  foamTex.wrapS = THREE.RepeatWrapping;
  const laps = [];
  const edge = (cx, cz, len, ang) => {
    for (let k = 0; k < Math.ceil(len / 0.8); k++) {
      const seg = Math.min(0.8, len - k * 0.8);
      const m = new THREE.MeshBasicMaterial({ map: foamTex.clone(), transparent: true, depthWrite: false, opacity: 0.5 });
      m.map.needsUpdate = true;
      m.map.repeat.set(seg * 3, 1);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(seg, 0.08), m);
      p.rotation.set(-Math.PI / 2, 0, ang);
      const along = -len / 2 + k * 0.8 + seg / 2;
      p.position.set(cx + Math.cos(ang) * along, SEA_Y + 0.006, cz - Math.sin(ang) * along);
      scene.add(p);
      laps.push({ m, phase: r() * 6, out: new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang)), base: p.position.clone(), p });
    }
  };
  edge((RAFT.x0 + RAFT.x1) / 2, RAFT.z0 - 0.05, RAFT.x1 - RAFT.x0, 0);
  edge(RAFT.x1 + 0.05, (RAFT.z0 + RAFT.z1) / 2, RAFT.z1 - RAFT.z0, Math.PI / 2);
  edge(RAFT.x0 - 0.05, (RAFT.z0 + RAFT.z1) / 2, RAFT.z1 - RAFT.z0, -Math.PI / 2);
  onFrame((t) => {
    for (const l of laps) {
      const w = waterAt(l.base.x, l.base.z, t);
      l.p.position.y = w.y + 0.006;
      l.m.opacity = 0.22 + 0.12 * Math.sin(t * 0.7 + l.phase) + 0.22 * Math.max(0, w.crest);
      l.m.map.offset.x = t * 0.02 + l.phase;
    }
  });

  // ---- string lights on three bamboo poles, two at the back corners and one at the left, warm small bulbs, the strands swaying a
  // little in the sea air ----
  const bambooTex = canvasTex(4, 32, (ctx) => {
    ctx.fillStyle = '#b8a060';
    ctx.fillRect(0, 0, 4, 32);
    ctx.fillStyle = '#d0b878';
    ctx.fillRect(1, 0, 1, 32);
    ctx.fillStyle = '#7a6a38';
    for (let y = 3; y < 32; y += 8) ctx.fillRect(0, y, 4, 1);
  });
  bambooTex.wrapT = THREE.RepeatWrapping;
  const POLE_H = 2.1;
  const poles = [new THREE.Vector3(-2.3, POLE_H, -2.7), new THREE.Vector3(2.3, POLE_H, -2.75), new THREE.Vector3(-2.4, POLE_H, 0.4)];
  for (const p of poles) {
    const tex = bambooTex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(1, POLE_H * 2);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, POLE_H, 6), mat({ map: tex }));
    pole.position.set(p.x, POLE_H / 2, p.z);
    pole.castShadow = true;
    scene.add(pole);
  }
  const strands = [
    [poles[0], poles[1]],
    [poles[2], poles[0]],
  ];
  const wireMat = new THREE.LineBasicMaterial({ color: 0x241c24 });
  const bulbCols = [0xffd890, 0xffc070, 0xffe4b0, 0xffb860];
  const sway = [];
  strands.forEach(([a, b], si) => {
    const count = Math.max(6, Math.round(a.distanceTo(b) / 0.36));
    const sag = 0.2 + a.distanceTo(b) * 0.06;
    const pts = [];
    const bulbs = [];
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      const p = a.clone().lerp(b, t);
      p.y -= Math.sin(t * Math.PI) * sag;
      pts.push(p);
      if (i === 0 || i === count) continue;
      const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.06, 0.045), glow(bulbCols[(i + si) % 4]));
      const halo = bloom(p, 0.38, 0.4);
      scene.add(bulb, halo);
      bulbs.push({ bulb, halo, base: p.clone(), t });
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    scene.add(new THREE.Line(geo, wireMat));
    sway.push({ pts, bulbs, geo, phase: si * 1.3 });
  });
  const strandLight = new THREE.PointLight(0xffc880, 1.4, 4, 1.4);
  strandLight.position.set(0, 1.85, -2.1);
  scene.add(strandLight);
  onFrame((t) => {
    // the sea air, and now and then a breath more of it
    const breeze = 0.03 * (1 + 0.6 * Math.max(0, Math.sin(t * 0.13)) ** 2);
    for (const s of sway) {
      const k = Math.sin(t * 0.55 + s.phase) * breeze;
      const arr = s.geo.attributes.position;
      s.pts.forEach((p, i) => {
        const u = Math.sin((i / (s.pts.length - 1)) * Math.PI);
        arr.setXYZ(i, p.x + k * u * 0.4, p.y + Math.abs(k) * u * 0.3, p.z + k * u);
      });
      arr.needsUpdate = true;
      for (const b of s.bulbs) {
        const u = Math.sin(b.t * Math.PI);
        b.bulb.position.set(b.base.x + k * u * 0.4, b.base.y + Math.abs(k) * u * 0.3 - 0.03, b.base.z + k * u);
        b.halo.position.copy(b.bulb.position);
      }
    }
  });

  // ---- on the left: a low teak side table, a lamp and an old radio on it, both glowing
  // steady ----
  const stand = new THREE.Group();
  const darkTeak = mat({ color: 0x6a4428 });
  const TOP_H = 0.5;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.03, 16), darkTeak);
  top.position.y = TOP_H - 0.015;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, TOP_H - 0.03, 6), darkTeak);
  stem.position.y = (TOP_H - 0.03) / 2;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.025, 12), darkTeak);
  foot.position.y = 0.012;
  stand.add(top, stem, foot);
  // the radio: a cream case, a speaker cloth, the dial lit amber, two knobs
  const radioTex = canvasTex(24, 14, (ctx) => {
    ctx.fillStyle = '#cfc2a6';
    ctx.fillRect(0, 0, 24, 14);
    ctx.fillStyle = '#6a4a38';
    ctx.fillRect(2, 2, 10, 10);
    ctx.fillStyle = '#5e4232';
    for (let y = 3; y < 12; y += 2) ctx.fillRect(3, y, 8, 1);
    ctx.fillStyle = '#e8b060';
    ctx.fillRect(14, 3, 8, 4);
    ctx.fillStyle = '#a06a30';
    for (let x = 15; x < 22; x += 2) ctx.fillRect(x, 4, 1, 1);
    ctx.fillStyle = '#4a3020';
    ctx.fillRect(15, 9, 2, 2);
    ctx.fillRect(20, 9, 2, 2);
  });
  const cream = mat({ color: 0xc8bca2 });
  const radio = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.08), [cream, cream, cream, cream, mat({ map: radioTex, emissiveMap: radioTex, emissive: 0x2a1a0c }), cream]);
  radio.position.set(-0.07, TOP_H + 0.06, -0.04);
  radio.rotation.y = 0.35;
  stand.add(radio);
  // the lamp: a brass hurricane lantern, its light steady on the raft and the felt
  const brass = mat({ color: 0xa08048, emissive: 0x1a0c04 });
  const lantern = new THREE.Group();
  const lBase = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.04, 8), brass);
  lBase.position.y = 0.02;
  const lGlass = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.1, 8), glow(0xf0b868, { transparent: true, opacity: 0.85 }));
  lGlass.position.y = 0.09;
  const lCap = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.05, 8), brass);
  lCap.position.y = 0.165;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.004, 4, 10, Math.PI), brass);
  handle.position.y = 0.19;
  lantern.add(lBase, lGlass, lCap, handle);
  lantern.position.set(0.12, TOP_H, 0.02);
  stand.add(lantern);
  stand.add(bloom(new THREE.Vector3(0.12, TOP_H + 0.09, 0.02), 0.6, 0.38));
  const lanternLight = new THREE.PointLight(0xffa850, 2.2, 2.6, 1.5);
  lanternLight.position.set(0.12, TOP_H + 0.12, 0.02);
  stand.add(lanternLight);
  stand.traverse((o) => o.isMesh && (o.castShadow = true));
  stand.position.set(-1.25, 0, -1.0);
  scene.add(stand);

  // ---- on the right, its pair: a small square teak table, four legs, the agent's laptop
  // open on it toward our seat, its lead down over the outer edge (laptop.js) ----
  const desk = new THREE.Group();
  const DESK = { w: 0.42, d: 0.32 };
  const deskTop = new THREE.Mesh(new THREE.BoxGeometry(DESK.w, 0.03, DESK.d), darkTeak);
  deskTop.position.y = TOP_H - 0.015;
  const apron = new THREE.Mesh(new THREE.BoxGeometry(DESK.w - 0.06, 0.05, DESK.d - 0.06), darkTeak);
  apron.position.y = TOP_H - 0.055;
  desk.add(deskTop, apron);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.03, TOP_H - 0.03, 0.03), darkTeak);
    leg.position.set(sx * (DESK.w / 2 - 0.035), (TOP_H - 0.03) / 2, sz * (DESK.d / 2 - 0.035));
    desk.add(leg);
  }
  desk.traverse((o) => o.isMesh && (o.castShadow = o.receiveShadow = true));
  const laptop = buildLaptop(stage, { parent: desk, at: new THREE.Vector3(0, TOP_H, 0.01) });
  desk.position.set(1.25, 0, -1.0);
  desk.rotation.y = -0.45;
  scene.add(desk);

  // ---- at the back on the right: a bamboo rod out over the edge, propped in a forked
  // stick, its line down to a float on the water ----
  // (kept in the band between the chair and the right-hand score card, even in a small
  // window: from our seat the rod, the float and the cat all fall left of it)
  const rodBase = new THREE.Vector3(1.45, 0.03, -2.3);
  const rodTip = new THREE.Vector3(2.25, 1.3, -3.75);
  const rodLen = rodBase.distanceTo(rodTip);
  const rodTex = bambooTex.clone();
  rodTex.needsUpdate = true;
  rodTex.repeat.set(1, rodLen * 3);
  const rodGeo = new THREE.CylinderGeometry(0.006, 0.014, rodLen, 5);
  rodGeo.translate(0, rodLen / 2, 0);
  const rod = new THREE.Mesh(rodGeo, mat({ map: rodTex }));
  rod.position.copy(rodBase);
  rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), rodTip.clone().sub(rodBase).normalize());
  rod.castShadow = true;
  scene.add(rod);
  // the forked stick it rests in, a third of the way up
  const rest = rodBase.clone().lerp(rodTip, 0.22);
  const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, rest.y, 5), mat({ map: bambooTex }));
  fork.position.set(rest.x, rest.y / 2, rest.z);
  fork.castShadow = true;
  scene.add(fork);
  // a little reel by the handle
  const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.025, 10), mat({ color: 0x4a4a52 }));
  reel.position.copy(rodBase.clone().lerp(rodTip, 0.06));
  reel.rotation.z = Math.PI / 2;
  scene.add(reel);
  // the float: red over white, out on the water (so in the sea's frame), riding the swell
  // with a little bob of its own
  const floatAt = new THREE.Vector3(2.5, SEA_Y, -4.6);
  const float = new THREE.Group();
  const fTop = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), glow(0xe8504a));
  const fBot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), glow(0xf0ece0));
  const fStick = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.05, 4), glow(0xe8504a));
  fStick.position.y = 0.05;
  float.add(fTop, fBot, fStick);
  float.position.copy(floatAt);
  env.add(float);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.065, 16), new THREE.MeshBasicMaterial({ color: 0xc8d0f0, transparent: true, opacity: 0.3, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(floatAt.x, SEA_Y + 0.004, floatAt.z);
  env.add(ring);
  const lineEnd = new THREE.Vector3();
  const lineGeo = new THREE.BufferGeometry().setFromPoints([rodTip, floatAt.clone().setY(SEA_Y + 0.07)]);
  scene.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xd8d4e0, transparent: true, opacity: 0.6 })));
  onFrame((t) => {
    const bob = Math.sin(t * 1.1) * 0.006 + Math.sin(t * 0.43) * 0.004;
    const h = swellAt(floatAt.x, floatAt.z, t);
    float.position.y = floatAt.y + h + bob;
    ring.position.y = SEA_Y + h + 0.004;
    float.localToWorld(lineEnd.set(0, 0.07, 0));
    lineGeo.attributes.position.setXYZ(1, lineEnd.x, lineEnd.y, lineEnd.z);
    lineGeo.attributes.position.needsUpdate = true;
    ring.scale.setScalar(1 + (Math.sin(t * 1.1) + 1) * 0.15);
    ring.material.opacity = 0.15 + (1 - (Math.sin(t * 1.1) + 1) / 2) * 0.2;
  });

  // ---- the cat: a ginger cat sitting by the rod near the back, its back to us,
  // watching the float.
  // It breathes, and now and then the tip of its tail flicks ----
  // a little warmth of its own: we only ever see its back, the side away from the lights
  const furMat = mat({ color: 0xd88a48, emissive: 0x2a1006 });
  const darkFur = mat({ color: 0xa85e2c, emissive: 0x1a0804 });
  const cat = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), furMat);
  torso.scale.set(0.85, 1.2, 0.8);
  torso.position.y = 0.12;
  const haunch = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 6), furMat);
  haunch.scale.set(1.05, 0.6, 1.0);
  haunch.position.set(0, 0.055, -0.02);
  const head = new THREE.Group();
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.062, 8, 6), furMat);
  skull.scale.set(1, 0.9, 0.95);
  head.add(skull);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.048, 4), darkFur);
    ear.position.set(s * 0.032, 0.058, -0.005);
    ear.rotation.set(0, Math.PI / 4, s * -0.25);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.028, 4), mat({ color: 0xc88a96 }));
    inner.position.set(s * 0.032, 0.054, 0.006);
    inner.rotation.copy(ear.rotation);
    head.add(ear, inner);
  }
  head.position.set(0, 0.27, 0.03);
  // the tail: out at its side and curling up (the side toward us, so it shows over the
  // table's rim), its tip free to flick
  const tailBase = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.028, 0.03), furMat);
  tailBase.position.set(-0.11, 0.045, -0.05);
  tailBase.rotation.z = -0.6;
  const tailPivot = new THREE.Group();
  tailPivot.position.set(-0.165, 0.085, -0.05);
  const tailTip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.028, 0.03), darkFur);
  tailTip.position.set(-0.02, 0.035, 0);
  tailTip.rotation.z = -1.1;
  tailPivot.add(tailTip);
  cat.add(haunch, torso, head, tailBase, tailPivot);
  cat.traverse((o) => o.isMesh && (o.castShadow = true));
  const catAt = new THREE.Vector3(1.15, 0, -2.6);
  cat.position.copy(catAt);
  cat.scale.setScalar(1.25);
  // +z is where it looks: at the float
  cat.rotation.y = Math.atan2(floatAt.x - catAt.x, floatAt.z - catAt.z);
  scene.add(cat);
  let flickAt = 5;
  onFrame((t) => {
    const b = Math.sin(t * 1.4);
    torso.scale.set(0.85 + b * 0.01, 1.2 + b * 0.025, 0.8 + b * 0.01);
    head.position.y = 0.27 + b * 0.003;
    if (t > flickAt + 1.4) flickAt = t + 6 + Math.random() * 9;
    const k = t > flickAt ? Math.sin(((t - flickAt) / 1.4) * Math.PI * 2) * (1 - (t - flickAt) / 1.4) : 0;
    tailPivot.rotation.z = Math.sin(t * 0.5) * 0.1 - k * 0.5;
  });

  // ---- far off: a gull now and then ----
  const gullTex = [0, 1].map((f) =>
    canvasTex(9, 4, (ctx) => drawBits(ctx, f ? ['.........', 'XXX...XXX', '...X.X...', '....X....'] : ['XX.....XX', '..X...X..', '...X.X...', '....X....'], 0, 0, 1, '#2a2440')),
  );
  const gullMat = new THREE.SpriteMaterial({ map: gullTex[0], transparent: true, alphaTest: 0.5, fog: false });
  const gull = new THREE.Sprite(gullMat);
  gull.scale.set(0.45, 0.2, 1);
  env.add(gull);
  onFrame((t) => {
    const u = (t % 26) / 9; // over in nine seconds, then a quiet sky
    gull.visible = u < 1;
    if (!gull.visible) return;
    gull.position.set(-14 + u * 30, 3.6 + Math.sin(u * 5) * 0.4, -16);
    gullMat.map = gullTex[Math.floor(t * 3) % 2];
  });

  // where the scene's sounds would come from: the water along the edges, the radio, the
  // float. The ambience places them when it has them (audio.js).
  const sound = {
    water: [new THREE.Vector3(RAFT.x0, SEA_Y, -0.2), new THREE.Vector3(RAFT.x1, SEA_Y, -0.2), new THREE.Vector3(0, SEA_Y, RAFT.z0)],
    radio: radio.getWorldPosition(new THREE.Vector3()),
    float: floatAt.clone(),
  };
  // the warm lights, for a script that turns the night up (casino.js setLight)
  // laptop: its glass is one of the scene's screens, and it glows more at night
  return { sound, lights: { strand: strandLight, lantern: lanternLight }, laptop };
}
