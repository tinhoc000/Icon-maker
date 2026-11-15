import { dragBox, type Handle } from '../core/cropbox';
import { subjectBounds } from '../core/icon';
import { applyMask } from '../core/mask';
import type { Pixels, Rect, Settings } from '../core/types';
import { drawPixels, h, smallMaskOf, smallOf } from './dom';
import type { Picture } from './store';

const DISPLAY_SIDE = 1600;
const MIN_SIDE = 8;
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** The picture as the icon will see it (background removed if that is on), at display size. */
function displayBase(pic: Picture, s: Settings): { base: Pixels; k: number } {
  const original = pic.original!;
  const small = smallOf(original, DISPLAY_SIDE);
  const base = s.removeBackground && pic.mask ? applyMask(small, smallMaskOf(pic.mask, small)) : small;
  return { base, k: original.width / small.width };
}

/** The area automatic framing would use, in the picture's own pixels. */
export function automaticRegion(pic: Picture, s: Settings): Rect {
  const original = pic.original!;
  const { base, k } = displayBase(pic, s);
  const b = subjectBounds(base);
  return b
    ? { x: b.x * k, y: b.y * k, w: b.w * k, h: b.h * k }
    : { x: 0, y: 0, w: original.width, h: original.height };
}

/**
 * Overlay with a draggable, resizable box over the picture. Apply returns the box in the
 * picture's own pixels; Reset returns null (automatic framing); Cancel changes nothing.
 */
export function openCrop(pic: Picture, settings: Settings, onDone: (crop: Rect | null) => void): void {
  if (!pic.original) return;
  const original = pic.original;
  const { base, k } = displayBase(pic, settings);
  const bounds = { w: base.width, h: base.height };
  const start = pic.crop ?? automaticRegion(pic, settings);
  let box: Rect = dragBox({ x: start.x / k, y: start.y / k, w: start.w / k, h: start.h / k }, 'move', 0, 0, bounds);
  let c = 1; // screen px per display px

  const canvas = h<HTMLCanvasElement>('canvas', { class: 'cr-canvas' });
  drawPixels(canvas, base);
  const boxEl = h('div', { class: 'cr-box', tabindex: '0', role: 'group', 'aria-label': 'Crop area. Arrow keys move it; Alt plus arrows resize it.' });
  for (const handle of HANDLES) boxEl.append(h('div', { class: 'cr-handle', 'data-h': handle }));
  const wrap = h('div', { class: 'cr-wrap checker' }, canvas, boxEl);
  const viewport = h('div', { class: 'cr-viewport' }, wrap);
  const info = h('span', { class: 'cr-info', role: 'status', 'aria-live': 'polite' });
  const applyBtn = h<HTMLButtonElement>('button', { type: 'button', class: 'btn btn-primary' }, 'Apply');
  const resetBtn = h<HTMLButtonElement>('button', { type: 'button', class: 'btn' }, 'Reset to automatic');
  const cancelBtn = h<HTMLButtonElement>('button', { type: 'button', class: 'btn' }, 'Cancel');
  const overlay = h(
    'div',
    { class: 'touchup cropper', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Crop icon area', tabindex: '-1' },
    h('div', { class: 'tu-bar' }, h('strong', {}, 'Crop'), info),
    viewport,
    h('p', { class: 'tu-hint' }, 'Drag the box to move it, or drag its edges and corners to resize. The icon is made from this area.'),
    h('div', { class: 'tu-bar' }, resetBtn, h('span', { class: 'tu-spacer' }), cancelBtn, applyBtn),
  );

  function layout() {
    const v = viewport.getBoundingClientRect();
    c = Math.max(0.01, Math.min((v.width - 32) / base.width, (v.height - 32) / base.height));
    wrap.style.width = `${base.width * c}px`;
    wrap.style.height = `${base.height * c}px`;
    boxEl.style.left = `${box.x * c}px`;
    boxEl.style.top = `${box.y * c}px`;
    boxEl.style.width = `${box.w * c}px`;
    boxEl.style.height = `${box.h * c}px`;
    info.textContent = `${Math.round(box.w * k)} × ${Math.round(box.h * k)} px`;
  }

  let drag: { handle: Handle; x: number; y: number; box: Rect; id: number } | null = null;
  boxEl.addEventListener('pointerdown', (e) => {
    const target = e.target as HTMLElement;
    const handle = (target.dataset.h as Handle | undefined) ?? 'move';
    boxEl.setPointerCapture(e.pointerId);
    drag = { handle, x: e.clientX, y: e.clientY, box, id: e.pointerId };
    e.preventDefault();
  });
  boxEl.addEventListener('pointermove', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    box = dragBox(drag.box, drag.handle, (e.clientX - drag.x) / c, (e.clientY - drag.y) / c, bounds, MIN_SIDE);
    layout();
  });
  const endDrag = (e: PointerEvent) => {
    if (drag?.id === e.pointerId) drag = null;
  };
  boxEl.addEventListener('pointerup', endDrag);
  boxEl.addEventListener('pointercancel', endDrag);

  boxEl.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 10 : 1;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const d = delta[e.key];
    if (!d) return;
    e.preventDefault();
    box = dragBox(box, e.altKey ? 'se' : 'move', d[0], d[1], bounds, MIN_SIDE);
    layout();
  });

  const previouslyFocused = document.activeElement as HTMLElement | null;
  const appRoot = document.querySelector<HTMLElement>('#app');
  function close() {
    window.removeEventListener('resize', layout);
    overlay.remove();
    document.body.classList.remove('modal-open');
    if (appRoot) appRoot.inert = false;
    previouslyFocused?.focus?.();
  }

  cancelBtn.addEventListener('click', close);
  resetBtn.addEventListener('click', () => {
    close();
    onDone(null);
  });
  applyBtn.addEventListener('click', () => {
    const x = Math.round(box.x * k);
    const y = Math.round(box.y * k);
    const crop = {
      x,
      y,
      w: Math.min(original.width - x, Math.round(box.w * k)),
      h: Math.min(original.height - y, Math.round(box.h * k)),
    };
    close();
    onDone(crop);
  });
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  document.body.append(overlay);
  document.body.classList.add('modal-open');
  if (appRoot) appRoot.inert = true;
  window.addEventListener('resize', layout);
  layout();
  overlay.focus();
}
