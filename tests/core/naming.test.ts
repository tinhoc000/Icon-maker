import { describe, expect, test } from 'vitest';
import { dedupe, normalizeSettings, outputName, zipName } from '../../src/core/naming';
import { DEFAULT_SETTINGS, NothingLeftError, type Settings } from '../../src/core/types';

describe('outputName', () => {
  test('plain conversion keeps the stem and uses .png', () => {
    expect(outputName('IMG_1234.HEIC', 'plain')).toBe('IMG_1234.png');
  });
  test('cutout', () => {
    expect(outputName('IMG_1234.HEIC', 'cutout')).toBe('IMG_1234-cutout.png');
  });
  test('icon png carries the size', () => {
    expect(outputName('IMG_1234.HEIC', 'icon-png', 256)).toBe('IMG_1234-icon-256.png');
  });
  test('icon ico has no size', () => {
    expect(outputName('IMG_1234.HEIC', 'icon-ico')).toBe('IMG_1234-icon.ico');
  });
  test('icon svg carries the size', () => {
    expect(outputName('x.jpg', 'icon-svg', 64)).toBe('x-icon-64.svg');
  });
  test('only the last extension is removed', () => {
    expect(outputName('my.photo.v2.HEIC', 'plain')).toBe('my.photo.v2.png');
  });
  test('name without an extension', () => {
    expect(outputName('scan', 'plain')).toBe('scan.png');
  });
  test('characters Windows forbids become underscores', () => {
    expect(outputName('a<b>:c|d?.jpg', 'plain')).toBe('a_b__c_d_.png');
  });
  test('empty name falls back to image', () => {
    expect(outputName('', 'plain')).toBe('image.png');
  });
  test('all-illegal name falls back to image', () => {
    expect(outputName('???.jpg', 'plain')).toBe('image.png');
  });
  test('a name that is only an extension falls back to image', () => {
    expect(outputName('.heic', 'plain')).toBe('image.png');
  });
});

describe('dedupe', () => {
  test('repeats get -2, -3 before the extension', () => {
    expect(dedupe(['a.png', 'a.png', 'a.png', 'b.png'])).toEqual(['a.png', 'a-2.png', 'a-3.png', 'b.png']);
  });
  test('matching ignores case', () => {
    expect(dedupe(['A.png', 'a.png'])).toEqual(['A.png', 'a-2.png']);
  });
  test('a generated name never collides with a later original', () => {
    const out = dedupe(['a.png', 'a.png', 'a-2.png']);
    expect(new Set(out.map((n) => n.toLowerCase())).size).toBe(3);
  });
});

test('zipName uses the local date', () => {
  expect(zipName(new Date(2026, 10, 14))).toBe('icons-2026-11-14.zip');
});

describe('normalizeSettings', () => {
  const icon: Settings = { ...DEFAULT_SETTINGS, makeIcon: true };
  test('defaults are unchanged', () => {
    expect(normalizeSettings(DEFAULT_SETTINGS)).toEqual({
      removeBackground: false,
      makeIcon: false,
      size: 256,
      paddingPct: 8,
      formats: ['png'],
    });
  });
  test('size that is not a number becomes 256', () => {
    expect(normalizeSettings({ ...icon, size: NaN }).size).toBe(256);
  });
  test('size below the range clamps to 16', () => {
    expect(normalizeSettings({ ...icon, size: 0 }).size).toBe(16);
    expect(normalizeSettings({ ...icon, size: -5 }).size).toBe(16);
  });
  test('size above the range clamps to 2048', () => {
    expect(normalizeSettings({ ...icon, size: 5000 }).size).toBe(2048);
  });
  test('size is rounded', () => {
    expect(normalizeSettings({ ...icon, size: 100.7 }).size).toBe(101);
  });
  test('unknown padding becomes 8', () => {
    expect(normalizeSettings({ ...icon, paddingPct: 7 }).paddingPct).toBe(8);
    expect(normalizeSettings({ ...icon, paddingPct: 16 }).paddingPct).toBe(16);
  });
  test('ico and svg are dropped when Make icon is off', () => {
    expect(normalizeSettings({ ...DEFAULT_SETTINGS, formats: ['png', 'ico', 'svg'] }).formats).toEqual(['png']);
  });
  test('ico and svg are kept when Make icon is on', () => {
    expect(normalizeSettings({ ...icon, formats: ['svg', 'png', 'ico'] }).formats).toEqual(['png', 'ico', 'svg']);
  });
  test('empty formats becomes png', () => {
    expect(normalizeSettings({ ...icon, formats: [] }).formats).toEqual(['png']);
    expect(normalizeSettings({ ...DEFAULT_SETTINGS, formats: ['ico'] }).formats).toEqual(['png']);
  });
});

test('NothingLeftError carries the user-facing message', () => {
  expect(new NothingLeftError().message).toBe('Nothing left after background removal');
});
