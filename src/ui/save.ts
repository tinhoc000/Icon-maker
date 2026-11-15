import { summarize } from '../core/pipeline';
import type { Format } from '../core/types';
import { h } from './dom';
import type { State, Store } from './store';

export interface SaveHandlers {
  onDownloadOne?: () => void;
  onDownloadAll?: () => void;
}

/** Output formats, the "This will:" summary and the two download buttons. */
export function createSave(store: Store, handlers: SaveHandlers) {
  const boxes = new Map<Format, HTMLInputElement>();
  const row = h('div', { class: 'formats' });
  const make = (format: Format, label: string, hint = '') => {
    const input = h<HTMLInputElement>('input', { type: 'checkbox', value: format });
    boxes.set(format, input);
    input.addEventListener('change', () => {
      const chosen = [...boxes].filter(([, b]) => b.checked).map(([f]) => f);
      store.setSettings({ formats: chosen });
    });
    row.append(h('label', { class: 'check' }, input, h('span', {}, label), hint ? h('small', {}, hint) : ''));
  };
  make('png', 'PNG');
  make('ico', 'ICO');
  make('svg', 'SVG');

  const note = h(
    'p',
    { class: 'card-help' },
    'ICO and SVG are available with Make icon. The SVG wraps the picture as a bitmap; it is not a traced vector.',
  );
  const summary = h('p', { class: 'summary', role: 'status', 'aria-live': 'polite' });
  const one = h<HTMLButtonElement>('button', { type: 'button', class: 'btn btn-primary' }, 'Download this one');
  const all = h<HTMLButtonElement>('button', { type: 'button', class: 'btn' }, 'Download all (ZIP)');
  one.addEventListener('click', () => handlers.onDownloadOne?.());
  all.addEventListener('click', () => handlers.onDownloadAll?.());
  const message = h('p', { class: 'card-msg', role: 'status', hidden: true });
  const offer = h<HTMLButtonElement>('button', { type: 'button', class: 'btn btn-primary', hidden: true });
  let offerRun: (() => void) | null = null;
  offer.addEventListener('click', () => offerRun?.());

  const root = h(
    'section',
    { class: 'card save' },
    h('h2', { class: 'card-title' }, 'Save as'),
    row,
    note,
    summary,
    h('div', { class: 'card-actions' }, one, all),
    message,
    offer,
  );

  function update(state: State) {
    const s = state.settings;
    for (const [format, box] of boxes) {
      box.checked = s.formats.includes(format);
      box.disabled = format === 'png' ? s.formats.length === 1 : !s.makeIcon;
    }
    summary.textContent = summarize(s, state.pictures.some((p) => p.isHeic));
    const ready = state.pictures.filter((p) => p.original && p.status === 'done');
    const selected = state.pictures.find((p) => p.id === state.selectedId);
    one.disabled = !(selected?.original && selected.status === 'done') || !handlers.onDownloadOne;
    all.disabled = ready.length === 0 || !handlers.onDownloadAll;
  }

  /** Shows a message; with an action, also a button (used when the share sheet needs a fresh tap). */
  function say(text: string, action?: { label: string; run: () => void }) {
    message.hidden = text === '';
    message.textContent = text;
    offerRun = action?.run ?? null;
    offer.hidden = !action;
    offer.textContent = action?.label ?? '';
  }

  return { el: root, update, say };
}
