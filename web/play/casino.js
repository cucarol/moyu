// The raft, shared by 21 and Yacht: a small wooden raft out on the open sea, sunset just
// gone into night. No rails, nothing standing in the view: sea and horizon all round, the
// last amber glow low on the right, blue-violet above, the first stars, a low island
// with a lighthouse burning steady, one boat light. On the raft only what the game needs and a
// little more: our table, the agent's deck chair, a side table with a lamp and a radio,
// string lights on bamboo poles, and a rod over the edge (摸鱼: fishing, idly) with the
// cat watching its float. Still and chill: the raft and the camera never move; only the
// water, the lights' sway, a gull, the cat and the float do. Each game dresses
// the table (prints the felt, lays its props). Dark, cramped rooms are roulette's.
import { THREE, canvasTex, pixelText, drawBits, mat, snapped } from './stage.js';
import { t as tr } from './i18n.js';
import { buildRaftProps } from './raft.js';
import { seaMaterial, swellAt, rockRaft } from './sea.js';
import { raftPv } from './pv-raft.js';

export const TABLE_Y = 0.76;
// the felt is an ellipse; keep things on the table inside it
export const FELT = { rx: 0.64, rz: 0.42 };

// the camera barely follows the pointer: cards, chips and dice are small things to click.
// fog: the dusk's own haze at the horizon, so the sea fades into it; far: out to the horizon
export const roomOptions = { background: 0xa07090, fog: [0xa07090, 0.03], look: 0.3, vignette: 0.74, far: 60 };

function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

const GOLD = 0xe0b450;
const glow = (color, opts = {}) => new THREE.MeshBasicMaterial({ color, ...opts });

// The felt between games: the scene's name, faint.
export function idlePrint(ctx, w, h) {
  const t = pixelText(tr('ui.casino.feltPrint'), { color: '#c9a24a' });
  ctx.globalAlpha = 0.6;
  ctx.drawImage(t, Math.round((w - t.width) / 2), Math.round(h / 2 - 6));
  ctx.globalAlpha = 1;
}

