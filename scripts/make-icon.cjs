/* Generates apps/desktop/build/icon.ico — a multi-size Windows icon.
 * Pure Node (no deps): renders the logo into an RGBA buffer, downsamples,
 * and writes BMP-format ICO entries (256/128/64/48/32/24/16). */
const fs = require('node:fs');
const path = require('node:path');

const BASE = 1024;
const canvas = new Float64Array(BASE * BASE * 4); // RGBA float 0..255

function blend(i, r, g, b, a) {
  const alpha = a / 255;
  canvas[i] = canvas[i] * (1 - alpha) + r * alpha;
  canvas[i + 1] = canvas[i + 1] * (1 - alpha) + g * alpha;
  canvas[i + 2] = canvas[i + 2] * (1 - alpha) + b * alpha;
  canvas[i + 3] = canvas[i + 3] * (1 - alpha) + 255 * alpha;
}

function inRoundedRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.max(x0 + r, Math.min(x, x1 - r));
  const cy = Math.max(y0 + r, Math.min(y, y1 - r));
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r || (x >= x0 + r && x <= x1 - r) || (y >= y0 + r && y <= y1 - r);
}
function inCircle(x, y, cx, cy, r) { const dx = x - cx, dy = y - cy; return dx * dx + dy * dy <= r * r; }
function inTriangle(px, py, a, b, c) {
  const sign = (o, p, q) => (p[0] - o[0]) * (q[1] - o[1]) - (q[0] - o[0]) * (p[1] - o[1]);
  const d1 = sign(a, b, [px, py]), d2 = sign(b, c, [px, py]), d3 = sign(c, a, [px, py]);
  const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

// Render at 4x supersampling for smooth edges.
const SS = 2, N = BASE * SS;
const step = 1 / SS;
for (let sy = 0; sy < N; sy++) {
  for (let sx = 0; sx < N; sx++) {
    const x = sx * step + step / 2, y = sy * step + step / 2;
    let hit = null;
    if (inRoundedRect(x, y, 64, 64, 960, 960, 210)) {
      // Diagonal gradient: #3B82F6 -> #1D4ED8
      const t = Math.min(1, Math.max(0, (x + y - 128) / 1792));
      hit = [Math.round(59 + (29 - 59) * t), Math.round(130 + (78 - 130) * t), Math.round(246 + (216 - 246) * t), 255];
    }
    if (!hit && (inCircle(x, y, 512, 468, 205) || inTriangle(x, y, [398, 630], [540, 630], [430, 782]))) hit = [255, 255, 255, 255];
    if (hit && (inCircle(x, y, 412, 468, 34) || inCircle(x, y, 512, 468, 34) || inCircle(x, y, 612, 468, 34))) {
      hit = [37, 99, 235, 255];
    }
    if (hit) {
      const di = ((sy >> 1) * BASE + (sx >> 1)) * 4;
      blend(di, hit[0], hit[1], hit[2], hit[3]);
    }
  }
}

function sample(size, px, py) {
  const bx = Math.min(BASE - 1, Math.floor((px / size) * BASE));
  const by = Math.min(BASE - 1, Math.floor((py / size) * BASE));
  const i = (by * BASE + bx) * 4;
  return [Math.round(canvas[i]), Math.round(canvas[i + 1]), Math.round(canvas[i + 2]), Math.round(canvas[i + 3])];
}

/** ICO entry as 32-bit BMP (BITMAPINFOHEADER + bottom-up BGRA XOR + AND mask). */
function bmpEntry(size) {
  const w = size, h = size;
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(w, 4);
  header.writeInt32LE(h * 2, 8); // XOR + AND
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  const andStride = Math.ceil(w / 32) * 4;
  const xor = Buffer.alloc(w * h * 4);
  const and = Buffer.alloc(andStride * h);
  for (let row = 0; row < h; row++) {
    const y = h - 1 - row; // bottom-up
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = sample(size, x, y);
      const o = (row * w + x) * 4;
      xor[o] = b; xor[o + 1] = g; xor[o + 2] = r; xor[o + 3] = a;
      if (a === 0) and[row * andStride + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return Buffer.concat([header, xor, and]);
}

function buildIco(sizes) {
  const entries = sizes.map((s) => ({ size: s, data: bmpEntry(s) }));
  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(0, 0); dir.writeUInt16LE(1, 2); dir.writeUInt16LE(entries.length, 4);
  const headerSize = 6 + entries.length * 16;
  let offset = headerSize;
  const meta = [];
  for (const e of entries) {
    const m = Buffer.alloc(16);
    m.writeUInt8(e.size >= 256 ? 0 : e.size, 0);
    m.writeUInt8(e.size >= 256 ? 0 : e.size, 1);
    m.writeUInt8(0, 2); m.writeUInt8(0, 3);
    m.writeUInt16LE(1, 4); m.writeUInt16LE(32, 6);
    m.writeUInt32LE(e.data.length, 8);
    m.writeUInt32LE(offset, 12);
    meta.push(m);
    offset += e.data.length;
  }
  return Buffer.concat([dir, ...meta, ...entries.map((e) => e.data)]);
}

const out = path.resolve(__dirname, '../apps/desktop/build/icon.ico');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, buildIco([256, 128, 64, 48, 32, 24, 16]));
console.log('wrote', out, fs.statSync(out).size, 'bytes');