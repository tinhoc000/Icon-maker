import { compositeRegion, dabPoints, MaskHistory, paintDab, resizeMask, type StrokeRecorder } from '../core/mask';
import type { Mask, Rect } from '../core/types';
import { h, smallOf } from './dom';
import type { Picture } from './store';

/** Edits happen on a copy at most this many pixels on the long side; Done scales the mask back up. */
const EDIT_SIDE = 2048;
const MAX_SCALE = 16;

type Tool = 'erase' | 'restore';
interface Point {
  x: number;
  y: number;
}

function union(a: Rect | null, b: Rect): Rect {
  if (!a) return b;
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  return { x: x0, y: y0, w: Math.max(a.x + a.w, b.x + b.w) - x0, h: Math.max(a.y + a.h, b.y + b.h) - y0 };
}

/**
 * Full-screen mask editor. Erase and Restore brushes change only the mask, so the
 * original pixels are never lost. Calls onDone with a full-size mask if anything changed.
 */
export function openTouchUp(pic: Picture, onDone: (mask: Mask) => void): void {
  if (!pic.original || !pic.mask) return;
  const original = pic.original;
  const base = smallOf(original, EDIT_SIDE);
  const edit = resizeMask(pic.mask, base.width, base.height); // always a copy
  const history = new MaskHistory();
  let changed = false;
  let tool: Tool = 'erase';
  const longSide = Math.max(base.width, base.height);
  let radius = Math.max(3, Math.round(longSide / 60));

  // ---- drawing surface ----
  const canvas = h<HTMLCanvasElement>('canvas', { class: 'tu-canvas', width: base.width, height: base.height });
  const ctx = canvas.getContext('2d')!;
  const frame = new ImageData(new Uint8ClampedArray(base.width * base.height * 4), base.width, base.height);
  const full: Rect = { x: 0, y: 0, w: base.width, h: base.height };
  const refresh = (r: Rect) => {
    compositeRegion(base, edit, frame.data, r);
    ctx.putImageData(frame, 0, 0, Math.max(0, r.x), Math.max(0, r.y), Math.min(r.w, base.width), Math.min(r.h, base.height));
  };
  refresh(full);

  // ---- controls ----
  const eraseBtn = h<HTMLButtonElement>('button', { type: 'button', class: 'btn tu-tool', 'aria-pressed': 'true' }, 'Erase');
  const restoreBtn = h<HTMLButtonElement>('button', { type: 'button', class: 'btn tu-tool', 'aria-pressed': 'false' }, 'Restore');
  const size = h<HTMLInputElement>('input', {
    type: 'range',
    min: 3,
    max: Math.max(10, Math.round(longSide / 8)),
    value: radius,
    'aria-label': 'Brush size',
    class: 'tu-size',
  });
  const undoBtn = h<HTMLButtonElement>('button', { type: 'button', class: 'btn', disabled: true }, 'Undo');
  const zoomOut = h<HTMLButtonElement>('button', { type: 'button', class: 'btn', 'aria-label': 'Zoom out' }, '−');
  const fitBtn = h<HTMLButtonElement>('button', { type: 'button', class: 'btn' }, 'Fit');
  const zoomIn = h<HTMLButtonElement>('button', { type: 'button', class: 'btn', 'aria-label': 'Zoom in' }, '+');
  const cancelBtn = h<HTMLButtonElement>('button', { type: 'button', class: 'btn' }, 'Cancel');
  const doneBtn = h<HTMLButtonElement>('button', { type: 'button', class: 'btn btn-primary' }, 'Done');

  const stage = h('div', { class: 'tu-stage' }, canvas);
  const ring = h('div', { class: 'tu-ring', hidden: true });
  const viewport = h('div', { class: 'tu-viewport' }, stage, ring);
  const hint = h(
    'p',
    { class: 'tu-hint' },
    'Erase paints away leftovers; Restore brings back parts that were cut off. Pinch or scroll to zoom, two fingers or right-drag to move.',
  );
  const overlay = h(
    'div',
    { class: 'touchup', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Touch up background removal', tabindex: '-1' },
    h('div', { class: 'tu-bar' }, eraseBtn, restoreBtn, h('label', { class: 'tu-size-label' }, 'Brush', size), undoBtn),
    viewport,
    hint,
    h('div', { class: 'tu-bar' }, zoomOut, fitBtn, zoomIn, h('span', { class: 'tu-spacer' }), cancelBtn, doneBtn),
  );

  // ---- zoom and pan (CSS px per image px = scale) ----
  let scale = 1;
  let tx = 0;
  let ty = 0;
  let fitScale = 1;
  const view = () => viewport.getBoundingClientRect();

  function apply() {
    const v = view();
    const margin = 48;
    tx = Math.min(v.width - margin, Math.max(margin - base.width * scale, tx));
    ty = Math.min(v.height - margin, Math.max(margin - base.height * scale, ty));
    stage.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    canvas.classList.toggle('is-pixelated', scale > 3);
  }

  function fit() {
    const v = view();
    fitScale = Math.min(v.width / base.width, v.height / base.height) * 0.98;
    scale = fitScale;
    tx = (v.width - base.width * scale) / 2;
    ty = (v.height - base.height * scale) / 2;
    apply();
  }

  function zoomAt(cx: number, cy: number, factor: number) {
    const v = view();
    const next = Math.min(MAX_SCALE, Math.max(fitScale * 0.5, scale * factor));
    const px = cx - v.left;
    const py = cy - v.top;
    tx = px - ((px - tx) * next) / scale;
    ty = py - ((py - ty) * next) / scale;
    scale = next;
    apply();
  }

  function toImage(clientX: number, clientY: number): Point {
    const r = canvas.getBoundingClientRect();
    return { x: ((clientX - r.left) * base.width) / r.width, y: ((clientY - r.top) * base.height) / r.height };
  }

  // ---- painting ----
  let stroke: { rec: StrokeRecorder; last: Point; pointerId: number } | null = null;

  function paintTo(points: Point[]) {
    if (!stroke) return;
    let dirty: Rect | null = null;
    for (const p of points) {
      const r = paintDab(edit, p.x, p.y, radius, tool, stroke.rec);
      if (r.w > 0 && r.h > 0) dirty = union(dirty, r);
      stroke.last = p;
    }
    if (dirty) {
      changed = true;
      refresh(dirty);
    }
  }

  function endStroke() {
    if (!stroke) return;
    history.endStroke();
    stroke = null;
    undoBtn.disabled = !history.canUndo();
  }

  const pointers = new Map<number, Point>();
  let gesture: { dist: number; mid: Point; scale: number; tx: number; ty: number } | null = null;
  let panning: { pointerId: number; last: Point } | null = null;
  let spaceDown = false;

  function startGesture() {
    const [a, b] = [...pointers.values()] as [Point, Point];
    const v = view();
    gesture = {
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      mid: { x: (a.x + b.x) / 2 - v.left, y: (a.y + b.y) / 2 - v.top },
      scale,
      tx,
      ty,
    };
  }

  function moveRing(e: PointerEvent) {
    const showRing = e.pointerType !== 'touch';
    ring.hidden = !showRing;
    if (!showRing) return;
    const v = view();
    const d = radius * 2 * scale;
    ring.style.width = ring.style.height = `${d}px`;
    ring.style.transform = `translate(${e.clientX - v.left - d / 2}px, ${e.clientY - v.top - d / 2}px)`;
  }

  viewport.addEventListener('pointerdown', (e) => {
    viewport.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (e.pointerType === 'touch' && pointers.size === 2) {
      endStroke();
      startGesture();
      return;
    }
    if (pointers.size > 2) return;
    const wantsPan = e.pointerType === 'mouse' && (e.button === 1 || e.button === 2 || spaceDown);
    if (wantsPan) {
      panning = { pointerId: e.pointerId, last: { x: e.clientX, y: e.clientY } };
      return;
    }
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const p = toImage(e.clientX, e.clientY);
    stroke = { rec: history.beginStroke(), last: p, pointerId: e.pointerId };
    paintTo([p]);
  });

  viewport.addEventListener('pointermove', (e) => {
    moveRing(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (gesture && pointers.size >= 2) {
      const [a, b] = [...pointers.values()] as [Point, Point];
      const v = view();
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mid = { x: (a.x + b.x) / 2 - v.left, y: (a.y + b.y) / 2 - v.top };
      scale = Math.min(MAX_SCALE, Math.max(fitScale * 0.5, (gesture.scale * dist) / gesture.dist));
      tx = mid.x - ((gesture.mid.x - gesture.tx) * scale) / gesture.scale;
      ty = mid.y - ((gesture.mid.y - gesture.ty) * scale) / gesture.scale;
      apply();
      return;
    }
    if (panning && panning.pointerId === e.pointerId) {
      tx += e.clientX - panning.last.x;
      ty += e.clientY - panning.last.y;
      panning.last = { x: e.clientX, y: e.clientY };
      apply();
      return;
    }
    if (stroke && stroke.pointerId === e.pointerId) {
      const events = e.getCoalescedEvents?.() ?? [];
      const list = events.length > 0 ? events : [e];
      for (const ev of list) paintTo(dabPoints(stroke.last, toImage(ev.clientX, ev.clientY), radius));
    }
  });

  const release = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (stroke && stroke.pointerId === e.pointerId) endStroke();
    if (panning && panning.pointerId === e.pointerId) panning = null;
    if (pointers.size < 2) gesture = null;
    if (e.pointerType === 'touch') ring.hidden = true;
  };
  viewport.addEventListener('pointerup', release);
  viewport.addEventListener('pointercancel', release);
  viewport.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'touch') ring.hidden = true;
  });
  viewport.addEventListener('contextmenu', (e) => e.preventDefault());
  viewport.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
    },
    { passive: false },
  );

  // ---- buttons and keys ----
  function setTool(next: Tool) {
    tool = next;
    eraseBtn.setAttribute('aria-pressed', String(next === 'erase'));
    restoreBtn.setAttribute('aria-pressed', String(next === 'restore'));
  }
  eraseBtn.addEventListener('click', () => setTool('erase'));
  restoreBtn.addEventListener('click', () => setTool('restore'));
  size.addEventListener('input', () => (radius = Number(size.value)));

  function undo() {
    if (history.undo(edit)) refresh(full);
    undoBtn.disabled = !history.canUndo();
  }
  undoBtn.addEventListener('click', undo);

  const centre = () => {
    const v = view();
    return { x: v.left + v.width / 2, y: v.top + v.height / 2 };
  };
  zoomIn.addEventListener('click', () => zoomAt(centre().x, centre().y, 1.4));
  zoomOut.addEventListener('click', () => zoomAt(centre().x, centre().y, 1 / 1.4));
  fitBtn.addEventListener('click', fit);

  const previouslyFocused = document.activeElement as HTMLElement | null;
  const appRoot = document.querySelector<HTMLElement>('#app');

  function close() {
    window.removeEventListener('resize', apply);
    overlay.remove();
    document.body.classList.remove('modal-open');
    if (appRoot) appRoot.inert = false;
    previouslyFocused?.focus?.();
  }
  cancelBtn.addEventListener('click', close);
  doneBtn.addEventListener('click', () => {
    endStroke();
    const result = changed ? resizeMask(edit, original.width, original.height) : null;
    close();
    if (result) onDone(result);
  });

  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      undo();
    } else if (e.key === ' ' && (e.target as HTMLElement).tagName !== 'BUTTON') {
      spaceDown = true;
      e.preventDefault();
    } else if (e.target === overlay || (e.target as HTMLElement).tagName === 'CANVAS') {
      if (e.key === 'e') setTool('erase');
      else if (e.key === 'r') setTool('restore');
    }
  });
  overlay.addEventListener('keyup', (e) => {
    if (e.key === ' ') spaceDown = false;
  });

  document.body.append(overlay);
  document.body.classList.add('modal-open');
  if (appRoot) appRoot.inert = true;
  window.addEventListener('resize', apply);
  fit();
  overlay.focus();
}
