import { describe, expect, test } from 'vitest';
import { clampCrop, makeIcon, resize, subjectBounds } from '../../src/core/icon';
import { NothingLeftError } from '../../src/core/types';
import { alpha, block, px, solid } from './helpers';

const RED: [number, number, number, number] = [255, 0, 0, 255];
const CLEAR: [number, number, number, number] = [0, 0, 0, 0];

describe('subjectBounds', () => {
  test('finds the box around visible pixels', () => {
    const p = block(solid(10, 10, CLEAR), 4, 5, 3, 2, RED);
    expect(subjectBounds(p)).toEqual({ x: 4, y: 5, w: 3, h: 2 });
  });
  test('fully transparent gives null', () => {
    expect(subjectBounds(solid(10, 10, CLEAR))).toBeNull();
  });
  test('nearly invisible pixels are ignored', () => {
    const p = block(solid(10, 10, [0, 0, 0, 5]), 2, 2, 1, 1, RED);
    expect(subjectBounds(p)).toEqual({ x: 2, y: 2, w: 1, h: 1 });
  });
});

describe('clampCrop', () => {
  test('clips to the picture', () => {
    expect(clampCrop({ x: -5, y: -5, w: 10, h: 10 }, 20, 20)).toEqual({ x: 0, y: 0, w: 5, h: 5 });
  });
  test('rounds to whole pixels', () => {
    expect(clampCrop({ x: 1.4, y: 2.6, w: 4.2, h: 3.8 }, 20, 20)).toEqual({ x: 1, y: 3, w: 5, h: 3 });
  });
  test('zero, negative or outside boxes give null', () => {
    expect(clampCrop({ x: 0, y: 0, w: 0, h: 10 }, 20, 20)).toBeNull();
    expect(clampCrop({ x: 5, y: 5, w: -3, h: 4 }, 20, 20)).toBeNull();
    expect(clampCrop({ x: 30, y: 30, w: 5, h: 5 }, 20, 20)).toBeNull();
    expect(clampCrop({ x: NaN, y: 0, w: 5, h: 5 }, 20, 20)).toBeNull();
  });
});

describe('resize', () => {
  test('shrinking a solid picture keeps its colour', () => {
    const out = resize(solid(4, 4, RED), 2, 2);
    expect(out.width).toBe(2);
    expect(px(out, 1, 1)).toEqual([255, 0, 0, 255]);
  });
  test('transparent neighbours do not darken the edge colour', () => {
    const p = block(solid(4, 2, CLEAR), 0, 0, 1, 2, RED); // one red column, three clear
    const out = resize(p, 2, 1);
    const [r, g, b, a] = px(out, 0, 0);
    expect([r, g, b]).toEqual([255, 0, 0]);
    expect(a).toBe(128);
  });
  test('enlarging keeps a solid picture solid', () => {
    const out = resize(solid(2, 2, RED), 5, 7);
    expect(out.width).toBe(5);
    expect(out.height).toBe(7);
    expect(px(out, 4, 6)).toEqual([255, 0, 0, 255]);
  });
});

describe('makeIcon', () => {
  test('fits a wide opaque picture into a padded square', () => {
    const out = makeIcon(solid(100, 50, RED), { size: 64, paddingPct: 8, crop: null });
    expect(out.width).toBe(64);
    expect(out.height).toBe(64);
    for (const [x, y] of [[0, 0], [63, 0], [0, 63], [63, 63], [4, 32], [59, 32], [32, 4]]) {
      expect(alpha(out, x!, y!)).toBe(0);
    }
    expect(px(out, 32, 32)).toEqual([255, 0, 0, 255]);
    expect(alpha(out, 5, 32)).toBe(255); // padding is round(64 * 0.08) = 5
    expect(alpha(out, 58, 32)).toBe(255);
  });
  test('uses the visible subject, not the whole picture', () => {
    const p = block(solid(100, 100, CLEAR), 10, 20, 40, 20, RED);
    const out = makeIcon(p, { size: 40, paddingPct: 0, crop: null });
    expect(alpha(out, 0, 20)).toBe(255); // touches left edge on the long axis
    expect(alpha(out, 39, 20)).toBe(255);
    expect(alpha(out, 20, 0)).toBe(0); // centred on the short axis
    expect(alpha(out, 20, 39)).toBe(0);
  });
  test('a manual crop overrides the subject box', () => {
    const p = block(solid(100, 100, [0, 0, 255, 255]), 0, 0, 10, 10, RED);
    const out = makeIcon(p, { size: 16, paddingPct: 0, crop: { x: 0, y: 0, w: 10, h: 10 } });
    expect(px(out, 8, 8)).toEqual([255, 0, 0, 255]);
  });
  test('an unusable crop falls back to automatic framing', () => {
    const p = solid(20, 20, RED);
    for (const crop of [{ x: 0, y: 0, w: 0, h: 10 }, { x: 50, y: 50, w: 5, h: 5 }, { x: 1, y: 1, w: -3, h: 2 }]) {
      const out = makeIcon(p, { size: 32, paddingPct: 0, crop });
      expect(px(out, 16, 16)).toEqual([255, 0, 0, 255]);
    }
  });
  test('a picture smaller than the icon is enlarged', () => {
    const out = makeIcon(solid(10, 10, RED), { size: 256, paddingPct: 8, crop: null });
    expect(out.width).toBe(256);
    expect(out.height).toBe(256);
    expect(px(out, 128, 128)).toEqual([255, 0, 0, 255]);
  });
  test('an extremely thin picture still shows up', () => {
    const out = makeIcon(solid(1, 500, RED), { size: 64, paddingPct: 8, crop: null });
    expect(out.width).toBe(64);
    let visible = 0;
    for (let x = 28; x < 36; x++) if (alpha(out, x, 32) > 0) visible++;
    expect(visible).toBeGreaterThanOrEqual(1);
  });
  test('nothing visible throws NothingLeftError', () => {
    expect(() => makeIcon(solid(10, 10, CLEAR), { size: 64, paddingPct: 8, crop: null })).toThrow(NothingLeftError);
  });
  test('a crop over an empty area also throws NothingLeftError', () => {
    const p = block(solid(20, 20, CLEAR), 0, 0, 2, 2, RED);
    expect(() => makeIcon(p, { size: 64, paddingPct: 8, crop: { x: 10, y: 10, w: 5, h: 5 } })).toThrow(NothingLeftError);
  });
});