// print(ctx, w, h): the game's own markings on the felt, drawn over the cloth, in a
// 256x170 canvas mapped onto the ellipse's bounding box. The returned print(fn) redraws
// the felt for another game (or idlePrint between games) without touching the scene.
export function buildRaft(stage, { print = idlePrint } = {}) {
  const { scene, onFrame, post } = stage;

  // out in the open: no dotted shadows (that's roulette's), and the lofi pass on
  post.uShadowAmt.value = 0;
  post.uLofi.value = 1;

  const SEA_Y = -0.12; // the water, just under the raft's top
  // the sea and the sky: everything the raft rocks against (sea.js)
  const env = new THREE.Group();
  scene.add(env);

  // -- the sky: dusk, the sun gone under off to the right. A thin amber afterglow at the
  // waterline there, rose and violet round the rest of the horizon, deep blue overhead,
  // painted per direction onto a sphere round us.
  const sunDir = new THREE.Vector3(0.54, 0, -0.84).normalize();
  const STOPS = [
    [0, [176, 112, 140]],
    [2, [140, 96, 150]],
    [5, [100, 84, 152]],
    [9, [70, 70, 140]],
    [15, [48, 52, 116]],
    [25, [30, 34, 84]],
    [90, [16, 18, 46]],
  ];
  const HORIZON = STOPS[0][1];
  const skyAt = (e) => {
    if (e <= 0) return HORIZON;
    const i = STOPS.findIndex(([d]) => d >= e);
    const [d0, c0] = STOPS[i - 1];
    const [d1, c1] = STOPS[i];
    const u = (e - d0) / (d1 - d0);
    return c0.map((v, k) => v + (c1[k] - v) * u);
  };
  const SW = 256;
  const SH = 128;
  const paintSky = (at, glowAmt) =>
    canvasTex(SW, SH, (ctx) => {
      for (let r = 0; r < SH; r++) {
        const theta = ((r + 0.5) / SH) * Math.PI;
        const e = 90 - (theta * 180) / Math.PI;
        for (let c = 0; c < SW; c++) {
          const phi = ((c + 0.5) / SW) * Math.PI * 2;
          const along = -Math.cos(phi) * sunDir.x + Math.sin(phi) * sunDir.z;
          const a = Math.acos(Math.max(-1, Math.min(1, along)));
          // the afterglow where the sun went down, hugging the horizon
          const w = Math.min(1, Math.exp(-a / 0.5) * Math.exp(-Math.max(0, e) / 2.2) * 0.9) * glowAmt;
          const col = at(e).map((v, k) => Math.round(v + ([255, 168, 104][k] - v) * w));
          ctx.fillStyle = `rgb(${col.join(',')})`;
          ctx.fillRect(c, r, 1, 1);
        }
      }
    });
  const skyTex = paintSky(skyAt, 1);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 48, 32), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }));
  sky.position.set(0, 1.42, 0.95);
  env.add(sky);
  // the sun itself, already under: a low glow the sea hides most of
  const sunAt = sunDir.clone().multiplyScalar(45).add(new THREE.Vector3(0, -1.35, 0));
  const halo = canvasTex(48, 48, (ctx) => {
    for (let y = 0; y < 48; y++)
      for (let x = 0; x < 48; x++) {
        const d = Math.hypot(x - 23.5, (y - 23.5) * 1.6) / 24;
        ctx.fillStyle = `rgba(255,${Math.round(200 - d * 60)},${Math.round(130 - d * 50)},${Math.max(0, 1 - d) ** 2 * 0.85})`;
        ctx.fillRect(x, y, 1, 1);
      }
  });
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo, fog: false, depthWrite: false, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending }));
  sun.position.copy(sunAt);
  sun.scale.set(12, 6, 1);
  env.add(sun);
  // the first stars, all round the sky away from the glow, a few of them breathing
  const starPos = [];
  const starCol = [];
  const sr = rng(41);
  for (let i = 0; i < 150; i++) {
    const e = (7 + sr() * 40) * (Math.PI / 180);
    const az = -1.4 + sr() * 3.8;
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(e), Math.sin(e), -Math.cos(az) * Math.cos(e));
    const nearSun = dir.angleTo(sunDir);
    if (nearSun < 0.6 && e < 0.3) continue;
    starPos.push(...dir.multiplyScalar(46).add(sky.position).toArray());
    starCol.push(1, 0.94, 0.85);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  starGeo.setAttribute('color', new THREE.Float32BufferAttribute(starCol, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 1, sizeAttenuation: false, vertexColors: true, fog: false, transparent: true, depthWrite: false }));
  env.add(stars);
  const starBase = starPos.map((_, i) => 0.35 + ((i * 7919) % 100) / 160);
  onFrame((t) => {
    const c = starGeo.attributes.color;
    for (let i = 0; i < c.count; i++) {
      const k = Math.max(0.15, starBase[i * 3] * (0.75 + 0.25 * Math.sin(t * (0.4 + (i % 5) * 0.13) + i)));
      c.setXYZ(i, k, k * 0.94, k * 0.85);
    }
    c.needsUpdate = true;
  });

  // -- light: the blue dusk all round, the last of the sunset low from the right, and the
  // lamp over our felt for soft shadows; the lamp, the strings and the side table's
  // lantern add warm pools (raft.js)
  const hemi = new THREE.HemisphereLight(0xa8a8e8, 0x3a2c44, 1.15);
  const ambient = new THREE.AmbientLight(0x9080b0, 0.22);
  scene.add(hemi, ambient);
  const dusk = new THREE.DirectionalLight(0x8a9cf0, 0.9);
  dusk.position.set(8, 3, -1);
  scene.add(dusk);
  const sunset = new THREE.DirectionalLight(0xff9a66, 0.55);
  sunset.position.copy(sunDir).multiplyScalar(10).setY(1);
  scene.add(sunset);
  const lamp = new THREE.Group();
  lamp.position.set(0, 1.9, -0.04);
  scene.add(lamp);
  const spot = new THREE.SpotLight(0xffe4b8, 14, 4, 0.9, 0.7, 1.2);
  spot.castShadow = true;
  spot.shadow.mapSize.set(512, 512);
  spot.shadow.bias = -0.002;
  lamp.add(spot);
  const spotTarget = new THREE.Object3D();
  spotTarget.position.set(0, TABLE_Y, -0.04);
  scene.add(spotTarget);
  spot.target = spotTarget;

  // -- the sea all round: deep blue going violet, drifting slowly, fading into the haze,
  // long low swells rolling out across it (sea.js)
  const seaTex = canvasTex(32, 32, (ctx) => {
    ctx.fillStyle = '#28345e';
    ctx.fillRect(0, 0, 32, 32);
    const r = rng(11);
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = r() < 0.55 ? '#3c4a7c' : r() < 0.7 ? '#1c2648' : '#7a5a7a';
      ctx.fillRect(Math.floor(r() * 32), Math.floor(r() * 32), 2 + Math.floor(r() * 4), 1);
    }
  });
  seaTex.wrapS = seaTex.wrapT = THREE.RepeatWrapping;
  seaTex.repeat.set(70, 70);
  const seaMat = glow(0xffffff, { map: seaTex });
  const seaTime = seaMaterial(seaMat, -40);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(140, 140, 70, 70), seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, SEA_Y, -40);
  env.add(sea);
  onFrame((t) => {
    seaTime.value = t;
  });
  // the glow's path on the water: warm glints riding the swell, each on its own slow beat
  // and drifting a little to and fro, so the reflection breaks up and gathers again
  const sparkTex = canvasTex(5, 3, (ctx) => drawBits(ctx, ['..X..', 'XXXXX', '..X..'], 0, 0, 1, '#ffd0a0'));
  const sparks = [];
  const r = rng(5);
  for (let i = 0; i < 22; i++) {
    const u = 0.15 + r() * 0.85;
    const m = new THREE.SpriteMaterial({ map: sparkTex, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
    const s = new THREE.Sprite(m);
    s.position.copy(sunDir).multiplyScalar(6 + u * 34).add(new THREE.Vector3(3 + (r() - 0.5) * (0.5 + u * 3), 0, 0));
    s.position.y = SEA_Y + 0.02;
    s.scale.set(0.2 + u * 0.6, 0.12 + u * 0.3, 1);
    env.add(s);
    sparks.push({ s, m, at: s.position.clone(), drift: 0.3 + u * 1.2, phase: r() * 10, speed: 0.5 + r() * 0.7, k: 0.35 + u * 0.5 });
  }
  let afterglow = 1; // 0 once night has fallen (setLight)
  onFrame((t) => {
    for (const g of sparks) {
      g.m.opacity = Math.max(0, Math.sin(t * g.speed + g.phase)) * g.k * afterglow;
      const x = g.at.x + Math.sin(t * 0.07 + g.phase) * g.drift;
      g.s.position.set(x, SEA_Y + 0.02 + swellAt(x, g.at.z, t), g.at.z);
    }
  });
  // a low island on the horizon, a smooth silhouette drawn at the frame's own density (a
  // texel about a pixel out there), and a lighthouse standing on it. Its lamp burns
  // steady, breathing very slowly: no sweeping beam, nothing to pull the eye
  const LW = 128, LH = 13, TOWER = 78;
  const ridge = (x) => {
    const u = x / (LW - 1);
    const taper = Math.sin(Math.PI * Math.min(1, Math.max(0, (u - 0.04) / 0.92))) ** 0.6;
    // a long low shore, one rounded hill, and a small rise for the lighthouse
    return taper * (1.6 + Math.exp(-(((u - 0.38) / 0.17) ** 2)) * 4 + Math.exp(-(((u - 0.62) / 0.06) ** 2)) * 1.6 + Math.sin(u * 13) * 0.3);
  };
  const landTex = canvasTex(LW, LH, (ctx) => {
    ctx.fillStyle = '#5e4468';
    for (let x = 0; x < LW; x++) {
      const h = Math.round(ridge(x));
      if (h > 0) ctx.fillRect(x, LH - h, 1, h);
    }
    // the lighthouse: a slim tower on the rise, a lit lantern room on top
    const base = LH - Math.round(Math.min(ridge(TOWER), ridge(TOWER + 1)));
    ctx.fillStyle = '#4c3458';
    ctx.fillRect(TOWER, 3, 2, base - 3 + 1);
    ctx.fillRect(TOWER - 1, 2, 4, 1);
    ctx.fillStyle = '#ffd890';
    ctx.fillRect(TOWER, 1, 2, 1);
    ctx.fillStyle = '#4c3458';
    ctx.fillRect(TOWER, 0, 2, 1);
  });
  // well inside the sky dome (radius 50), or its facets cut the land off
  const LAND_W = 11.6, LAND_H = (LAND_W * LH) / LW;
  const land = new THREE.Mesh(new THREE.PlaneGeometry(LAND_W, LAND_H), new THREE.MeshBasicMaterial({ map: landTex, transparent: true, alphaTest: 0.5, fog: false }));
  land.position.set(13, SEA_Y + LAND_H / 2 - 0.04, -38.5);
  land.lookAt(sky.position.x, land.position.y, sky.position.z);
  env.add(land);
  const beaconMat = new THREE.SpriteMaterial({ map: halo, fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const beacon = new THREE.Sprite(beaconMat);
  beacon.position.set(LAND_W * ((TOWER + 1) / LW - 0.5), LAND_H * (0.5 - 1.5 / LH), 0.05);
  beacon.scale.setScalar(1.1);
  land.add(beacon);
  onFrame((t) => (beaconMat.opacity = 0.55 + Math.sin(t * 0.35) * 0.15));
  // one boat light out on the water
  const boat = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo, fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  boat.position.set(7, SEA_Y + 0.12, -32);
  boat.scale.setScalar(0.35);
  env.add(boat);
  onFrame((t) => (boat.position.y = SEA_Y + 0.12 + swellAt(7, -32, t)));
  // a few thin wisps of cloud low over the sea, lit rose from below, drifting so slowly
  // you only notice they have moved
  const wispTex = canvasTex(64, 6, (ctx) => {
    const r = rng(23);
    for (let row = 0; row < 6; row++) {
      const w = 64 - Math.abs(row - 2.5) * 16 - r() * 8;
      const x0 = Math.round((64 - w) / 2 + (r() - 0.5) * 8);
      ctx.fillStyle = row > 3 ? 'rgba(232,150,150,0.55)' : 'rgba(190,140,180,0.45)';
      ctx.fillRect(x0, row, Math.round(w), 1);
    }
  });
  const wisps = [
    [-0.55, 5.5, 9],
    [0.15, 8.5, 7],
    [0.62, 4, 11],
    [0.95, 9.5, 6],
  ].map(([az, el, w]) => {
    const m = new THREE.SpriteMaterial({ map: wispTex, transparent: true, depthWrite: false, fog: false, opacity: 0.55 });
    const s = new THREE.Sprite(m);
    s.scale.set(w, w * 0.09, 1);
    env.add(s);
    return { s, az, el: (el * Math.PI) / 180 };
  });
  onFrame((t) => {
    for (const c of wisps) {
      const az = c.az + t * 0.0012;
      c.s.position.set(Math.sin(az) * Math.cos(c.el), Math.sin(c.el), -Math.cos(az) * Math.cos(c.el)).multiplyScalar(44).add(sky.position);
    }
  });

  // -- the raft and what stands on it besides our table
  const props = buildRaftProps(stage, { SEA_Y, glow, env });

  // -- night, for a script that asks for it (web/play/director/); a page stays at dusk.
  // The afterglow gone, a blue-black sky, the sea and the island dark, and the raft's own
  // warm lights (the strings, the lantern, the lamp over the felt) carrying it: the table
  // still reads. Light, fog and the sky's colour only: what the night adds to the sky
  // (stars, boats' lights) follows it with onNight.
  const NIGHT_STOPS = [
    [0, [24, 28, 54]],
    [4, [18, 22, 46]],
    [12, [12, 15, 36]],
    [30, [8, 10, 26]],
    [90, [4, 5, 14]],
  ];
  const nightAt = (e) => {
    if (e <= 0) return NIGHT_STOPS[0][1];
    const i = NIGHT_STOPS.findIndex(([d]) => d >= e);
    const [d0, c0] = NIGHT_STOPS[i - 1];
    const [d1, c1] = NIGHT_STOPS[i];
    return c0.map((v, k) => v + (c1[k] - v) * ((e - d0) / (d1 - d0)));
  };
  const nightSky = new THREE.Mesh(sky.geometry, new THREE.MeshBasicMaterial({ map: null, side: THREE.BackSide, fog: false, transparent: true, opacity: 0, depthWrite: false }));
  nightSky.position.copy(sky.position);
  nightSky.scale.setScalar(0.995);
  nightSky.visible = false;
  env.add(nightSky);
  const lights = props.lights ?? {};
  const DUSK = {
    bg: new THREE.Color(roomOptions.background), fog: new THREE.Color(roomOptions.fog[0]), density: roomOptions.fog[1],
    hemiSky: hemi.color.clone(), hemiGround: hemi.groundColor.clone(), hemi: hemi.intensity, ambient: ambient.intensity,
    dusk: dusk.intensity, duskColor: dusk.color.clone(), sunset: sunset.intensity, spot: spot.intensity,
    strand: lights.strand?.intensity ?? 0, lantern: lights.lantern?.intensity ?? 0,
    sun: sun.material.opacity, wisp: wisps[0].s.material.opacity,
  };
  const NIGHT = {
    bg: new THREE.Color(0x0c1024), fog: new THREE.Color(0x0e1228), density: 0.034,
    hemiSky: new THREE.Color(0x5868b0), hemiGround: new THREE.Color(0x24180e), hemi: 0.55, ambient: 0.1,
    dusk: 0.32, duskColor: new THREE.Color(0x7a90e8), sunset: 0, spot: 17,
    strand: 3.2, lantern: 4.2,
    sun: 0, wisp: 0.1,
  };
  const white = new THREE.Color(0xffffff);
  const seaNight = new THREE.Color(0x46507a);
  const landNight = new THREE.Color(0x3a3450);
  let nightK = 0;
  function applyNight(n) {
    nightK = n;
    const mix = (key) => DUSK[key] + (NIGHT[key] - DUSK[key]) * n;
    const col = (key, out) => out.copy(DUSK[key]).lerp(NIGHT[key], n);
    col('bg', scene.background);
    col('fog', scene.fog.color);
    scene.fog.density = mix('density');
    col('hemiSky', hemi.color);
    col('hemiGround', hemi.groundColor);
    hemi.intensity = mix('hemi');
    ambient.intensity = mix('ambient');
    dusk.intensity = mix('dusk');
    col('duskColor', dusk.color);
    sunset.intensity = mix('sunset');
    spot.intensity = mix('spot');
    if (lights.strand) lights.strand.intensity = mix('strand');
    if (lights.lantern) lights.lantern.intensity = mix('lantern');
    sun.material.opacity = mix('sun');
    for (const c of wisps) c.s.material.opacity = mix('wisp');
    afterglow = 1 - n;
    seaMat.color.copy(white).lerp(seaNight, n);
    land.material.color.copy(white).lerp(landNight, n);
    nightSky.visible = n > 0;
    // painted the first time it's needed: a page that stays at dusk never pays for it
    if (n > 0 && !nightSky.material.map) {
      nightSky.material.map = paintSky(nightAt, 0);
      nightSky.material.needsUpdate = true;
    }
    nightSky.material.opacity = n;
    for (const fn of nightFns) fn(n);
  }
  // fn(n) now and whenever the light changes: n is 0 at dusk, 1 at night
  const nightFns = [];
  const onNight = (fn) => {
    nightFns.push(fn);
    fn(nightK);
  };
  // 'dusk' or 'night' (or 0 to 1 between them), crossfading over ms
  async function setLight(light, ms = 0, ease = (k) => k * k * (3 - 2 * k)) {
    const to = light === 'night' ? 1 : light === 'dusk' ? 0 : Number(light);
    if (!(to >= 0 && to <= 1)) throw new Error(`light: 'dusk', 'night' or 0 to 1, not ${light}`);
    const from = nightK;
    if (!ms) return applyNight(to);
    await stage.tween(ms, (k) => applyNight(from + (to - from) * ease(k)));
  }
  // and it rides the swell: the sea and sky rock against it, the view at half (sea.js)
  rockRaft(stage, env, new THREE.Vector3(0, 0, -0.5));

  // -- our table: glowing green felt in a plain teak rim with a gold line
  const goldMat = mat({ color: GOLD, emissive: 0x3a2008 });
  const cloth = (ctx, w, h) => {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x += 2) {
        const n = ((x * 7 + y * 13) % 5) - 2;
        ctx.fillStyle = `rgb(${34 + n},${126 + n * 2},${84 + n})`;
        ctx.fillRect(x, y, 2, 1);
      }
    ctx.fillStyle = '#f0c860';
    for (let a = 0; a < Math.PI * 2; a += 0.004) ctx.fillRect(Math.round(w / 2 + Math.cos(a) * (w / 2 - 10)), Math.round(h / 2 + Math.sin(a) * (h / 2 - 8)), 1, 1);
  };
  const feltTex = canvasTex(256, 170, (ctx, w, h) => (cloth(ctx, w, h), print(ctx, w, h)));
  // fn: a print, or { print } as buildRaft takes it
  function reprint(fn = idlePrint) {
    if (typeof fn !== 'function') fn = fn?.print ?? idlePrint;
    const { width: w, height: h } = feltTex.image;
    const ctx = feltTex.image.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    cloth(ctx, w, h);
    fn(ctx, w, h);
    feltTex.needsUpdate = true;
  }
  const feltGeo = new THREE.CircleGeometry(1, 48);
  feltGeo.rotateX(-Math.PI / 2);
  const felt = new THREE.Mesh(feltGeo, mat({ map: feltTex, emissive: 0x041a10 }));
  felt.scale.set(FELT.rx, 1, FELT.rz);
  felt.position.y = TABLE_Y;
  felt.receiveShadow = true;
  const bed = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.05, 48), mat({ color: 0x4a200c }));
  bed.scale.set(FELT.rx + 0.08, 1, FELT.rz + 0.08);
  bed.position.y = TABLE_Y - 0.04; // its top stays well under the felt: snapped vertices fight
  const railGeo = new THREE.TorusGeometry(1, 0.075, 6, 48);
  railGeo.rotateX(Math.PI / 2);
  const rail = new THREE.Mesh(railGeo, mat({ color: 0x8a5a34 }));
  rail.scale.set(FELT.rx + 0.06, 0.4, FELT.rz + 0.06);
  rail.position.y = TABLE_Y + 0.012;
  rail.castShadow = rail.receiveShadow = true;
  const brassGeo = new THREE.TorusGeometry(1, 0.007, 4, 48);
  brassGeo.rotateX(Math.PI / 2);
  const brass = new THREE.Mesh(brassGeo, goldMat);
  brass.scale.set(FELT.rx + 0.005, 1, FELT.rz + 0.005);
  brass.position.y = TABLE_Y + 0.006;
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, TABLE_Y - 0.05, 10), mat({ color: 0x3a1a0a }));
  pedestal.position.y = (TABLE_Y - 0.05) / 2;
  scene.add(felt, bed, rail, brass, pedestal);

  // sound: where the scene's sounds come from (the water at the raft's edge, the radio,
  // the float), for the ambience to place them; nothing plays them yet
  // the launch video's hooks (pv-raft.js), its boats kept clear of the island
  const { pv } = raftPv(stage, { env, SEA_Y, sky: sky.position, avoid: [[0.14, 0.5]], laptop: props.laptop });
  // screens: the laptop's glass, for a script's pictures (director/screens.js)
  onNight((n) => props.laptop.night(n));
  const screens = { laptop: props.laptop.glass };
  return { lamp, spot, felt, print: reprint, sound: props.sound, setLight, onNight, pv, screens };
}

