// A script's own picture on a named screen in the scene: 'crt' (the machine room's left
// CRT, roulette.js) or 'laptop' (a laptop on the raft; a stand-in until the scene has one).
//
// The screen interface, for whoever builds one: a scene (or its room) lists its screens as
//   screens: { <name>: mesh }
// where mesh is a THREE.Mesh with a PlaneGeometry (its width and height are the glass's, in
// metres; the glass faces the mesh's local +z) and a MeshBasicMaterial. The director swaps
// material.map for its own texture and puts it back after; while it shows its picture,
// mesh.userData.custom is true, and the owner should stop drawing into its own texture.
//
// Three kinds of content:
//   image: a picture file
//   draw:  (ctx, { t, w, h, lang }) => {}, a function drawing a canvas every frame
//          (t: ms since this content went up, on the scene's clock)
//   html:  a same-origin page in an iframe, sharing the page's clock and sound (its address
//          gets ?lang=<the page's language> unless it has one)
// An image or a canvas goes onto the glass as a texture, so in the room it is lit, hazed
// and dithered like the rest of it, and hidden by whatever stands in front (pixel: true keeps
// its texels square up close). The room is
// drawn at a few hundred rows, though, so as the glass fills the frame (a push-in) the same
// picture fades in on top of it, sharp: a copy laid exactly over the glass in page pixels
// (a CSS perspective transform from its four corners), with scanlines. An html page can't
// be a texture, so it is always that copy (nothing in the room covers it). crisp: 'auto'
// (default), true (the copy always), false (the texture only).
import { THREE, mat } from '../stage.js';
import { lang } from '../i18n.js';

// The CSS matrix3d that takes a w x h box onto the quad p0..p3 (top left, top right,
// bottom right, bottom left), each [x, y] in page pixels.
function quadMatrix(w, h, pts) {
  const src = [[0, 0], [w, 0], [w, h], [0, h]];
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = pts[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  // Gauss-Jordan with partial pivoting
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    [b[c], b[p]] = [b[p], b[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const [a, bb, c, d, e, f, g, hh] = b.map((x, i) => x / A[i][i]);
  return `matrix3d(${[a, d, 0, g, bb, e, 0, hh, 0, 0, 1, 0, c, f, 0, 1].join(',')})`;
}

const smooth = (a, b, x) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

// A laptop on the felt's left, lid up toward the seat, until the raft has its own.
function standInLaptop(stage) {
  const g = new THREE.Group();
  const shell = mat({ color: 0x2a2a30 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.014, 0.22), shell);
  base.position.y = 0.007;
  const lid = new THREE.Group();
  lid.position.set(0, 0.014, -0.11);
  lid.rotation.x = -0.28;
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.21, 0.01), shell);
  back.position.y = 0.105;
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.29, 0.18), new THREE.MeshBasicMaterial({ color: 0xffffff, map: null }));
  glass.material.color.setHex(0x05080a);
  glass.position.set(0, 0.105, 0.0055);
  lid.add(back, glass);
  g.add(base, lid);
  g.position.set(-0.6, 0.76, 0.02);
  g.rotation.y = 0.55;
  stage.scene.add(g);
  return glass;
}

// The screens this scene has, by name.
export function screensOf(stage, { room, scene, game }) {
  const found = { ...(scene?.screens ?? {}), ...(room?.screens ?? {}) };
  if ((game === 'blackjack' || game === 'yacht') && !found.laptop) {
    let mesh = null;
    // made only when a script first asks for it
    Object.defineProperty(found, 'laptop', { enumerable: true, get: () => (mesh ??= standInLaptop(stage)) });
  }
  return found;
}

