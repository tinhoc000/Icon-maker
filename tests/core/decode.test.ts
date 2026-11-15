import { describe, expect, test } from 'vitest';
import { fitWithin, sniffKind } from '../../src/core/decode';

const chars = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

function heicHead(brand = 'heic'): Uint8Array {
  const b = new Uint8Array(32);
  b.set([0, 0, 0, 24], 0);
  b.set(chars('ftyp'), 4);
  b.set(chars(brand), 8);
  return b;
}
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 0, 0, 0, 0, 0, 0, 0]);
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);
const WEBP = new Uint8Array([...chars('RIFF'), 1, 2, 3, 4, ...chars('WEBP')]);
const JUNK = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

describe('sniffKind', () => {
  test('recognises each kind from its bytes', () => {
    expect(sniffKind('a.heic', 'image/heic', heicHead())).toBe('heic');
    expect(sniffKind('a.jpg', 'image/jpeg', JPEG)).toBe('jpeg');
    expect(sniffKind('a.png', 'image/png', PNG)).toBe('png');
    expect(sniffKind('a.webp', 'image/webp', WEBP)).toBe('webp');
  });
  test('every HEIF brand counts as heic', () => {
    for (const brand of ['heic', 'heix', 'hevc', 'mif1', 'msf1', 'heif']) {
      expect(sniffKind('x', '', heicHead(brand))).toBe('heic');
    }
  });
  test('iPhone file with no MIME type and an uppercase extension', () => {
    expect(sniffKind('IMG_1.HEIC', '', heicHead())).toBe('heic');
  });
  test('bytes win over a lying extension', () => {
    expect(sniffKind('photo.jpg', 'image/jpeg', heicHead())).toBe('heic');
    expect(sniffKind('x.png', 'image/png', JPEG)).toBe('jpeg');
  });
  test('unrecognised bytes fall back to MIME type, then extension', () => {
    expect(sniffKind('x', 'image/heic', JUNK)).toBe('heic');
    expect(sniffKind('x', 'image/heif', JUNK)).toBe('heic');
    expect(sniffKind('x.JPEG', '', JUNK)).toBe('jpeg');
    expect(sniffKind('x.HEIF', '', JUNK)).toBe('heic');
  });
  test('something that is not a picture gives null', () => {
    expect(sniffKind('notes.txt', '', JUNK)).toBeNull();
    expect(sniffKind('notes.txt', 'text/plain', new Uint8Array(0))).toBeNull();
    expect(sniffKind('movie.mp4', 'video/mp4', heicHead('isom'))).toBeNull();
  });
});

describe('fitWithin', () => {
  test('scales down keeping the shape', () => {
    expect(fitWithin(8000, 6000, 4096)).toEqual({ w: 4096, h: 3072 });
  });
  test('never scales up', () => {
    expect(fitWithin(100, 50, 4096)).toEqual({ w: 100, h: 50 });
  });
  test('never goes below one pixel', () => {
    expect(fitWithin(1, 10000, 4096)).toEqual({ w: 1, h: 4096 });
  });
  test('a 12 MP iPhone photo is untouched', () => {
    expect(fitWithin(4032, 3024, 4096)).toEqual({ w: 4032, h: 3024 });
  });
});
