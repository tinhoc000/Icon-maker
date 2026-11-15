import { zlibSync } from 'fflate';
import { resize } from './icon';
import type { Pixels } from './types';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array, start: number, end: number): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

/** Encodes an 8-bit RGBA PNG. */
export function encodePng(p: Pixels): Uint8Array {
  const stride = p.width * 4;
  const raw = new Uint8Array((stride + 1) * p.height);
  for (let y = 0; y < p.height; y++) {
    // Filter byte 0 (none) is already there; copy the row after it.
    raw.set(p.data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const idat = zlibSync(raw, { level: 6 });

  const out = new Uint8Array(8 + 25 + 12 + idat.length + 12);
  const dv = new DataView(out.buffer);
  out.set(PNG_SIGNATURE, 0);
  let o = 8;
  const chunk = (type: string, body: Uint8Array) => {
    dv.setUint32(o, body.length);
    for (let i = 0; i < 4; i++) out[o + 4 + i] = type.charCodeAt(i);
    out.set(body, o + 8);
    dv.setUint32(o + 8 + body.length, crc32(out, o + 4, o + 8 + body.length));
    o += 12 + body.length;
  };

  const ihdr = new Uint8Array(13);
  const hv = new DataView(ihdr.buffer);
  hv.setUint32(0, p.width);
  hv.setUint32(4, p.height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  chunk('IHDR', ihdr);
  chunk('IDAT', idat);
  chunk('IEND', new Uint8Array(0));
  return out;
}

export const ICO_SIZES = [16, 32, 48, 64, 128, 256] as const;

/** Writes a Windows .ico holding the picture at each of ICO_SIZES, stored as PNG. */
export function encodeIco(source: Pixels): Uint8Array {
  const images = ICO_SIZES.map((size) =>
    encodePng(source.width === size && source.height === size ? source : resize(source, size, size)),
  );
  const headerSize = 6 + 16 * images.length;
  const out = new Uint8Array(headerSize + images.reduce((n, img) => n + img.length, 0));
  const dv = new DataView(out.buffer);
  dv.setUint16(2, 1, true); // type: icon
  dv.setUint16(4, images.length, true);
  let offset = headerSize;
  images.forEach((img, i) => {
    const e = 6 + i * 16;
    const size = ICO_SIZES[i]!;
    out[e] = size === 256 ? 0 : size;
    out[e + 1] = size === 256 ? 0 : size;
    dv.setUint16(e + 4, 1, true); // colour planes
    dv.setUint16(e + 6, 32, true); // bits per pixel
    dv.setUint32(e + 8, img.length, true);
    dv.setUint32(e + 12, offset, true);
    out.set(img, offset);
    offset += img.length;
  });
  return out;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** Wraps a PNG in an SVG file. The picture stays a bitmap; it is not traced. */
export function encodeSvg(png: Uint8Array, size: number): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">\n` +
    `  <image width="${size}" height="${size}" href="data:image/png;base64,${toBase64(png)}"/>\n` +
    `</svg>\n`
  );
}