export function createScreens(stage, screens, base = location.href) {
  const layer = document.createElement('div');
  layer.className = 'director-screens';
  Object.assign(layer.style, { position: 'fixed', inset: '0', overflow: 'hidden', pointerEvents: 'none' });
  document.querySelector('#view').after(layer);
  const up = new Map(); // name -> what is showing

  function hide(name) {
    const cur = up.get(name);
    if (!cur) return;
    cur.stop();
    cur.box.remove();
    const m = cur.mesh;
    m.material.map = cur.was.map;
    m.material.color.copy(cur.was.color);
    m.material.needsUpdate = true;
    m.userData.custom = false;
    up.delete(name);
  }

  function show(name, spec) {
    const mesh = screens[name];
    if (!mesh) throw new Error(`no screen '${name}' here; this scene has ${Object.keys(screens).join(', ') || 'none'}`);
    hide(name);
    const [w, h] = spec.size ?? [640, 480];
    const crisp = spec.html ? true : spec.crisp ?? 'auto';
    const kinds = ['image', 'draw', 'html'].filter((k) => spec[k]);
    if (kinds.length !== 1) throw new Error(`screen ${name}: one of image, draw or html`);

    // the copy laid over the glass: a w x h box
    const box = document.createElement('div');
    Object.assign(box.style, { position: 'absolute', left: '0', top: '0', width: `${w}px`, height: `${h}px`, transformOrigin: '0 0', opacity: '0', visibility: 'hidden', overflow: 'hidden', background: '#000' });
    layer.append(box);
    const canvas = document.createElement('canvas');
    if (spec.html) {
      const frame = document.createElement('iframe');
      // the page is told the film's language, unless its address says one
      const url = new URL(spec.html, base);
      if (!url.searchParams.has('lang')) url.searchParams.set('lang', lang);
      frame.src = url.href;
      Object.assign(frame.style, { width: `${w}px`, height: `${h}px`, border: '0', display: 'block', background: '#000' });
      box.append(frame);
      // the glass in the room goes dark under it
      canvas.width = canvas.height = 2;
    } else {
      canvas.width = w;
      canvas.height = h;
      Object.assign(canvas.style, { width: `${w}px`, height: `${h}px`, display: 'block' });
      box.append(canvas);
    }
    if (spec.scan !== false) {
      const lines = document.createElement('div');
      Object.assign(lines.style, { position: 'absolute', inset: '0', background: 'repeating-linear-gradient(to bottom, rgba(0,0,0,0) 0 2px, rgba(0,0,0,0.18) 2px 3px)', pointerEvents: 'none' });
      box.append(lines);
    }
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    // pixel art: each texel a hard square however close the camera comes
    if (spec.pixel) tex.magFilter = THREE.NearestFilter;
    const was = { map: mesh.material.map, color: mesh.material.color.clone() };
    mesh.userData.custom = true;
    mesh.material.map = tex;
    mesh.material.color.setHex(0xffffff);
    mesh.material.needsUpdate = true;

    let ready = !spec.image;
    if (spec.image) {
      const img = new Image();
      img.onload = () => {
        // cover the box, centred
        const k = Math.max(w / img.width, h / img.height);
        ctx.drawImage(img, (w - img.width * k) / 2, (h - img.height * k) / 2, img.width * k, img.height * k);
        tex.needsUpdate = true;
        ready = true;
      };
      img.onerror = () => console.error(`[director] screen ${name}: no image at ${img.src}`);
      img.src = new URL(spec.image, base).href;
      const copy = img.cloneNode();
      Object.assign(copy.style, { width: `${w}px`, height: `${h}px`, objectFit: 'cover', display: 'block' });
      canvas.replaceWith(copy);
    }
    const t0 = performance.now();
    const v = new THREE.Vector3();
    const { width: W, height: H } = mesh.geometry.parameters;
    const corners = [[-W / 2, H / 2], [W / 2, H / 2], [W / 2, -H / 2], [-W / 2, -H / 2]].map(([x, y]) => new THREE.Vector3(x, y, 0));
    const stop = stage.onFrame(() => {
      if (spec.draw) {
        spec.draw(ctx, { t: performance.now() - t0, w, h, lang });
        tex.needsUpdate = true;
      }
      // the glass's corners on the page, as this frame's camera sees them
      const cam = stage.camera;
      cam.updateMatrixWorld();
      mesh.updateWorldMatrix(true, false);
      let behind = false;
      const pts = corners.map((c) => {
        v.copy(c).applyMatrix4(mesh.matrixWorld);
        if (v.clone().applyMatrix4(cam.matrixWorldInverse).z > -cam.near) behind = true;
        v.project(cam);
        return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight];
      });
      // how much of the frame the glass covers, for crisp 'auto'
      const clip = pts.map(([x, y]) => [Math.min(innerWidth, Math.max(0, x)), Math.min(innerHeight, Math.max(0, y))]);
      let area = 0;
      for (let i = 0; i < 4; i++) area += clip[i][0] * clip[(i + 1) % 4][1] - clip[(i + 1) % 4][0] * clip[i][1];
      const cover = Math.abs(area) / 2 / (innerWidth * innerHeight);
      const alpha = !ready || behind ? 0 : crisp === true ? 1 : crisp === false ? 0 : smooth(spec.fade?.[0] ?? 0.3, spec.fade?.[1] ?? 0.75, cover);
      box.style.opacity = String(alpha);
      box.style.visibility = alpha > 0 ? 'visible' : 'hidden';
      if (alpha > 0) box.style.transform = quadMatrix(w, h, pts);
    });
    up.set(name, { mesh, box, stop, was });
  }

  return { show, hide };
}
