// What every game's room shares: the low-resolution render pipeline that turns the
// scene into chunky pixels, the seated first-person camera, the opponent's seat, tweens,
// and picking things on the table. Each scene builds its room on top of this, and each
// game dresses the table, in layers that can be taken down again (see layer()) so one
// page can change games and scenes in place.
import * as THREE from 'three';
import { seatAvatar } from './avatar/index.js';

export { THREE };

// About this many rows in the internal frame, scaled up by a whole number of device
// pixels: 450 rows at 1600x900 on a 1.5x display, 540 at 1080p, 480 at 1440p. Fewer and
// small print (card ranks, the felt's markings, faces in the crowd) stops reading.
const TARGET_ROWS = 450;
const LEVELS = 16; // colour steps per channel after dithering

// ---- pixel textures --------------------------------------------------------

export function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Canvas text is always antialiased; snap its alpha so pixel-font glyphs stay crisp.
export function pixelText(text, { size = 12, color = '#000', pad = 0 } = {}) {
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = `${size}px FusionPixel`;
  const w = Math.ceil(probe.measureText(text).width) + pad * 2;
  const c = document.createElement('canvas');
  c.width = Math.max(1, w);
  c.height = size + pad * 2;
  const ctx = c.getContext('2d');
  ctx.font = `${size}px FusionPixel`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = color;
  ctx.fillText(text, pad, pad);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = img.data[i] > 110 ? 255 : 0;
  ctx.putImageData(img, 0, 0);
  return c;
}

// An emoji drawn tiny so it comes out as pixel art when scaled up.
export function pixelEmoji(emoji, size = 16) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.font = `${size - 2}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, size / 2, size / 2 + 1);
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = img.data[i] > 90 ? 255 : 0;
  ctx.putImageData(img, 0, 0);
  return c;
}

export function drawBits(ctx, bits, x, y, scale, color) {
  ctx.fillStyle = color;
  bits.forEach((row, j) => [...row].forEach((ch, i) => ch === 'X' && ctx.fillRect(x + i * scale, y + j * scale, scale, scale)));
}

export function noiseTex(w, h, base, spread, seed = 1) {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return canvasTex(w, h, (ctx) => {
    const [r, g, b] = base;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const n = (rand() - 0.5) * spread;
        ctx.fillStyle = `rgb(${r + n},${g + n},${b + n})`;
        ctx.fillRect(x, y, 1, 1);
      }
  });
}

// ---- vertex snapping: the PS1 wobble ---------------------------------------

const snapUniform = { value: new THREE.Vector2(240, 135) };
export function snapped(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSnap = snapUniform;
    shader.vertexShader = 'uniform vec2 uSnap;\n' + shader.vertexShader.replace(
      '#include <project_vertex>',
      '#include <project_vertex>\n  gl_Position.xy = floor(gl_Position.xy / gl_Position.w * uSnap + 0.5) / uSnap * gl_Position.w;',
    );
  };
  return material;
}
export const mat = (opts) => snapped(new THREE.MeshLambertMaterial(opts));

// ---- the post pass: nearest upscale, ordered dither, colour steps, vignette ----
// Optional per room: shadows broken up by coloured dots instead of going black (only
// where it is truly dark, and never inside the clear zone where the play happens), a
// burst of static, and a full-screen tint flash.

const POST_FRAG = /* glsl */ `
  uniform sampler2D tFrame;
  uniform vec2 uRes;
  uniform float uLevels;
  uniform vec3 uShadowCol;
  uniform float uShadowAmt;
  uniform vec3 uClear; // the clear zone: centre in uv, radius (0 = none)
  uniform float uVignette; // how dark the corners go (1 = not at all)
  uniform float uStatic;
  uniform vec3 uFlash;
  uniform float uTime;
  uniform float uLofi; // 0 to 1: softer contrast, lifted violet blacks, a light grain
  varying vec2 vUv;
  float bayer4(vec2 p) {
    int x = int(mod(p.x, 4.0));
    int y = int(mod(p.y, 4.0));
    int i = x + y * 4;
    int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
    return float(m[i]) / 16.0;
  }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    vec2 px = floor(vUv * uRes);
    if (uStatic > 0.0) {
      // rows tear sideways while the static is on
      float row = floor(px.y / 3.0);
      px.x += floor((hash(vec2(row, floor(uTime * 30.0))) - 0.5) * 24.0 * uStatic);
    }
    vec3 c = texture2D(tFrame, (px + 0.5) / uRes).rgb;
    c = pow(max(c, 0.0), vec3(1.0 / 2.2));
    vec2 q = vUv - 0.5;
    c *= mix(1.0, uVignette, smoothstep(0.25, 0.75, length(q * vec2(1.2, 1.0))));
    if (uShadowAmt > 0.0) {
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      float dark = 1.0 - smoothstep(0.006, 0.032, l);
      if (uClear.z > 0.0) dark *= smoothstep(uClear.z * 0.55, uClear.z, length((vUv - uClear.xy) * vec2(uRes.x / uRes.y, 1.0)));
      // sparse dots on a 2px grid, denser the darker it gets
      bool onGrid = mod(px.x + floor(px.y / 2.0), 2.0) < 1.0 && mod(px.y, 2.0) < 1.0;
      if (onGrid && bayer4(floor(px / 2.0)) < dark * uShadowAmt) c = uShadowCol;
    }
    if (uLofi > 0.0) {
      c = c * (1.0 - 0.13 * uLofi) + vec3(0.045, 0.035, 0.075) * uLofi;
      c += (hash(px + floor(uTime * 12.0)) - 0.5) * 0.045 * uLofi;
    }
    if (uStatic > 0.0) {
      float n = hash(px + floor(uTime * 60.0));
      c = mix(c, vec3(n), uStatic * 0.7);
    }
    c += uFlash;
    float d = (bayer4(px) - 0.47) * 0.5;
    c = floor(c * uLevels + 0.5 + d) / uLevels;
    gl_FragColor = vec4(c, 1.0);
  }
