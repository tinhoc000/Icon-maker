import type { Mask, Pixels } from '../../src/core/types';

export function solid(width: number, height: number, rgba: [number, number, number, number]): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set(rgba, i * 4);
  return { width, height, data };
}

export function fullMask(width: number, height: number, value = 255): Mask {
  return { width, height, data: new Uint8Array(width * height).fill(value) };
}

export function px(p: Pixels, x: number, y: number): number[] {
  const i = (y * p.width + x) * 4;
  return Array.from(p.data.slice(i, i + 4));
}

export function alpha(p: Pixels, x: number, y: number): number {
  return p.data[(y * p.width + x) * 4 + 3]!;
}

/** Paints an opaque block into a picture. */
export function block(p: Pixels, x: number, y: number, w: number, h: number, rgba: [number, number, number, number]): Pixels {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) p.data.set(rgba, (yy * p.width + xx) * 4);
  return p;
}
