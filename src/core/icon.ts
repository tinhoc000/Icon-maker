import { NothingLeftError, type Pixels, type Rect } from './types';

/** Bounding box of pixels whose alpha is above the threshold, or null if none. */
export function subjectBounds(p: Pixels, alphaThreshold = 8, within?: Rect): Rect | null {
  const r = within ?? { x: 0, y: 0, w: p.width, h: p.height };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  for (let y = r.y; y < r.y + r.h; y++) {
    let i = (y * p.width + r.x) * 4 + 3;
    for (let x = r.x; x < r.x + r.w; x++, i += 4) {
      if (p.data[i]! > alphaThreshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** Rounds a crop box to whole pixels and clips it to the picture; null if nothing is left. */
export function clampCrop(crop: Rect, width: number, height: number): Rect | null {
  if (![crop.x, crop.y, crop.w, crop.h].every(Number.isFinite)) return null;
  if (crop.w <= 0 || crop.h <= 0) return null;
  const left = Math.max(0, Math.round(crop.x));
  const top = Math.max(0, Math.round(crop.y));
  const right = Math.min(width, Math.round(crop.x + crop.w));
  const bottom = Math.min(height, Math.round(crop.y + crop.h));
  if (right - left < 1 || bottom - top < 1) return null;
  return { x: left, y: top, w: right - left, h: bottom - top };
}

interface Taps {
  start: Int32Array;
  count: Int32Array;
  weights: Float32Array;
  maxTaps: number;
}

/** Sampling weights for one axis: area averaging when shrinking, bilinear when enlarging. */
function taps(src: number, dst: number): Taps {
  const scale = src / dst;
  const maxTaps = scale > 1 ? Math.ceil(scale) + 1 : 2;
  const start = new Int32Array(dst);
  const count = new Int32Array(dst);
  const weights = new Float32Array(dst * maxTaps);
  for (let i = 0; i < dst; i++) {
    if (scale > 1) {
      const a = i * scale;
      const b = Math.min(src, (i + 1) * scale);
      const first = Math.floor(a);
      const last = Math.min(src - 1, Math.ceil(b) - 1);
      start[i] = first;
      count[i] = last - first + 1;
      for (let s = first; s <= last; s++) {
        weights[i * maxTaps + (s - first)] = (Math.min(b, s + 1) - Math.max(a, s)) / (b - a);
      }
    } else {
      const c = Math.min(src - 1, Math.max(0, (i + 0.5) * scale - 0.5));
      const first = Math.min(Math.floor(c), Math.max(0, src - 2));
      const t = c - first;
      start[i] = first;
      if (src === 1) {
        count[i] = 1;
        weights[i * maxTaps] = 1;
      } else {
        count[i] = 2;
        weights[i * maxTaps] = 1 - t;
        weights[i * maxTaps + 1] = t;
      }
    }
  }
  return { start, count, weights, maxTaps };
}

/**
 * Resamples a region of a picture to width x height. Works on
 * alpha-premultiplied values so transparent pixels never tint the edges.
 */
export function resample(p: Pixels, region: Rect, width: number, height: number): Pixels {
  const tx = taps(region.w, width);
  const ty = taps(region.h, height);

  // Pass 1: horizontal, premultiplying as we read.
  const mid = new Float32Array(width * region.h * 4);
  for (let y = 0; y < region.h; y++) {
    const row = (region.y + y) * p.width + region.x;
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      const s0 = tx.start[x]!;
      for (let k = 0, n = tx.count[x]!; k < n; k++) {
        const w = tx.weights[x * tx.maxTaps + k]!;
        const i = (row + s0 + k) * 4;
        const wa = (w * p.data[i + 3]!) / 255;
        r += p.data[i]! * wa;
        g += p.data[i + 1]! * wa;
        b += p.data[i + 2]! * wa;
        a += wa;
      }
      const o = (y * width + x) * 4;
      mid[o] = r;
      mid[o + 1] = g;
      mid[o + 2] = b;
      mid[o + 3] = a;
    }
  }

  // Pass 2: vertical, un-premultiplying as we write.
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const s0 = ty.start[y]!;
    const n = ty.count[y]!;
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let k = 0; k < n; k++) {
        const w = ty.weights[y * ty.maxTaps + k]!;
        const i = ((s0 + k) * width + x) * 4;
        r += mid[i]! * w;
        g += mid[i + 1]! * w;
        b += mid[i + 2]! * w;
        a += mid[i + 3]! * w;
      }
      const o = (y * width + x) * 4;
      if (a > 1e-6) {
        data[o] = Math.round(r / a);
        data[o + 1] = Math.round(g / a);
        data[o + 2] = Math.round(b / a);
        data[o + 3] = Math.round(a * 255);
      }
    }
  }
  return { width, height, data };
}

export function resize(p: Pixels, width: number, height: number): Pixels {
  return resample(p, { x: 0, y: 0, w: p.width, h: p.height }, width, height);
}

export interface IconOptions {
  size: number;
  paddingPct: number;
  /** Manual crop in picture pixels; null (or an unusable box) means frame the subject automatically. */
  crop: Rect | null;
}

/** Centres the subject (or the manual crop) on a transparent square with padding. */
export function makeIcon(p: Pixels, opts: IconOptions): Pixels {
  const size = Math.max(1, Math.round(opts.size));
  const crop = opts.crop ? clampCrop(opts.crop, p.width, p.height) : null;
  const visible = subjectBounds(p, 8, crop ?? undefined);
  if (!visible) throw new NothingLeftError();
  const region = crop ?? visible;

  const pad = Math.min(Math.round((size * opts.paddingPct) / 100), Math.floor((size - 1) / 2));
  const inner = size - 2 * pad;
  const scale = Math.min(inner / region.w, inner / region.h);
  const w = Math.min(inner, Math.max(1, Math.round(region.w * scale)));
  const h = Math.min(inner, Math.max(1, Math.round(region.h * scale)));
  const scaled = resample(p, region, w, h);

  const out = new Uint8ClampedArray(size * size * 4);
  const ox = Math.round((size - w) / 2);
  const oy = Math.round((size - h) / 2);
  for (let y = 0; y < h; y++) {
    out.set(scaled.data.subarray(y * w * 4, (y + 1) * w * 4), ((oy + y) * size + ox) * 4);
  }
  return { width: size, height: size, data: out };
}
