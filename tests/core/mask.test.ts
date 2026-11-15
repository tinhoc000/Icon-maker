import { describe, expect, test } from 'vitest';
import { applyMask, compositeRegion, dabPoints, MaskHistory, paintDab, resizeMask } from '../../src/core/mask';
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

describe('dabPoints', () => {
  test('a press without movement is one dab at that spot', () => {
    expect(dabPoints({ x: 5, y: 5 }, { x: 5, y: 5 }, 10)).toEqual([{ x: 5, y: 5 }]);
  });
  test('points follow the line, end on the target, and are never more than a third of the radius apart', () => {
    const pts = dabPoints({ x: 0, y: 0 }, { x: 100, y: 0 }, 9);
    expect(pts[pts.length - 1]).toEqual({ x: 100, y: 0 });
    expect(pts[0]!.x).toBeGreaterThan(0); // the start was already painted by the previous event
    let last = 0;
    for (const p of pts) {
      expect(p.y).toBe(0);
      expect(p.x - last).toBeLessThanOrEqual(3 + 1e-9);
      last = p.x;
    }
  });
  test('a tiny radius still advances at least one pixel per dab', () => {
    const pts = dabPoints({ x: 0, y: 0 }, { x: 10, y: 0 }, 0.5);
    expect(pts.length).toBeLessThanOrEqual(10);
  });
});

describe('compositeRegion', () => {
  test('writes colour and mask-scaled alpha only inside the rectangle', () => {
    const base = solid(4, 1, [10, 20, 30, 200]);
    const mask = { width: 4, height: 1, data: new Uint8Array([255, 0, 128, 255]) };
    const out = new Uint8ClampedArray(16).fill(7);
    compositeRegion(base, mask, out, { x: 1, y: 0, w: 2, h: 1 });
    expect(Array.from(out)).toEqual([7, 7, 7, 7, 10, 20, 30, 0, 10, 20, 30, 100, 7, 7, 7, 7]);
  });
  test('a rectangle partly outside the picture is clipped, not an error', () => {
    const base = solid(2, 2, [1, 1, 1, 255]);
    const mask = fullMask(2, 2);
    const out = new Uint8ClampedArray(16);
    expect(() => compositeRegion(base, mask, out, { x: -3, y: -3, w: 10, h: 10 })).not.toThrow();
    expect(out[3]).toBe(255);
  });
});

describe('MaskHistory.cancelStroke', () => {
  test('puts back everything the stroke changed and records nothing', () => {
    const m = fullMask(200, 200);
    const start = m.data.slice();
    const h = new MaskHistory();
    const rec = h.beginStroke();
    paintDab(m, 30, 30, 8, 'erase', rec);
    paintDab(m, 150, 150, 8, 'erase', rec);
    expect(Array.from(m.data)).not.toEqual(Array.from(start));
    h.cancelStroke(m);
    expect(Array.from(m.data)).toEqual(Array.from(start));
    expect(h.canUndo()).toBe(false);
    expect(h.bytesHeld()).toBe(0);
  });
  test('earlier strokes stay undoable after a cancelled one', () => {
    const m = fullMask(200, 200);
    const h = new MaskHistory();
    const first = h.beginStroke();
    paintDab(m, 20, 20, 5, 'erase', first);
    h.endStroke();
    const afterFirst = m.data.slice();
    const second = h.beginStroke();
    paintDab(m, 100, 100, 5, 'erase', second);
    h.cancelStroke(m);
    expect(Array.from(m.data)).toEqual(Array.from(afterFirst));
    expect(h.canUndo()).toBe(true);
  });
  test('with no stroke in progress it does nothing', () => {
    const m = fullMask(10, 10);
    expect(() => new MaskHistory().cancelStroke(m)).not.toThrow();
  });
});
