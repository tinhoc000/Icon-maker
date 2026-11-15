import { drawPixels, h, smallOf } from './dom';
import { shouldShare } from './deliver';
import { createAddButton } from './dropzone';
import { batchWarning } from './limits';
import type { Picture, State, Store } from './store';

const STATUS_TEXT: Record<Picture['status'], string> = {
  waiting: 'Waiting',
  working: 'Working',
  done: 'Ready',
  failed: 'Problem',
};

interface Item {
  root: HTMLElement;
  select: HTMLButtonElement;
  canvas: HTMLCanvasElement;
  badge: HTMLElement;
  bar: HTMLElement;
  drawn: unknown;
}

/** The row of picture thumbnails with status, remove buttons and "+ Add". */
export function createThumbnails(store: Store, onFiles: (files: File[]) => void) {
  const title = h('h2', { class: 'strip-title' });
  const list = h('ul', { class: 'thumbs', 'aria-label': 'Pictures' });
  const add = createAddButton(onFiles);
  const warning = h('p', { class: 'card-msg', role: 'status', hidden: true });
  const root = h('section', { class: 'strip', hidden: true }, title, h('div', { class: 'strip-row' }, list, add), warning);
  const onPhone = shouldShare(navigator);
  const items = new Map<string, Item>();

  function build(p: Picture): Item {
    const canvas = h<HTMLCanvasElement>('canvas', { class: 'thumb-canvas', width: 88, height: 88, 'aria-hidden': 'true' });
    const badge = h('span', { class: 'thumb-badge' });
    const bar = h('span', { class: 'thumb-bar' });
    const select = h<HTMLButtonElement>('button', { type: 'button', class: 'thumb-select' }, canvas, badge, bar);
    select.addEventListener('click', () => store.select(p.id));
    const remove = h<HTMLButtonElement>('button', { type: 'button', class: 'thumb-remove' }, '×');
    remove.addEventListener('click', () => store.removePicture(p.id));
    const li = h('li', { class: 'thumb' }, select, remove);
    return { root: li, select, canvas, badge, bar, drawn: null };
  }

  function sync(item: Item, p: Picture, selected: boolean) {
    item.root.classList.toggle('is-selected', selected);
    item.root.dataset.status = p.status;
    item.select.setAttribute('aria-pressed', String(selected));
    const label = p.status === 'working' && p.stage ? p.stage : STATUS_TEXT[p.status];
    item.select.setAttribute('aria-label', `${p.name}: ${p.error ?? label}`);
    item.select.title = `${p.name} — ${p.error ?? label}`;
    item.root.querySelector<HTMLButtonElement>('.thumb-remove')!.setAttribute('aria-label', `Remove ${p.name}`);
    item.badge.textContent = p.status === 'working' ? (p.stage === 'Downloading model' ? 'Model…' : 'Working…') : STATUS_TEXT[p.status];
    item.bar.style.width = p.status === 'working' && p.stage === 'Downloading model' ? `${Math.round((p.progress ?? 0) * 100)}%` : '';
    item.bar.hidden = !(p.status === 'working' && p.stage === 'Downloading model');
    item.root.classList.toggle('is-busy', p.status === 'working');
    if (p.original && item.drawn !== p.original) {
      item.drawn = p.original;
      const small = smallOf(p.original, 176);
      const tmp = document.createElement('canvas');
      drawPixels(tmp, small);
      const ctx = item.canvas.getContext('2d')!;
      const side = Math.max(small.width, small.height);
      const w = (small.width / side) * 88;
      const hgt = (small.height / side) * 88;
      ctx.clearRect(0, 0, 88, 88);
      ctx.drawImage(tmp, (88 - w) / 2, (88 - hgt) / 2, w, hgt);
    }
  }

  function update(state: State) {
    root.hidden = state.pictures.length === 0;
    title.textContent = `Pictures (${state.pictures.length})`;
    const warn = batchWarning(state.pictures.length, onPhone);
    warning.textContent = warn;
    warning.hidden = warn === '';
    const seen = new Set<string>();
    state.pictures.forEach((p, index) => {
      seen.add(p.id);
      let item = items.get(p.id);
      if (!item) {
        item = build(p);
        items.set(p.id, item);
      }
      sync(item, p, p.id === state.selectedId);
      if (list.children[index] !== item.root) list.insertBefore(item.root, list.children[index] ?? null);
    });
    for (const [id, item] of items) {
      if (!seen.has(id)) {
        item.root.remove();
        items.delete(id);
      }
    }
  }

  return { el: root, update };
}