// A glint on a pile now and then: a little four-point star that opens and closes.
const glintTex = canvasTex(7, 7, (ctx) => {
  drawBits(ctx, ['...X...', '...X...', '..XXX..', 'XXXXXXX', '..XXX..', '...X...', '...X...'], 0, 0, 1, '#fffbe8');
});
export function addGlints(stage, spots) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTex, transparent: true, depthTest: false, fog: false }));
  s.visible = false;
  stage.scene.add(s);
  let until = 0;
  let next = 2;
  stage.onFrame((t) => {
    if (t > next) {
      const full = spots().filter((p) => p.amount > 0);
      const p = full[Math.floor(Math.random() * full.length)];
      if (p) {
        s.position.copy(p.anchor.position).add(new THREE.Vector3((Math.random() - 0.5) * 0.03, p.height + 0.004, 0));
        s.visible = true;
        until = t + 0.45;
      }
      next = t + 1.6 + Math.random() * 2.5;
    }
    const k = Math.max(0, until - t) / 0.45;
    s.visible = k > 0;
    s.scale.setScalar(0.03 * Math.sin(k * Math.PI));
  });
}

// ---- tokens: the chips are what the two of you are spending ----
// One colour per size, so a pile reads at a glance: gold 1M, blue 100k, red 10k, bone 1k.
export const DENOMS = [
  { v: 1_000_000, face: '#e0b040', rim: '#7a5410', mark: '#fff2c0' },
  { v: 100_000, face: '#2f5fb0', rim: '#efe3c6', mark: '#bcd4ff' },
  { v: 10_000, face: '#b83038', rim: '#efe3c6', mark: '#ffc0c4' },
  { v: 1_000, face: '#e8e0cc', rim: '#4a6a8a', mark: '#4a6a8a' },
];
export const tokens = (n) => (n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `${+(n / 1000).toFixed(1)}k` : String(n));

