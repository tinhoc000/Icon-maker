import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, test } from 'vitest';
import { buildDownloadAll, renderOutputs, summarize, type PictureData } from '../../src/core/pipeline';
import { DEFAULT_SETTINGS, NothingLeftError, type Settings } from '../../src/core/types';
import { fullMask, solid } from './helpers';
import { readPng } from './png-helpers';

const RED: [number, number, number, number] = [255, 0, 0, 255];

function picture(name = 'IMG_1.HEIC', mask = fullMask(40, 20)): PictureData {
  return { name, original: solid(40, 20, RED), mask, crop: null };
}
const names = (files: { name: string }[]) => files.map((f) => f.name);

describe('summarize', () => {
  test('defaults with a HEIC', () => {
    expect(summarize(DEFAULT_SETTINGS, true)).toBe('This will: convert HEIC, save as PNG.');
  });
  test('defaults without a HEIC', () => {
    expect(summarize(DEFAULT_SETTINGS, false)).toBe('This will: convert, save as PNG.');
  });
  test('background removal and icon', () => {
    const s: Settings = { ...DEFAULT_SETTINGS, removeBackground: true, makeIcon: true };
    expect(summarize(s, true)).toBe('This will: convert HEIC, remove background, make a 256 px icon, save as PNG.');
  });
  test('background removal alone', () => {
    expect(summarize({ ...DEFAULT_SETTINGS, removeBackground: true }, false)).toBe(
      'This will: convert, remove background, save as PNG.',
    );
  });
  test('formats are listed in words', () => {
    const icon: Settings = { ...DEFAULT_SETTINGS, makeIcon: true, size: 64 };
    expect(summarize({ ...icon, formats: ['png', 'ico', 'svg'] }, false)).toBe(
      'This will: convert, make a 64 px icon, save as PNG, ICO and SVG.',
    );
    expect(summarize({ ...icon, formats: ['png', 'ico'] }, false)).toBe(
      'This will: convert, make a 64 px icon, save as PNG and ICO.',
    );
    expect(summarize({ ...icon, formats: ['png', 'svg'] }, false)).toBe(
      'This will: convert, make a 64 px icon, save as PNG and SVG.',
    );
  });
});

describe('renderOutputs', () => {
  test('defaults give one plain PNG at full size', () => {
    const out = renderOutputs(picture(), DEFAULT_SETTINGS);
    expect(names(out)).toEqual(['IMG_1.png']);
    expect(out[0]!.mime).toBe('image/png');
    const png = readPng(out[0]!.data);
    expect([png.width, png.height]).toEqual([40, 20]);
  });

  test('background removal gives a cutout with the mask applied', () => {
    const mask = fullMask(40, 20);
    mask.data[0] = 0;
    const out = renderOutputs(picture('a.jpg', mask), { ...DEFAULT_SETTINGS, removeBackground: true });
    expect(names(out)).toEqual(['a-cutout.png']);
    const png = readPng(out[0]!.data);
    expect(png.rgba[3]).toBe(0);
    expect(png.rgba[7]).toBe(255);
  });

  test('background removal without a mask is an error, not a silent plain copy', () => {
    const pic = { ...picture(), mask: null };
    expect(() => renderOutputs(pic, { ...DEFAULT_SETTINGS, removeBackground: true })).toThrow();
  });

  test('an unprocessed mask is ignored when background removal is off', () => {
    const out = renderOutputs(picture('a.jpg', fullMask(40, 20, 0)), DEFAULT_SETTINGS);
    expect(readPng(out[0]!.data).rgba[3]).toBe(255);
  });

  test('icon with all three formats', () => {
    const s: Settings = { ...DEFAULT_SETTINGS, makeIcon: true, formats: ['png', 'ico', 'svg'] };
    const out = renderOutputs(picture(), s);
    expect(names(out)).toEqual(['IMG_1-icon-256.png', 'IMG_1-icon.ico', 'IMG_1-icon-256.svg']);
    expect(out.map((f) => f.mime)).toEqual(['image/png', 'image/x-icon', 'image/svg+xml']);
    const png = readPng(out[0]!.data);
    expect([png.width, png.height]).toEqual([256, 256]);
    expect(new DataView(out[1]!.data.buffer, out[1]!.data.byteOffset).getUint16(4, true)).toBe(6);
    expect(strFromU8(out[2]!.data)).toContain('width="256"');
  });

  test('icon with only png gives one file at the chosen size', () => {
    const out = renderOutputs(picture(), { ...DEFAULT_SETTINGS, makeIcon: true, size: 64 });
    expect(names(out)).toEqual(['IMG_1-icon-64.png']);
    expect(readPng(out[0]!.data).width).toBe(64);
  });

  test('the ICO is built from a 256 px icon even when a smaller size is chosen', () => {
    const s: Settings = { ...DEFAULT_SETTINGS, makeIcon: true, size: 64, formats: ['ico'] };
    const out = renderOutputs(picture(), s);
    expect(names(out)).toEqual(['IMG_1-icon.ico']);
  });

  test('a fully transparent mask with Make icon throws NothingLeftError', () => {
    const s: Settings = { ...DEFAULT_SETTINGS, removeBackground: true, makeIcon: true };
    expect(() => renderOutputs(picture('a.jpg', fullMask(40, 20, 0)), s)).toThrow(NothingLeftError);
  });

  test('a manual crop reaches the icon', () => {
    const pic = picture();
    pic.original.data.set([0, 0, 255, 255], 0); // top-left pixel blue
    pic.crop = { x: 0, y: 0, w: 1, h: 1 };
    const out = renderOutputs(pic, { ...DEFAULT_SETTINGS, makeIcon: true, size: 16, paddingPct: 0 });
    expect(Array.from(readPng(out[0]!.data).rgba.slice((8 * 16 + 8) * 4, (8 * 16 + 8) * 4 + 4))).toEqual([0, 0, 255, 255]);
  });
});

describe('buildDownloadAll', () => {
  const date = new Date(2026, 10, 14);

  test('failed pictures are listed and the rest are zipped', () => {
    const s: Settings = { ...DEFAULT_SETTINGS, removeBackground: true, makeIcon: true };
    const pics = [picture('one.jpg'), picture('two.jpg', fullMask(40, 20, 0)), picture('three.jpg')];
    const { zip, name, failures } = buildDownloadAll(pics, s, date);
    expect(name).toBe('icons-2026-11-14.zip');
    expect(failures).toEqual([{ picture: 'two.jpg', reason: 'Nothing left after background removal' }]);
    const back = unzipSync(zip);
    expect(Object.keys(back).sort()).toEqual(['NOT-INCLUDED.txt', 'one-icon-256.png', 'three-icon-256.png']);
    expect(strFromU8(back['NOT-INCLUDED.txt']!)).toContain('two.jpg');
  });

  test('pictures with the same name get unique file names', () => {
    const { zip } = buildDownloadAll([picture('a.jpg'), picture('a.jpg')], DEFAULT_SETTINGS, date);
    expect(Object.keys(unzipSync(zip)).sort()).toEqual(['a-2.png', 'a.png']);
  });

  test('no pictures gives an empty ZIP and no failures', () => {
    const { zip, failures } = buildDownloadAll([], DEFAULT_SETTINGS, date);
    expect(failures).toEqual([]);
    expect(Object.keys(unzipSync(zip))).toEqual([]);
  });
});