`;

// ---- the stage ---------------------------------------------------------------

// look: how far the camera follows the pointer; a table of small things to click wants less.
// vignette: how dark the corners go (a lit room wants less than a dark one). far: how far
// the camera sees; a room with a view out to the horizon wants more.
export function createStage(canvas, { background = 0x060403, fog = [0x070504, 0.32], look: lookOpt = 1, vignette = 0.5, far = 20 } = {}) {
  let lookAmt = lookOpt;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(background);
  scene.fog = new THREE.FogExp2(...fog);

  const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.05, far);
  const seat = new THREE.Vector3(0, 1.42, 0.95);
  const lookBase = new THREE.Vector3(0, 0.88, -0.45);

  const frame = new THREE.WebGLRenderTarget(16, 9, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  frame.texture.generateMipmaps = false;
  const post = new THREE.ShaderMaterial({
    uniforms: {
      tFrame: { value: frame.texture },
      uRes: { value: new THREE.Vector2(16, 9) },
      uLevels: { value: LEVELS },
      uShadowCol: { value: new THREE.Color(0, 0, 0) },
      uShadowAmt: { value: 0 },
      uClear: { value: new THREE.Vector3(0, 0, 0) },
      uVignette: { value: vignette },
      uStatic: { value: 0 },
      uFlash: { value: new THREE.Vector3() },
      uTime: { value: 0 },
      uLofi: { value: 0 },
    },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: POST_FRAG,
    depthTest: false,
  });
  const postScene = new THREE.Scene();
  postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post));
  const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // Whole-number upscaling in device pixels keeps every pixel the same size on any
  // display scaling; the canvas overhangs the window by less than one pixel.
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(window.innerWidth * dpr);
    const h = Math.round(window.innerHeight * dpr);
    const scale = Math.max(2, Math.round(h / TARGET_ROWS));
    const lowW = Math.ceil(w / scale);
    const lowH = Math.ceil(h / scale);
    renderer.setSize(lowW * scale, lowH * scale, false);
    canvas.style.width = `${(lowW * scale) / dpr}px`;
    canvas.style.height = `${(lowH * scale) / dpr}px`;
    frame.setSize(lowW, lowH);
    post.uniforms.uRes.value.set(lowW, lowH);
    snapUniform.value.set(lowW / 2, lowH / 2);
    camera.aspect = lowW / lowH;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  // ---- tweens and per-frame hooks ----
  const anims = new Set();
  const hooks = new Set();
  function tween(duration, step) {
    return new Promise((resolve) => anims.add({ t0: performance.now(), duration, step, resolve }));
  }
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  // returns how to stop
  const onFrame = (fn) => (hooks.add(fn), () => hooks.delete(fn));

  // ---- picking: named things on the table you can point at ----
  const raycaster = new THREE.Raycaster();
  const pickables = new Map(); // name -> object
  let hovered = null;
  function meshesOf(name) {
    const out = [];
    pickables.get(name)?.traverse((o) => o.isMesh && out.push(o));
    return out;
  }
  function pickable(name, obj) {
    pickables.set(name, obj);
  }
  function drop(name) {
    if (hovered === name) setHover(null);
    pickables.delete(name);
  }
  function pick(ndc) {
    raycaster.setFromCamera(ndc, camera);
    const owner = new Map();
    for (const name of pickables.keys()) for (const m of meshesOf(name)) owner.set(m, name);
    const hit = raycaster.intersectObjects([...owner.keys()], false)[0];
    return hit ? owner.get(hit.object) : null;
  }
  // Hover lights a thing up on top of whatever glow it has of its own.
  function glow(name, on) {
    for (const mesh of meshesOf(name)) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (!m.emissive) continue;
        m.userData.emissive ??= m.emissive.getHex();
        if (on) m.emissive.setHex(m.userData.emissive).add(new THREE.Color(0x2a3a30));
        else m.emissive.setHex(m.userData.emissive);
      }
    }
  }
  const hoverHooks = new Set();
  const onHover = (fn) => (hoverHooks.add(fn), () => hoverHooks.delete(fn));
  function setHover(name) {
    if (name === hovered) return;
    if (hovered) glow(hovered, false);
    if (name) glow(name, true);
    hovered = name;
    for (const fn of hoverHooks) fn(name);
  }

  function project(v) {
    const p = v.clone().project(camera);
    return { x: (p.x * 0.5 + 0.5) * window.innerWidth, y: (-p.y * 0.5 + 0.5) * window.innerHeight };
  }

  // ---- the camera: breathing, a gentle look-around, and shake on impact ----
  const look = { x: 0, y: 0, tx: 0, ty: 0 };
  // held: the camera stays where it is looking, e.g. while a menu pinned in the room is up
  let lookHeld = false;
  const holdLook = (on) => (lookHeld = on);
  // away: the pointer has left the page (on a stream, the streamer's mouse gone off to
  // other work), and the view drifts back to the middle, slowly
  let away = false;
  window.addEventListener('pointermove', (e) => {
    away = false;
    look.tx = (e.clientX / window.innerWidth - 0.5) * 2;
    look.ty = (e.clientY / window.innerHeight - 0.5) * 2;
  });
  document.documentElement.addEventListener('pointerleave', () => {
    away = true;
    look.tx = 0;
    look.ty = 0;
  });
  let shakeAmt = 0;
  const shake = (amount) => (shakeAmt = Math.max(shakeAmt, amount));
  // a scene can sway the view (the raft riding the swell): a turn about pivot and a shift,
  // on top of the seat and the look-around
  const ride = { q: new THREE.Quaternion(), p: new THREE.Vector3(), pivot: new THREE.Vector3() };
  // a director's camera (web/play/director/): moves the camera on from where the seat put it
  let rig = null;
  const setRig = (fn) => (rig = fn);

  function frameLoop(now) {
    const t = now / 1000;
    post.uniforms.uTime.value = t;
    if (!lookHeld) {
      const k = away ? 0.012 : 0.06;
      look.x += (look.tx - look.x) * k;
      look.y += (look.ty - look.y) * k;
    }
    const jolt = new THREE.Vector3((Math.random() - 0.5) * shakeAmt, (Math.random() - 0.5) * shakeAmt, 0);
    shakeAmt *= 0.88;
    camera.position.copy(seat).add(new THREE.Vector3(look.x * 0.04 * lookAmt, Math.sin(t * 1.4) * 0.004 - look.y * 0.02 * lookAmt, 0)).add(jolt);
    camera.lookAt(lookBase.clone().add(new THREE.Vector3(look.x * 0.3 * lookAmt, -look.y * 0.22 * lookAmt, 0)).add(jolt));
    if (ride.q.w < 1 || ride.p.lengthSq()) {
      camera.position.sub(ride.pivot).applyQuaternion(ride.q).add(ride.pivot).add(ride.p);
      camera.quaternion.premultiply(ride.q);
    }
    if (rig) {
      rig(camera, t);
      // a shake still lands on a directed camera: the same jolt, on top of where the rig put it
      if (jolt.lengthSq()) {
        camera.position.add(jolt);
        camera.rotateX(jolt.y * 0.5);
        camera.rotateY(jolt.x * 0.5);
      }
    }

    for (const fn of hooks) fn(t, now);
    for (const a of anims) {
      const k = Math.min(1, (now - a.t0) / a.duration);
      a.step(k);
      if (k >= 1) {
        anims.delete(a);
        a.resolve();
      }
    }

    renderer.setRenderTarget(frame);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(postScene, postCam);
    requestAnimationFrame(frameLoop);
  }
  requestAnimationFrame(frameLoop);

  // A scene's own sky, haze and post look; everything else in the post pass back to rest.
  function setRoom({ background: bg = 0x060403, fog: [fogColor, density] = [0x070504, 0.32], look: l = 1, vignette: vig = 0.5, far: f = 20 } = {}) {
    scene.background.setHex(bg);
    camera.far = f;
    camera.updateProjectionMatrix();
    scene.fog.color.setHex(fogColor);
    scene.fog.density = density;
    lookAmt = l;
    const u = post.uniforms;
    u.uVignette.value = vig;
    u.uShadowCol.value.setRGB(0, 0, 0);
    u.uShadowAmt.value = 0;
    u.uClear.value.set(0, 0, 0);
    u.uStatic.value = 0;
    u.uLofi.value = 0;
    u.uFlash.value.set(0, 0, 0);
    ride.q.identity();
    ride.p.set(0, 0, 0);
  }

  return { scene, camera, renderer, frame, post: post.uniforms, tween, ease, onFrame, pickable, drop, pick, setHover, onHover, project, shake, setRoom, holdLook, ride, setRig };
}

// ---- layers: a scene, or a game on the table, that can be taken down again ----------
// A layer looks like the stage to whatever builds into it, but keeps track: its objects
// go in a group of their own, and its frame hooks, hover hooks, pickables, HUD elements
// and sockets go when it does. HUD elements are tracked by what appeared in .hud, beside
// the game's name and on the page since the layer began, so a game needn't say what it
// added.
export function layer(stage) {
  const group = new THREE.Group();
  // things written for the whole scene (scene.fog.density = ...) still reach it
  Object.defineProperty(group, 'fog', { get: () => stage.scene.fog });
  Object.defineProperty(group, 'background', { get: () => stage.scene.background });
  stage.scene.add(group);
  const stops = [];
  const names = new Set();
  const hosts = () => ['.hud', '.brand', 'body'].flatMap((s) => [...(document.querySelector(s)?.children ?? [])]);
  const before = new Set(hosts());
  const L = {
    ...stage,
    scene: group,
    alive: true,
    onFrame: (fn) => {
      const stop = stage.onFrame((...a) => L.alive && fn(...a));
      stops.push(stop);
      return stop;
    },
    onHover: (fn) => {
      const stop = stage.onHover(fn);
      stops.push(stop);
      return stop;
    },
    pickable: (name, obj) => (names.add(name), stage.pickable(name, obj)),
    drop: (name) => (names.delete(name), stage.drop(name)),
    // something else to undo when the layer goes: a socket to close, a timer
    onDispose: (fn) => stops.push(fn),
    dispose() {
      if (!L.alive) return;
      L.alive = false;
      for (const stop of stops.splice(0).reverse()) stop();
      for (const name of names) stage.drop(name);
      stage.scene.remove(group);
      for (const el of hosts()) if (!before.has(el) && !el.dataset.keep) el.remove();
      group.traverse((o) => {
        o.geometry?.dispose();
        for (const m of [o.material].flat()) if (m) (m.map?.dispose(), m.dispose());
      });
    },
  };
  return L;
}

// ---- the opponent's seat: the agent's avatar, Clawd unless the page picks another ----
// Options are each room's hints; the avatar may ignore them. See web/play/avatar/.

export function addOpponent(stage, opts = {}) {
  return seatAvatar(stage, opts);
}