const CHIP = { r: 0.024, h: 0.0075 };
const chipGeo = new THREE.CylinderGeometry(CHIP.r, CHIP.r, CHIP.h, 12);
const chipMats = new Map();
function chipMat(d) {
  if (chipMats.has(d.v)) return chipMats.get(d.v);
  // the top: a ring of edge spots and a token mark (a little diamond) in the middle
  const top = canvasTex(16, 16, (ctx) => {
    ctx.fillStyle = d.rim;
    ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = d.face;
    ctx.fillRect(2, 2, 12, 12);
    for (const [x, y] of [[7, 0], [7, 14], [0, 7], [14, 7]]) ctx.fillRect(x, y, 2, 2);
    ctx.fillStyle = d.mark;
    for (const [x, y, w] of [[7, 5, 2], [6, 6, 4], [5, 7, 6], [5, 8, 6], [6, 9, 4], [7, 10, 2]]) ctx.fillRect(x, y, w, 1);
  });
  const side = canvasTex(16, 2, (ctx) => {
    ctx.fillStyle = d.face;
    ctx.fillRect(0, 0, 16, 2);
    ctx.fillStyle = d.rim;
    for (let x = 0; x < 16; x += 4) ctx.fillRect(x, 0, 2, 2);
  });
  const m = [mat({ map: side }), mat({ map: top }), mat({ map: top })];
  chipMats.set(d.v, m);
  return m;
}

