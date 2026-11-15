import { expect, test } from 'vitest';
import { smallMaskOf, smallOf } from '../../src/ui/dom';
import { fullMask, solid } from './helpers';

test('smallOf keeps a separate copy for each size asked for', () => {
  const p = solid(2000, 1000, [1, 2, 3, 255]);
  const thumb = smallOf(p, 176);
  const preview = smallOf(p, 1024);
  expect([thumb.width, thumb.height]).toEqual([176, 88]);
  expect([preview.width, preview.height]).toEqual([1024, 512]);
  expect(smallOf(p, 176)).toBe(thumb);
  expect(smallOf(p, 1024)).toBe(preview);
});

test('a picture already smaller than the size is returned as it is', () => {
  const p = solid(100, 50, [1, 2, 3, 255]);
  expect(smallOf(p, 1024)).toBe(p);
});

test('smallMaskOf matches the small picture and is cached per size', () => {
  const p = solid(2000, 1000, [1, 2, 3, 255]);
  const m = fullMask(2000, 1000, 9);
  const a = smallMaskOf(m, smallOf(p, 1024));
  const b = smallMaskOf(m, smallOf(p, 176));
  expect([a.width, a.height, b.width, b.height]).toEqual([1024, 512, 176, 88]);
  expect(smallMaskOf(m, smallOf(p, 1024))).toBe(a);
});
