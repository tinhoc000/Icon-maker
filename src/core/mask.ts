import type { Mask, Pixels, Rect } from './types';

export const TILE = 64;

/** Receives each tile of a mask just before a stroke first changes it. */
export interface StrokeRecorder {
  touch(m: Mask, tileX: number, tileY: number): void;
}

/** Returns a new picture whose alpha is scaled by the mask. */
export function applyMask(p: Pixels, m: Mask): Pixels {
  if (p.width !== m.width || p.height !== m.height) {
    throw new Error(`Mask is ${m.width}x${m.height} but picture is ${p.width}x${p.height}`);
  }
  const data = new Uint8ClampedArray(p.data);
  for (let i = 0, n = m.data.length; i < n; i++) {
    const a = i * 4 + 3;
    data[a] = Math.round((data[a]! * m.data[i]!) / 255);
  }
  return { width: p.width, height: p.height, data };
}

/** Bilinear resize of a mask. */
export function resizeMask(m: Mask, width: number, height: number): Mask {
  if (m.width === width && m.height === height) return { width, height, data: m.data.slice() };
  const out = new Uint8Array(width * height);
  const sx = m.width / width;
  const sy = m.height / height;
  for (let y = 0; y < height; y++) {
    const fy = Math.min(m.height - 1, Math.max(0, (y + 0.5) * sy - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(m.height - 1, y0 + 1);
    const wy = fy - y0;
    for (let x = 0; x < width; x++) {
      const fx = Math.min(m.width - 1, Math.max(0, (x + 0.5) * sx - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(m.width - 1, x0 + 1);
      const wx = fx - x0;
      const top = m.data[y0 * m.width + x0]! * (1 - wx) + m.data[y0 * m.width + x1]! * wx;
      const bottom = m.data[y1 * m.width + x0]! * (1 - wx) + m.data[y1 * m.width + x1]! * wx;
      out[y * width + x] = Math.round(top * (1 - wy) + bottom * wy);
    }
  }
  return { width, height, data: out };
}

/**
 * Paints one round brush dab with a 1 px soft edge. Erase lowers the mask
 * towards 0, restore raises it towards 255. Returns the affected rectangle,
 * clipped to the mask (zero-sized when the dab misses the mask).
 */
export function paintDab(
  m: Mask,
  cx: number,
  cy: number,
  radius: number,
  mode: 'erase' | 'restore',
  rec?: StrokeRecorder,
): Rect {
  const reach = Math.max(0, radius) + 0.5;
  const x0 = Math.max(0, Math.floor(cx - reach) + 1);
  const y0 = Math.max(0, Math.floor(cy - reach) + 1);
  const x1 = Math.min(m.width - 1, Math.ceil(cx + reach) - 1);
  const y1 = Math.min(m.height - 1, Math.ceil(cy + reach) - 1);
  if (x1 < x0 || y1 < y0) return { x: 0, y: 0, w: 0, h: 0 };

  if (rec) {
    for (let ty = Math.floor(y0 / TILE); ty <= Math.floor(y1 / TILE); ty++) {
      for (let tx = Math.floor(x0 / TILE); tx <= Math.floor(x1 / TILE); tx++) rec.touch(m, tx, ty);
    }
  }

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const cover = Math.min(1, Math.max(0, reach - Math.hypot(x - cx, y - cy)));
      if (cover <= 0) continue;
      const i = y * m.width + x;
      if (mode === 'erase') m.data[i] = Math.min(m.data[i]!, Math.round(255 * (1 - cover)));
      else m.data[i] = Math.max(m.data[i]!, Math.round(255 * cover));
    }
  }
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

type Stroke = Map<number, Uint8Array>;

function restoreTiles(m: Mask, stroke: Stroke): void {
  const tilesAcross = Math.ceil(m.width / TILE);
  for (const [key, saved] of stroke) {
    const x0 = (key % tilesAcross) * TILE;
    const y0 = Math.floor(key / tilesAcross) * TILE;
    const w = Math.min(TILE, m.width - x0);
    const h = saved.length / w;
    for (let y = 0; y < h; y++) m.data.set(saved.subarray(y * w, (y + 1) * w), (y0 + y) * m.width + x0);
  }
}

/**
 * Undo history for mask edits. Each stroke keeps only the original bytes of
 * the 64x64 tiles it touched, so memory stays small on phones.
 */
export class MaskHistory {
  private strokes: Stroke[] = [];
  private current: Stroke | null = null;

  constructor(private limit = 30) {}

  beginStroke(): StrokeRecorder {
    const stroke: Stroke = new Map();
    this.current = stroke;
    return {
      touch: (m, tileX, tileY) => {
        const tilesAcross = Math.ceil(m.width / TILE);
        const key = tileY * tilesAcross + tileX;
        if (stroke.has(key)) return;
        const x0 = tileX * TILE;
        const y0 = tileY * TILE;
        const w = Math.min(TILE, m.width - x0);
        const h = Math.min(TILE, m.height - y0);
        const saved = new Uint8Array(w * h);
        for (let y = 0; y < h; y++) {
          saved.set(m.data.subarray((y0 + y) * m.width + x0, (y0 + y) * m.width + x0 + w), y * w);
        }
        stroke.set(key, saved);
      },
    };
  }

  endStroke(): void {
    const stroke = this.current;
    this.current = null;
    if (!stroke || stroke.size === 0) return;
    this.strokes.push(stroke);
    if (this.strokes.length > this.limit) this.strokes.shift();
  }

  canUndo(): boolean {
    return this.strokes.length > 0;
  }

  /** Puts back the tiles changed by the most recent stroke. */
  undo(m: Mask): boolean {
    const stroke = this.strokes.pop();
    if (!stroke) return false;
    restoreTiles(m, stroke);
    return true;
  }

  /** Throws away the stroke in progress (for example when a second finger lands to pinch), undoing its changes. */
  cancelStroke(m: Mask): void {
    const stroke = this.current;
    this.current = null;
    if (stroke) restoreTiles(m, stroke);
  }

  bytesHeld(): number {
    let total = 0;
    for (const s of this.strokes) for (const t of s.values()) total += t.length;
    return total;
  }
}

/**
 * Brush positions from `from` (already painted) to `to`, close enough together
 * (a third of the radius, at least 1 px) that a fast drag leaves no gaps.
 * A press without movement gives a single dab.
 */
export function dabPoints(
  from: { x: number; y: number },
  to: { x: number; y: number },
  radius: number,
): { x: number; y: number }[] {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  if (dist === 0) return [{ x: to.x, y: to.y }];
  const spacing = Math.max(1, radius / 3);
  const steps = Math.ceil(dist / spacing);
  const points: { x: number; y: number }[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    points.push({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
  }
  return points;
}

/**
 * Writes the picture seen through the mask (RGB from `base`, alpha scaled by
 * the mask) into `out` for one rectangle. `out` is RGBA, the same size as `base`.
 */
export function compositeRegion(base: Pixels, mask: Mask, out: Uint8ClampedArray, rect: Rect): void {
  const x0 = Math.max(0, rect.x);
  const y0 = Math.max(0, rect.y);
  const x1 = Math.min(base.width, rect.x + rect.w);
  const y1 = Math.min(base.height, rect.y + rect.h);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * base.width + x;
      const o = i * 4;
      out[o] = base.data[o]!;
      out[o + 1] = base.data[o + 1]!;
      out[o + 2] = base.data[o + 2]!;
      out[o + 3] = Math.round((base.data[o + 3]! * mask.data[i]!) / 255);
    }
  }
}
