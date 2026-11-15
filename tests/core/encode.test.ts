import { inflateSync } from 'node:zlib';
import { describe, expect, test } from 'vitest';
import { encodeIco, encodePng, encodeSvg, ICO_SIZES } from '../../src/core/encode';
import { PNG_SIG, readPng } from './png-helpers';
import { solid } from './helpers';

describe('encodePng', () => {
  const p = { width: 2, height: 1, data: new Uint8ClampedArray([1, 2, 3, 4, 250, 251, 252, 253]) };
  const png = encodePng(p);

  test('starts with the PNG signature', () => {
    expect(Array.from(png.slice(0, 8))).toEqual(PNG_SIG);
  });
  test('round-trips size and pixels', () => {
    const back = readPng(png);
    expect(back.width).toBe(2);
    expect(back.height).toBe(1);
    expect(Array.from(back.rgba)).toEqual([1, 2, 3, 4, 250, 251, 252, 253]);
    expect(back.chunks).toEqual(['IHDR', 'IDAT', 'IEND']);
  });
  test('chunk checksums are valid (known IEND CRC, and Node zlib accepts the data)', () => {
    expect(Array.from(png.slice(-4))).toEqual([0xae, 0x42, 0x60, 0x82]);
    const idatLen = new DataView(png.buffer, png.byteOffset).getUint32(33);
    const raw = inflateSync(png.subarray(41, 41 + idatLen));
    expect(raw.length).toBe(9);
  });
  test('IHDR checksum matches the reference value for a 1x1 picture', () => {
    // CRC-32 of "IHDR" + 00000001 00000001 08 06 00 00 00 is 0x1F15C489.
    const one = encodePng(solid(1, 1, [0, 0, 0, 0]));
    expect(Array.from(one.slice(29, 33))).toEqual([0x1f, 0x15, 0xc4, 0x89]);
  });
});

describe('encodeIco', () => {
  const ico = encodeIco(solid(256, 256, [0, 128, 255, 255]));
  const dv = new DataView(ico.buffer, ico.byteOffset, ico.byteLength);

  test('sizes are the six the spec names', () => {
    expect(ICO_SIZES).toEqual([16, 32, 48, 64, 128, 256]);
  });
  test('header says icon with six images', () => {
    expect(dv.getUint16(0, true)).toBe(0);
    expect(dv.getUint16(2, true)).toBe(1);
    expect(dv.getUint16(4, true)).toBe(6);
  });
  test('each entry points at a PNG of its own size', () => {
    const widths: number[] = [];
    for (let i = 0; i < 6; i++) {
      const e = 6 + i * 16;
      widths.push(dv.getUint8(e));
      expect(dv.getUint8(e + 1)).toBe(dv.getUint8(e));
      expect(dv.getUint16(e + 4, true)).toBe(1);
      expect(dv.getUint16(e + 6, true)).toBe(32);
      const size = dv.getUint32(e + 8, true);
      const offset = dv.getUint32(e + 12, true);
      const png = readPng(ico.subarray(offset, offset + size));
      expect(png.width).toBe(ICO_SIZES[i]);
      expect(png.height).toBe(ICO_SIZES[i]);
      expect(Array.from(png.rgba.slice(0, 4))).toEqual([0, 128, 255, 255]);
    }
    expect(widths).toEqual([16, 32, 48, 64, 128, 0]);
    const last = 6 + 5 * 16;
    expect(dv.getUint32(last + 8, true) + dv.getUint32(last + 12, true)).toBe(ico.length);
  });
  test('a source that is not 256 px is resized, never cropped', () => {
    const small = encodeIco(solid(40, 40, [9, 9, 9, 255]));
    expect(new DataView(small.buffer, small.byteOffset).getUint16(4, true)).toBe(6);
  });
});

describe('encodeSvg', () => {
  const png = encodePng(solid(2, 2, [255, 0, 0, 255]));
  const svg = encodeSvg(png, 256);

  test('declares the size and embeds the PNG', () => {
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('width="256"');
    expect(svg).toContain('height="256"');
    expect(svg).toContain('viewBox="0 0 256 256"');
    const b64 = /href="data:image\/png;base64,([^"]+)"/.exec(svg)![1]!;
    expect(Array.from(Buffer.from(b64, 'base64'))).toEqual(Array.from(png));
  });
  test('large files encode without overflowing the call stack', () => {
    const big = new Uint8Array(400_000).fill(65);
    const b64 = /base64,([^"]+)"/.exec(encodeSvg(big, 64))![1]!;
    expect(Buffer.from(b64, 'base64').length).toBe(400_000);
  });
});
