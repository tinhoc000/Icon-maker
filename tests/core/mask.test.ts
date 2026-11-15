import { describe, expect, test } from 'vitest';
import { applyMask, MaskHistory, paintDab, resizeMask } from '../../src/core/mask';
import { fullMask, px, solid } from './helpers';

describe('applyMask', () => {
  test('scales alpha by the mask and leaves colour alone', () => {
    const p = solid(2, 1, [10, 20, 30, 255]);
    const m = fullMask(2, 1);
    m.data[1] = 128;
    const out = applyMask(p, m);
    expect(px(out, 0, 0)).toEqual([10, 20, 30, 255]);
    expect(px(out, 1, 0)).toEqual([10, 20, 30, 128]);
  });
  test('combines with existing transparency', () => {
    const out = applyMask(solid(1, 1, [1, 2, 3, 100]), fullMask(1, 1, 128));
    expect(px(out, 0, 0)[3]).toBe(50);
  });
  test('does not change the input', () => {
    const p = solid(1, 1, [1, 2, 3, 255]);
    applyMask(p, fullMask(1, 1, 0));
    expect(px(p, 0, 0)[3]).toBe(255);
  });
  test('size mismatch throws', () => {
    expect(() => applyMask(solid(2, 2, [0, 0, 0, 255]), fullMask(3, 2))).toThrow();
  });
});

describe('resizeMask', () => {
  test('enlarging keeps the corner values', () => {
    const m = { width: 2, height: 2, data: new Uint8Array([0, 255, 255, 0]) };
    const out = resizeMask(m, 4, 4);
    expect(out.width).toBe(4);
    expect(out.height).toBe(4);
    expect(out.data[0]).toBe(0);
    expect(out.data[3]).toBe(255);
    expect(out.data[12]).toBe(255);
    expect(out.data[15]).toBe(0);
  });
  test('same size returns equal data', () => {
    const m = { width: 2, height: 1, data: new Uint8Array([7, 9]) };
    expect(Array.from(resizeMask(m, 2, 1).data)).toEqual([7, 9]);
  });
});

describe('paintDab', () => {
  test('erase clears the centre and leaves the corner', () => {
    const m = fullMask(20, 20);
    const r = paintDab(m, 10, 10, 5, 'erase');
    expect(m.data[10 * 20 + 10]).toBe(0);
    expect(m.data[0]).toBe(255);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.x + r.w).toBeLessThanOrEqual(20);
    expect(r.y + r.h).toBeLessThanOrEqual(20);
    expect(r.w).toBeGreaterThan(0);
  });
  test('restore brings the centre back', () => {
    const m = fullMask(20, 20);
    paintDab(m, 10, 10, 5, 'erase');
    paintDab(m, 10, 10, 5, 'restore');
    expect(m.data[10 * 20 + 10]).toBe(255);
  });
  test('a dab partly outside is clipped', () => {
    const m = fullMask(20, 20);
    const r = paintDab(m, 0, 0, 5, 'erase');
    expect(r).toEqual({ x: 0, y: 0, w: 6, h: 6 });
    expect(m.data[0]).toBe(0);
  });
  test('a dab wholly outside changes nothing and does not throw', () => {
    const m = fullMask(20, 20);
    const r = paintDab(m, -100, 500, 5, 'erase');
    expect(r.w * r.h).toBe(0);
    expect(m.data.every((v) => v === 255)).toBe(true);
  });
});

describe('MaskHistory', () => {
  function stroke(h: MaskHistory, m: ReturnType<typeof fullMask>, x: number, y: number) {
    const rec = h.beginStroke();
    paintDab(m, x, y, 6, 'erase', rec);
    h.endStroke();
  }
  test('undo restores the exact bytes, stroke by stroke', () => {
    const m = fullMask(200, 200);
    const start = m.data.slice();
    const h = new MaskHistory();
    stroke(h, m, 20, 20);
    const afterOne = m.data.slice();
    stroke(h, m, 100, 100);
    stroke(h, m, 22, 22);
    expect(h.undo(m)).toBe(true);
    expect(h.undo(m)).toBe(true);
    expect(Array.from(m.data)).toEqual(Array.from(afterOne));
    expect(h.undo(m)).toBe(true);
    expect(Array.from(m.data)).toEqual(Array.from(start));
    expect(h.canUndo()).toBe(false);
  });
  test('undo with nothing to undo returns false', () => {
    const h = new MaskHistory();
    expect(h.undo(fullMask(4, 4))).toBe(false);
    expect(h.canUndo()).toBe(false);
  });
  test('a stroke that changes nothing is not recorded', () => {
    const h = new MaskHistory();
    h.beginStroke();
    h.endStroke();
    expect(h.canUndo()).toBe(false);
  });
  test('past the limit the oldest stroke is dropped and later undos stay correct', () => {
    const m = fullMask(200, 200);
    const h = new MaskHistory(2);
    stroke(h, m, 20, 20);
    const afterOne = m.data.slice();
    stroke(h, m, 100, 100);
    stroke(h, m, 150, 150);
    expect(h.undo(m)).toBe(true);
    expect(h.undo(m)).toBe(true);
    expect(h.undo(m)).toBe(false);
    expect(Array.from(m.data)).toEqual(Array.from(afterOne));
  });
  test('a stroke inside one tile holds one tile of bytes, saved once', () => {
    const m = fullMask(200, 200);
    const h = new MaskHistory();
    const rec = h.beginStroke();
    paintDab(m, 30, 30, 4, 'erase', rec);
    paintDab(m, 32, 30, 4, 'erase', rec);
    h.endStroke();
    expect(h.bytesHeld()).toBe(64 * 64);
  });
});
