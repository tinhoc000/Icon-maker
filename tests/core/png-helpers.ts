import { unzlibSync } from 'fflate';

export const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];

function u32(b: Uint8Array, o: number): number {
  return ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;
}

/** Minimal PNG reader for tests: 8-bit RGBA, filter type 0 rows only. */
export function readPng(b: Uint8Array): { width: number; height: number; rgba: Uint8Array; chunks: string[] } {
  if (PNG_SIG.some((v, i) => b[i] !== v)) throw new Error('not a PNG');
  let o = 8;
  let width = 0;
  let height = 0;
  const idat: Uint8Array[] = [];
  const chunks: string[] = [];
  while (o < b.length) {
    const len = u32(b, o);
    const type = String.fromCharCode(...b.subarray(o + 4, o + 8));
    const body = b.subarray(o + 8, o + 8 + len);
    chunks.push(type);
    if (type === 'IHDR') {
      width = u32(body, 0);
      height = u32(body, 4);
      if (body[8] !== 8 || body[9] !== 6) throw new Error('not 8-bit RGBA');
    }
    if (type === 'IDAT') idat.push(body);
    o += 12 + len;
  }
  const joined = new Uint8Array(idat.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of idat) {
    joined.set(c, at);
    at += c.length;
  }
  const raw = unzlibSync(joined);
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    if (raw[y * (width * 4 + 1)] !== 0) throw new Error('unexpected filter');
    rgba.set(raw.subarray(y * (width * 4 + 1) + 1, (y + 1) * (width * 4 + 1)), y * width * 4);
  }
  return { width, height, rgba, chunks };
}
