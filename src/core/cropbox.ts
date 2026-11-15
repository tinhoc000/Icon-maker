import type { Rect } from './types';

export type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/**
 * Applies a drag of (dx, dy) to a crop box. `move` slides the box (keeping its
 * size); the other handles move one or two edges. The box always stays inside
 * `bounds` and never gets smaller than `min` on a side (or the picture, if smaller).
 */
export function dragBox(
  box: Rect,
  handle: Handle,
  dx: number,
  dy: number,
  bounds: { w: number; h: number },
  min = 8,
): Rect {
  if (handle === 'move') {
    const x = Math.min(bounds.w - box.w, Math.max(0, box.x + dx));
    const y = Math.min(bounds.h - box.h, Math.max(0, box.y + dy));
    return { x, y, w: box.w, h: box.h };
  }
  const minW = Math.min(min, bounds.w);
  const minH = Math.min(min, bounds.h);
  let left = box.x;
  let top = box.y;
  let right = box.x + box.w;
  let bottom = box.y + box.h;
  if (handle.includes('w')) left = Math.min(right - minW, Math.max(0, left + dx));
  if (handle.includes('e')) right = Math.max(left + minW, Math.min(bounds.w, right + dx));
  if (handle.includes('n')) top = Math.min(bottom - minH, Math.max(0, top + dy));
  if (handle.includes('s')) bottom = Math.max(top + minH, Math.min(bounds.h, bottom + dy));
  return { x: left, y: top, w: right - left, h: bottom - top };
}
