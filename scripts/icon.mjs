// moyu icon: a small pixel fish hopping out of a terminal, trailing a splash of
// code. One 32px pixel map for every size; run this to rewrite web/icon.svg. The
// fish is built from shapes and shaded per pixel, upright, so its outline stays clean.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const N = 32;
const C = {
  bg: '#14202e', frame: '#2f6b58', bar: '#3f8a72', screen: '#0b1612', code: '#1f4a3c', green: '#7dffc8',
  red: '#ff5f57', amber: '#febc2e', lime: '#28c840',
  line: '#6e2a10', dark: '#d2601f', mid: '#ff8a3d', hi: '#ffab66', belly: '#ffdcb4', fin: '#ff7433', finDark: '#cf4f1a',
  eye: '#141a26', glint: '#ffffff', blush: '#ff6f61',
};
const g = Array.from({ length: N }, () => Array(N).fill(C.bg));
const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < N && y < N) g[y][x] = c; };
const rect = (x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, c); };

// ---- the terminal ----
rect(2, 19, 29, 29, C.frame);
rect(3, 22, 28, 28, C.screen);
rect(3, 20, 28, 21, C.bar);
for (const [x, c] of [[5, C.red], [7, C.amber], [9, C.lime]]) { set(x, 20, c); set(x, 21, c); }
rect(13, 24, 19, 24, C.code); rect(21, 24, 25, 24, C.code);
set(5, 24, C.green); set(6, 25, C.green); set(5, 26, C.green);
rect(8, 26, 11, 26, C.green);

// ---- the fish ----
const inEllipse = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const inPoly = (x, y, pts) => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const S = 1.0; // pixels per fish unit
const CX = 18.0, CY = 12.0; // the body's centre on the icon
// A fish, not a puffer: long and low, tapering toward the tail.
const RX = 8.6;
const halfHeight = (x) => (x >= 0 ? 4.6 * Math.sqrt(1 - (x / RX) ** 2) : 4.6 * Math.sqrt(1 - (x / RX) ** 2) * (1 - 0.3 * (-x / RX)));
const parts = [
  ['body', (x, y) => Math.abs(x) <= RX && Math.abs(y) <= halfHeight(x)],
  ['tail', (x, y) => inPoly(x, y, [[-7.4, -1.1], [-12.2, -4.8], [-10.8, 0], [-12.2, 4.8], [-7.4, 1.1]])],
  ['fin', (x, y) => inPoly(x, y, [[-4.2, -3.6], [-1.6, -6.4], [3.6, -4.3]])],
  ['pelvic', (x, y) => inPoly(x, y, [[0.2, 3.4], [-1.6, 5.4], [2.6, 4.0]])],
];
function at(px, py) {
  const x = (px + 0.5 - CX) / S, y = (py + 0.5 - CY) / S;
  for (const [k, f] of parts) if (f(x, y)) return { k, x, y };
  return null;
}
const F = Array.from({ length: N }, (_, y) => Array.from({ length: N }, (_, x) => at(x, y)));
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  const f = F[y][x];
  if (!f) continue;
  const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => !F[y + b]?.[x + a]);
  let c;
  if (f.k === 'body') {
    const t = f.y / Math.max(halfHeight(f.x), 1); // -1 top .. 1 belly
    c = t < -0.62 ? C.dark : t < 0.05 ? C.mid : t < 0.4 ? C.hi : C.belly;
    if (f.x > 2.4 && f.x < 3.4 && Math.abs(f.y) < 2.8) c = C.dark; // gill
  } else {
    c = f.k === 'tail' && Math.round(f.y) % 2 === 0 ? C.fin : C.finDark; // rays on the tail only
  }
  if (edge) c = f.k === 'body' && f.y > 2 ? C.dark : C.line;
  set(x, y, c);
}
// a shine on the back, an eye with a glint, a blush and a little mouth
set(Math.round(CX - 1), Math.round(CY - 3), C.hi); set(Math.round(CX), Math.round(CY - 3), C.hi);
const ex = Math.round(CX + 4.6), ey = Math.round(CY - 2.2);
rect(ex, ey, ex + 1, ey + 1, C.eye);
set(ex, ey, C.glint);
set(ex - 1, ey + 3, C.blush);
set(Math.round(CX + 8.2), Math.round(CY + 1), C.line);

// ---- the splash of code it hopped out of ----
for (const [x, y] of [[8, 18], [6, 17], [9, 16], [4, 15], [6, 14], [3, 12], [11, 18]]) if (g[y][x] === C.bg) set(x, y, C.green);
for (const x of [6, 7, 8, 9, 10]) set(x, 19, C.bg); // the frame's edge is broken where it came through
set(6, 19, C.green); set(10, 19, C.green);

function svg(radius) {
  let out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges"><clipPath id="moyu-r"><rect width="${N}" height="${N}" rx="${radius}"/></clipPath><g clip-path="url(#moyu-r)">`;
  g.forEach((row, y) => {
    for (let x = 0; x < N; ) {
      let e = x;
      while (e + 1 < N && row[e + 1] === row[x]) e++;
      out += `<rect x="${x}" y="${y}" width="${e - x + 1}" height="1" fill="${row[x]}"/>`;
      x = e + 1;
    }
  });
  return out + '</g></svg>\n';
}
// the same map as a PNG, s px a cell, its corners rounded as the SVG's (the plugin's icon)
function png(s, radius) {
  const W = N * s, R = radius * s;
  const raw = Buffer.alloc((W * 4 + 1) * W);
  for (let y = 0; y < W; y++) {
    raw[y * (W * 4 + 1)] = 0;
    for (let x = 0; x < W; x++) {
      const hex = g[Math.floor(y / s)][Math.floor(x / s)];
      const dx = Math.max(R - x - 0.5, x + 0.5 - (W - R), 0), dy = Math.max(R - y - 0.5, y + 0.5 - (W - R), 0);
      const a = Math.round(255 * Math.min(1, Math.max(0, R + 0.5 - Math.hypot(dx, dy))));
      raw.set([1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).concat(a), y * (W * 4 + 1) + 1 + x * 4);
    }
  }
  const crc = (b) => {
    let c = ~0;
    for (const v of b) {
      c ^= v;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const chunk = (type, data) => {
    const t = Buffer.concat([Buffer.from(type), data]);
    const len = Buffer.alloc(4), sum = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    sum.writeUInt32BE(crc(t));
    return Buffer.concat([len, t, sum]);
  };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(W, 0);
  head.writeUInt32BE(W, 4);
  head.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const out = process.argv[2] ?? new URL('../web/icon.svg', import.meta.url);
writeFileSync(out, svg(6));
console.log(`moyu icon written: ${out}`);
const outPng = process.argv[3] ?? new URL('../.claude-plugin/icon.png', import.meta.url);
writeFileSync(outPng, png(16, 6));
console.log(`moyu icon written: ${outPng} (512 px)`);
