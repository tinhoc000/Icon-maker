// One-off generator for the app icons in public/icons. Run: node scripts/make-app-icons.mjs
// Draws a blue rounded square with a white circle and a blue centre (a "cut-out" subject).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
mkdirSync(out, { recursive: true });

const BLUE = [37, 87, 214];
const WHITE = [255, 255, 255];

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) raw.set(pixel(x, y), y * (size * 4 + 1) + 1 + x * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Colour and coverage at a point (u, v in 0..1). */
function sample(u, v, { rounded, scale }) {
  const cx = u - 0.5;
  const cy = v - 0.5;
  if (rounded) {
    const r = 0.22;
    const qx = Math.abs(cx) - (0.5 - r);
    const qy = Math.abs(cy) - (0.5 - r);
    if (Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) > r) return null;
  }
  const d = Math.hypot(cx, cy) / scale;
  if (d < 0.12) return BLUE;
  if (d < 0.27) return WHITE;
  return BLUE;
}

function render(size, opts) {
  const ss = 4;
  return png(size, (x, y) => {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    for (let sy = 0; sy < ss; sy++) {
      for (let sx = 0; sx < ss; sx++) {
        const c = sample((x + (sx + 0.5) / ss) / size, (y + (sy + 0.5) / ss) / size, opts);
        if (!c) continue;
        r += c[0];
        g += c[1];
        b += c[2];
        a++;
      }
    }
    return a === 0 ? [0, 0, 0, 0] : [Math.round(r / a), Math.round(g / a), Math.round(b / a), Math.round((a / (ss * ss)) * 255)];
  });
}

const files = {
  'icon-180.png': render(180, { rounded: false, scale: 1 }), // iOS rounds the corners itself
  'icon-192.png': render(192, { rounded: true, scale: 1 }),
  'icon-512.png': render(512, { rounded: true, scale: 1 }),
  'icon-maskable-512.png': render(512, { rounded: false, scale: 0.8 }), // content inside the safe zone
};
for (const [name, data] of Object.entries(files)) writeFileSync(join(out, name), data);
console.log('wrote', Object.keys(files).join(', '));
