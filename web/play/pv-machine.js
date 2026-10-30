// The machine room's hooks for the launch video (scene.pv, called by a director script):
// the agent's tests become the racks' LEDs. Inert until a hook runs; the normal page never
// sees any of it.
//
//   rackProgress(k)  k 0..1: the racks fill with green LEDs, bottom up, both at once
//   rackWave()       all tests pass: a green wave runs out from the table through the
//                    racks, the CRTs' glow and lights along the hanging cables, and the
//                    room settles to a calm all-green
//
// Everything is a function of the stage clock (onFrame's t), so a frame-stepped render
// comes out the same every time. The greens stop short of 255: the wave reads as bright
// without burning out to white.
import { THREE, canvasTex } from './stage.js';

const W = 48; // a rack face's texels (roulette.js rack())
const H = 160;
const FACE = { w: 0.55, h: 1.9, z: 0.302 };
const CALM = [52, 200, 120];
const PEAK = [150, 248, 186];
const SPEED = 2.4; // the wave, m/s
const BAND = 0.45; // its width, m

function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

// parts: what the room hands over (roulette.js buildRoom): its racks ({ leds, layer, g }),
// its CRTs ({ glow, halo, screen }), its hanging cables ({ pivot, curve }), the table's
// middle, and pvRacks, the switch that takes the racks' LEDs off the room's own loop
export function machinePv(stage, { racks, crts, cables, table, pvRacks }) {
  const { scene, onFrame } = stage;
  let progress = 0; // rackProgress's k
  let started = false;
  let waveAt = null; // the stage time the wave left the table
  let now = 0;
  onFrame((t) => (now = t));

  // ---- the LEDs the progress lights: a grid over each face, rows of three, keeping off
  // the room's own LEDs, each with the k it comes on at: bottom up, a little ragged ----
  const extra = racks.map((rack, ri) => {
    const r = rng(101 + ri);
    const taken = new Set(rack.leds.map((l) => `${l.x},${l.y}`));
    const out = [];
    for (let y = H - 9; y >= 9; y -= 3)
      for (let x = 7; x <= 40; x += 3) {
        if ([-1, 0, 1].some((dx) => taken.has(`${x + dx},${y}`) || taken.has(`${x + dx},${y - 1}`))) continue;
        out.push({ x, y, at: 0 });
      }
    const rows = (H - 18) / 3;
    for (const l of out) l.at = Math.min(0.999, Math.max(0.001, ((H - 9 - l.y) / 3 + (l.x - 7) / 34 * 0.8 + (r() - 0.5) * 1.6) / rows));
    return out;
  });
  // where each LED is in the room, for the wave
  const world = new THREE.Vector3();
  const place = (rack, x, y) => {
    rack.g.updateMatrixWorld(true);
    world.set(((x + 0.5) / W - 0.5) * FACE.w, (1 - (y + 0.5) / H) * FACE.h, FACE.z);
    return rack.g.localToWorld(world).distanceTo(table);
  };
  for (const [ri, rack] of racks.entries()) {
    for (const l of rack.leds) l.d = place(rack, l.x, l.y);
    for (const l of extra[ri]) l.d = place(rack, l.x, l.y);
  }

  // how far the wave is past a point d metres from the table: before it 0; in the band
  // a pulse up to 1; behind it the calm level, breathing slowly
  const wave = (d) => {
    if (waveAt === null) return { pulse: 0, calm: 0 };
    const s = (now - waveAt) * SPEED - d;
    if (s < -BAND) return { pulse: 0, calm: 0 };
    const pulse = Math.exp(-((s / BAND) ** 2) * 2) * Math.exp(-Math.max(0, s) * 0.6);
    const calm = Math.min(1, Math.max(0, (s + BAND) / (BAND * 2)));
    return { pulse, calm };
  };
  const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
  const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
  const breathe = (d) => 0.88 + 0.12 * Math.sin(now * 1.3 - d * 2.2);

  // ---- the racks' LEDs, drawn here every frame once a hook has run ----
  function drawRacks() {
    for (const [ri, rack] of racks.entries()) {
      const ctx = rack.layer.ctx;
      // the room's own LEDs keep their rhythm until the wave reaches them
      pvRacks.draw(rack, now, waveAt === null ? null : (l) => wave(l.d).calm <= 0);
      for (const l of [...rack.leds, ...extra[ri]]) {
        const { pulse, calm } = wave(l.d);
        const lit = l.at !== undefined ? progress >= l.at : false;
        if (calm > 0 || pulse > 0.02) {
          const base = mix([0, 0, 0], CALM, calm * breathe(l.d));
          ctx.fillStyle = rgb(mix(base, PEAK, pulse));
          ctx.fillRect(l.x, l.y, 1, 1);
        } else if (lit) {
          ctx.fillStyle = rgb(CALM);
          ctx.fillRect(l.x, l.y, 1, 1);
        }
      }
      rack.layer.tex.needsUpdate = true;
    }
  }

  // ---- a soft green glow over each rack's face and a green light before it, for the
  // wave going through; low and steady after ----
  const glowTex = canvasTex(16, 32, (ctx) => {
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 16; x++) {
        const d = Math.max(Math.abs(x - 7.5) / 8, Math.abs(y - 15.5) / 16);
        ctx.fillStyle = `rgba(70,230,140,${Math.max(0, 1 - d) ** 1.5})`;
        ctx.fillRect(x, y, 1, 1);
      }
  });
  let rackGlows = null;
  function makeGlows() {
    rackGlows = racks.map((rack) => {
      const m = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(FACE.w * 1.5, FACE.h * 1.15), m);
      plane.position.set(0, FACE.h / 2, FACE.z + 0.01);
      rack.g.add(plane);
      const light = new THREE.PointLight(0x50f090, 0, 1.6, 1.6);
      light.position.set(0, 1.0, 0.5);
      rack.g.add(light);
      return { m, light, d: place(rack, W / 2, H / 2) };
    });
  }

  // ---- lights along the hanging cables, dark until the wave reaches them ----
  let cableDots = null;
  function makeCableDots() {
    const geo = new THREE.BoxGeometry(0.022, 0.022, 0.022);
    const dots = [];
    const meshes = [];
    for (const { pivot, curve } of cables) {
      const n = 9;
      const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), n);
      const m4 = new THREE.Matrix4();
      pivot.updateMatrixWorld(true);
      for (let i = 0; i < n; i++) {
        const p = curve.getPointAt((i + 0.5) / n);
        m4.makeTranslation(p.x, p.y, p.z);
        m.setMatrixAt(i, m4);
        m.setColorAt(i, new THREE.Color(0, 0, 0));
        dots.push({ m, i, d: pivot.localToWorld(p.clone()).distanceTo(table) });
      }
      pivot.add(m);
      meshes.push(m);
    }
    cableDots = { dots, meshes };
  }
  const col = new THREE.Color();
  function drawCables() {
    for (const dot of cableDots.dots) {
      const { pulse, calm } = wave(dot.d);
      const c = mix(mix([0, 0, 0], CALM, calm * 0.8 * breathe(dot.d)), PEAK, pulse);
      dot.m.setColorAt(dot.i, col.setRGB(c[0] / 255, c[1] / 255, c[2] / 255, THREE.SRGBColorSpace));
    }
    for (const m of cableDots.meshes) m.instanceColor.needsUpdate = true;
  }

  // ---- the CRTs' glow turns green with the wave (the room's own loop sets it each
  // frame; this runs after it) ----
  const crtBase = crts.map((s) => ({ color: s.glow.color.getHex(), halo: s.halo.material.opacity, d: s.glow.getWorldPosition(new THREE.Vector3()).distanceTo(table) }));
  const crtGreen = new THREE.Color(0x48f090);
  function drawCrts() {
    crts.forEach((s, i) => {
      const { pulse, calm } = wave(crtBase[i].d);
      if (!calm && !pulse) return;
      s.glow.color.setHex(crtBase[i].color).lerp(crtGreen, calm);
      s.glow.intensity = s.glow.intensity * (1 - calm) + 0.5 * calm + 1.6 * pulse;
      s.halo.material.opacity = crtBase[i].halo + 0.25 * pulse;
    });
  }

  // a flash on the table as it starts: the wave's source
  const flash = new THREE.PointLight(0x50f090, 0, 2.2, 1.4);
  flash.position.copy(table).add(new THREE.Vector3(0, 0.25, 0));
  // and a ring of green light running out over the floor and the table's top with the
  // front, so the wave reads as leaving the table
  const ringTex = canvasTex(64, 64, (ctx) => {
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        const d = Math.hypot(x - 31.5, y - 31.5) / 32;
        ctx.fillStyle = `rgba(80,235,150,${Math.exp(-(((d - 0.86) / 0.07) ** 2)) * (d < 1 ? 1 : 0)})`;
        ctx.fillRect(x, y, 1, 1);
      }
  });
  const rings = [0.012, table.y + 0.012].map((y) => {
    const m = new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(table.x, y, table.z);
    ring.visible = false;
    return ring;
  });

  function start() {
    if (started) return;
    started = true;
    pvRacks.on = true;
    onFrame(() => {
      drawRacks();
      if (waveAt === null) return;
      drawCables();
      drawCrts();
      for (const gl of rackGlows) {
        const { pulse, calm } = wave(gl.d);
        gl.m.opacity = 0.6 * pulse + 0.1 * calm * breathe(gl.d);
        gl.light.intensity = 3.5 * pulse + 0.6 * calm;
      }
      const s = now - waveAt;
      flash.intensity = s < 0 ? 0 : 2.4 * Math.exp(-s * 3) + 0.25 * Math.min(1, s);
      // the ring's bright band sits at 0.86 of its radius: keep that on the front
      const radius = Math.max(0.05, (s * SPEED) / 0.86);
      for (const [i, ring] of rings.entries()) {
        // the one on the table's top goes once it is past the table's edge
        ring.visible = s < 3 && (i === 0 || s * SPEED < 0.62);
        ring.scale.setScalar(radius);
        ring.material.opacity = 0.9 * Math.exp(-s * 0.9);
      }
    });
  }

  return {
    rackProgress(k) {
      start();
      progress = Math.max(0, Math.min(1, k));
    },
    rackWave() {
      start();
      progress = 1;
      if (waveAt !== null) return;
      makeGlows();
      makeCableDots();
      scene.add(flash, ...rings);
      waveAt = now;
    },
  };
}
