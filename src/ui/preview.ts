import { makeIcon } from '../core/icon';
import { applyMask } from '../core/mask';
import { NothingLeftError, type Pixels, type Settings } from '../core/types';
import { drawPixels, h, smallMaskOf, smallOf } from './dom';
import type { Picture, State } from './store';

interface Result {
  pixels: Pixels | null;
  note: string;
}

/** What the "after" side should show, computed on a reduced copy so it stays fast. */
export function renderAfter(pic: Picture, s: Settings): Result {
  if (!pic.original) return { pixels: null, note: pic.error ?? '' };
  const small = smallOf(pic.original);
  let base: Pixels = small;
  let note = '';
  if (s.removeBackground) {
    if (pic.mask) base = applyMask(small, smallMaskOf(pic.mask, small));
    else note = pic.status === 'failed' ? (pic.error ?? '') : 'Background removal pending…';
  }
  if (!s.makeIcon) return { pixels: base, note };
  const scale = small.width / pic.original.width;
  const crop = pic.crop
    ? { x: pic.crop.x * scale, y: pic.crop.y * scale, w: pic.crop.w * scale, h: pic.crop.h * scale }
    : null;
  try {
    return { pixels: makeIcon(base, { size: Math.min(s.size, 512), paddingPct: s.paddingPct, crop }), note };
  } catch (err) {
    if (err instanceof NothingLeftError) return { pixels: null, note: err.message };
    throw err;
  }
}

/** Before and after pictures side by side. */
export function createPreview() {
  const before = h<HTMLCanvasElement>('canvas', { class: 'preview-canvas', 'aria-label': 'Original picture' });
  const after = h<HTMLCanvasElement>('canvas', { class: 'preview-canvas', 'aria-label': 'Result' });
  const empty = h('p', { class: 'preview-empty' }, 'Your pictures will appear here.');
  const note = h('p', { class: 'preview-note', role: 'status' });
  const beforeBox = h('figure', { class: 'preview-box' }, h('figcaption', {}, 'Before (original)'), before);
  const afterBox = h(
    'figure',
    { class: 'preview-box checker' },
    h('figcaption', {}, 'After (result)'),
    after,
  );
  const grid = h('div', { class: 'preview-grid' }, beforeBox, afterBox);
  const root = h('section', { class: 'preview', 'aria-label': 'Preview' }, grid, empty, note);

  let timer: number | undefined;
  let drawnOriginal: Pixels | null = null;

  function paint(state: State) {
    const pic = state.pictures.find((p) => p.id === state.selectedId);
    grid.hidden = !pic;
    empty.hidden = !!pic;
    if (!pic) {
      drawnOriginal = null;
      note.textContent = '';
      return;
    }
    if (pic.original && drawnOriginal !== pic.original) {
      drawnOriginal = pic.original;
      drawPixels(before, smallOf(pic.original));
    }
    if (!pic.original) {
      drawnOriginal = null; // the canvas is about to be cleared, so the next picture must redraw it
      before.width = after.width = 1;
      note.textContent = pic.error ?? '';
      return;
    }
    const result = renderAfter(pic, state.settings);
    if (result.pixels) drawPixels(after, result.pixels);
    else after.getContext('2d')?.clearRect(0, 0, after.width, after.height);
    note.textContent = result.note;
  }

  function update(state: State) {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => paint(state), 120);
  }

  return { el: root, update };
}