// [{ d, n }] largest first
export function breakDown(amount) {
  const out = [];
  let left = amount;
  for (const d of DENOMS) {
    const n = Math.floor(left / d.v);
    if (n) out.push({ d, n });
    left -= n * d.v;
  }
  return out;
}

const COL = 10; // chips per column before a new one starts
// A pile of chips worth `amount`: one column per size (more when tall), in a row along x.
export function chipPile(amount, { spread = 0.054 } = {}) {
  const g = new THREE.Group();
  let col = 0;
  for (const { d, n } of breakDown(amount)) {
    for (let start = 0; start < n; start += COL) {
      const x = col * spread;
      for (let i = start; i < Math.min(n, start + COL); i++) {
        const c = new THREE.Mesh(chipGeo, chipMat(d));
        c.position.set(x + Math.sin(i * 2.1) * 0.002, CHIP.h / 2 + (i - start) * CHIP.h, Math.cos(i * 1.7) * 0.002);
        c.castShadow = c.receiveShadow = true;
        g.add(c);
      }
      col++;
    }
  }
  // centred on its anchor
  for (const c of g.children) c.position.x -= ((col - 1) * spread) / 2;
  g.userData.width = col * spread;
  g.userData.height = Math.min(COL, Math.max(0, ...breakDown(amount).map((b) => b.n))) * CHIP.h;
  return g;
}

