import { fitWithin } from '../core/decode';
import { resize } from '../core/icon';
import { resizeMask } from '../core/mask';
import type { Mask, Pixels } from '../core/types';

type Attrs = Record<string, string | number | boolean | undefined>;

/** Tiny element builder: h('button', { class: 'x', disabled: true }, 'Label'). */
export function h<T extends HTMLElement = HTMLElement>(tag: string, attrs: Attrs = {}, ...kids: (Node | string)[]): T {
  const e = document.createElement(tag) as T;
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') e.className = String(v);
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, String(v));
  }
  e.append(...kids);
  return e;
}

const smallPictures = new WeakMap<Pixels, Map<number, Pixels>>();
const smallMasks = new WeakMap<Mask, Map<string, Mask>>();

/** A copy of the picture that fits within `side` px, cached per size, for previews and thumbnails. */
export function smallOf(p: Pixels, side = 1024): Pixels {
  let bySide = smallPictures.get(p);
  if (!bySide) smallPictures.set(p, (bySide = new Map()));
  let small = bySide.get(side);
  if (!small) {
    const { w, h } = fitWithin(p.width, p.height, side);
    small = w === p.width && h === p.height ? p : resize(p, w, h);
    bySide.set(side, small);
  }
  return small;
}

/** The mask scaled to match a small copy of its picture (cached per size). */
export function smallMaskOf(m: Mask, small: Pixels): Mask {
  let bySize = smallMasks.get(m);
  if (!bySize) smallMasks.set(m, (bySize = new Map()));
  const key = small.width + 'x' + small.height;
  let out = bySize.get(key);
  if (!out) {
    out = resizeMask(m, small.width, small.height);
    bySize.set(key, out);
  }
  return out;
}

export function drawPixels(canvas: HTMLCanvasElement, p: Pixels): void {
  canvas.width = p.width;
  canvas.height = p.height;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(new ImageData(p.data as Uint8ClampedArray<ArrayBuffer>, p.width, p.height), 0, 0);
}
