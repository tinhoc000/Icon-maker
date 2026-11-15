import { deflateSync } from 'node:zlib';
import type { Page } from '@playwright/test';

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const t = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

type Rgba = [number, number, number, number];

export function pngBuffer(w: number, h: number, pixel: (x: number, y: number) => Rgba): Buffer {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(pixel(x, y), y * (w * 4 + 1) + 1 + x * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A 600 x 400 "photo": an orange box in the middle of a sky-blue background. */
export const GEAR_BOX = { x0: 150, x1: 450, y0: 100, y1: 300 };
export function gearPng(): Buffer {
  const { x0, x1, y0, y1 } = GEAR_BOX;
  return pngBuffer(600, 400, (x, y) =>
    x > x0 && x < x1 && y > y0 && y < y1 ? [230, 120, 30, 255] : [120, 180, 230, 255],
  );
}

export const gearFile = () => ({ name: 'gear.png', mimeType: 'image/png', buffer: gearPng() });

/** A JPEG made by the browser itself. */
export async function makeJpeg(page: Page, w: number, h: number): Promise<Buffer> {
  const dataUrl = await page.evaluate(
    ({ w, h }) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#2a7';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#e60';
      ctx.fillRect(0, 0, w / 2, h / 2);
      return c.toDataURL('image/jpeg');
    },
    { w, h },
  );
  return Buffer.from(dataUrl.split(',')[1]!, 'base64');
}

/** Adds an EXIF "orientation" tag right after the JPEG start marker, as phones do. */
export function withExifOrientation(jpeg: Buffer, orientation: number): Buffer {
  const tiff = Buffer.alloc(26);
  tiff.write('II', 0, 'latin1');
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4); // offset of the first directory
  tiff.writeUInt16LE(1, 8); // one entry
  tiff.writeUInt16LE(0x0112, 10); // Orientation
  tiff.writeUInt16LE(3, 12); // type SHORT
  tiff.writeUInt32LE(1, 14);
  tiff.writeUInt16LE(orientation, 18);
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const app1 = Buffer.alloc(4);
  app1.writeUInt16BE(0xffe1, 0);
  app1.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([jpeg.subarray(0, 2), app1, payload, jpeg.subarray(2)]);
}