// A named place on the felt holding a pile; set() rebuilds it, fly() moves an amount
// from one pile to another as a little stack through the air.
export function chipSpot(stage, name, at) {
  const { scene } = stage;
  const anchor = new THREE.Group();
  anchor.position.copy(at);
  scene.add(anchor);
  let amount = 0;
  let pile = null;
  const spot = {
    anchor,
    name,
    get amount() {
      return amount;
    },
    get height() {
      return pile?.userData.height ?? 0;
    },
    set(n) {
      amount = n;
      if (pile) anchor.remove(pile);
      pile = chipPile(n);
      anchor.add(pile);
      if (name) {
        // its own materials, so hovering this pile doesn't light up every other one
        const own = new Map();
        pile.traverse((m) => m.isMesh && (m.material = m.material.map((x) => own.get(x) ?? own.set(x, snapped(x.clone())).get(x))));
        stage.pickable(name, anchor);
      }
    },
  };
  spot.set(0);
  return spot;
}

export async function flyChips(stage, from, to, n, ms = 420) {
  const { scene, tween, ease } = stage;
  if (n <= 0) return;
  from.set(Math.max(0, from.amount - n));
  const fly = chipPile(n);
  scene.add(fly);
  const a = from.anchor.position.clone();
  const b = to.anchor.position.clone();
  await tween(ms, (t) => {
    const e = ease(t);
    fly.position.lerpVectors(a, b, e);
    fly.position.y += Math.sin(e * Math.PI) * 0.09;
  });
  scene.remove(fly);
  to.set(to.amount + n);
}
