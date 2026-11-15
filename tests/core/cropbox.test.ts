import { describe, expect, test } from 'vitest';
import { dragBox } from '../../src/core/cropbox';

const bounds = { w: 100, h: 80 };
const box = { x: 20, y: 20, w: 40, h: 30 };

describe('dragBox move', () => {
  test('shifts the box', () => {
    expect(dragBox(box, 'move', 10, -5, bounds)).toEqual({ x: 30, y: 15, w: 40, h: 30 });
  });
  test('stops at the right and bottom edges, keeping its size', () => {
    expect(dragBox(box, 'move', 500, 500, bounds)).toEqual({ x: 60, y: 50, w: 40, h: 30 });
  });
  test('stops at the left and top edges', () => {
    expect(dragBox(box, 'move', -500, -500, bounds)).toEqual({ x: 0, y: 0, w: 40, h: 30 });
  });
});

describe('dragBox resize', () => {
  test('east edge grows the width', () => {
    expect(dragBox(box, 'e', 15, 0, bounds)).toEqual({ x: 20, y: 20, w: 55, h: 30 });
  });
  test('east edge cannot pass the picture edge', () => {
    expect(dragBox(box, 'e', 500, 0, bounds)).toEqual({ x: 20, y: 20, w: 80, h: 30 });
  });
  test('west edge moves x and shrinks the width', () => {
    expect(dragBox(box, 'w', 5, 0, bounds)).toEqual({ x: 25, y: 20, w: 35, h: 30 });
  });
  test('an edge cannot cross the opposite one: the box stops at the minimum size', () => {
    expect(dragBox(box, 'e', -500, 0, bounds, 8)).toEqual({ x: 20, y: 20, w: 8, h: 30 });
    expect(dragBox(box, 'w', 500, 0, bounds, 8)).toEqual({ x: 52, y: 20, w: 8, h: 30 });
    expect(dragBox(box, 'n', 0, 500, bounds, 8)).toEqual({ x: 20, y: 42, w: 40, h: 8 });
  });
  test('corners move two edges', () => {
    expect(dragBox(box, 'nw', -5, -5, bounds)).toEqual({ x: 15, y: 15, w: 45, h: 35 });
    expect(dragBox(box, 'se', 5, 5, bounds)).toEqual({ x: 20, y: 20, w: 45, h: 35 });
    expect(dragBox(box, 'ne', 5, -5, bounds)).toEqual({ x: 20, y: 15, w: 45, h: 35 });
    expect(dragBox(box, 'sw', -5, 5, bounds)).toEqual({ x: 15, y: 20, w: 45, h: 35 });
  });
  test('corners cannot leave the picture', () => {
    expect(dragBox(box, 'nw', -500, -500, bounds)).toEqual({ x: 0, y: 0, w: 60, h: 50 });
    expect(dragBox(box, 'se', 500, 500, bounds)).toEqual({ x: 20, y: 20, w: 80, h: 60 });
  });
  test('a picture smaller than the minimum still gives a usable box', () => {
    const r = dragBox({ x: 0, y: 0, w: 3, h: 3 }, 'se', -10, -10, { w: 3, h: 3 }, 8);
    expect(r.w).toBeGreaterThan(0);
    expect(r.x + r.w).toBeLessThanOrEqual(3);
  });
});
