import { PADDING_CHOICES, SIZE_CHOICES, SIZE_MAX, SIZE_MIN } from '../core/types';
import { DOWNLOAD_FAILED, OFFLINE_MESSAGE } from '../core/segment';
import { h } from './dom';
import type { State, Store } from './store';

export interface StepHandlers {
  onTouchUp?: () => void;
  onCrop?: () => void;
  onResetCrop?: () => void;
  onRetryModel: () => void;
}

const PADDING_LABELS: Record<number, string> = { 0: 'None', 4: 'Small (4%)', 8: 'Normal (8%)', 16: 'Large (16%)' };

function toggle(label: string): { root: HTMLLabelElement; input: HTMLInputElement } {
  const input = h<HTMLInputElement>('input', { type: 'checkbox', role: 'switch', class: 'switch-input' });
  const root = h<HTMLLabelElement>(
    'label',
    { class: 'switch' },
    input,
    h('span', { class: 'switch-track', 'aria-hidden': 'true' }),
    h('span', { class: 'switch-text' }, label),
  );
  return { root, input };
}

function card(step: string, title: string, ...kids: (Node | string)[]) {
  return h('section', { class: 'card' }, h('h2', { class: 'card-title' }, h('span', { class: 'step-tag' }, step), title), ...kids);
}

/** The three labelled step cards: Convert, Remove background, Make icon. */
export function createSteps(store: Store, handlers: StepHandlers) {
  // Step 1
  const convert = card(
    'STEP 1',
    'Convert',
    h('p', { class: 'card-help' }, 'Reads iPhone HEIC photos and JPG, PNG or WebP files. Always on.'),
  );

  // Step 2
  const bg = toggle('Remove background');
  const modelMsg = h('p', { class: 'card-msg', role: 'status', hidden: true });
  const retry = h<HTMLButtonElement>('button', { type: 'button', class: 'btn', hidden: true }, 'Retry');
  retry.addEventListener('click', handlers.onRetryModel);
  const touchUp = h<HTMLButtonElement>('button', { type: 'button', class: 'btn' }, 'Touch up…');
  touchUp.addEventListener('click', () => handlers.onTouchUp?.());
  const removeCard = card(
    'STEP 2',
    'Remove background',
    h('div', { class: 'card-row' }, bg.root),
    h('p', { class: 'card-help' }, 'Cuts the subject out; the rest goes clear. The first time, a one-time model download is needed.'),
    modelMsg,
    h('div', { class: 'card-actions' }, retry, touchUp),
  );
  bg.input.addEventListener('change', () => store.setSettings({ removeBackground: bg.input.checked }));

  // Step 3
  const icon = toggle('Make icon');
  const sizeSelect = h<HTMLSelectElement>('select', { class: 'field', id: 'icon-size' });
  for (const s of SIZE_CHOICES) sizeSelect.append(h('option', { value: s }, `${s} px`));
  sizeSelect.append(h('option', { value: 'custom' }, 'Custom…'));
  const custom = h<HTMLInputElement>('input', {
    type: 'number',
    class: 'field',
    id: 'icon-size-custom',
    min: SIZE_MIN,
    max: SIZE_MAX,
    inputmode: 'numeric',
    'aria-label': 'Custom icon size in pixels',
    hidden: true,
  });
  const padSelect = h<HTMLSelectElement>('select', { class: 'field', id: 'icon-padding' });
  for (const p of PADDING_CHOICES) padSelect.append(h('option', { value: p }, PADDING_LABELS[p]));
  const cropBtn = h<HTMLButtonElement>('button', { type: 'button', class: 'btn' }, 'Crop…');
  cropBtn.addEventListener('click', () => handlers.onCrop?.());
  const cropState = h('span', { class: 'crop-state' });
  const resetCrop = h<HTMLButtonElement>('button', { type: 'button', class: 'btn-link', hidden: true }, 'Reset');
  resetCrop.addEventListener('click', () => handlers.onResetCrop?.());
  const fields = h(
    'div',
    { class: 'fields' },
    h('label', { class: 'field-label', for: 'icon-size' }, 'Size'),
    sizeSelect,
    custom,
    h('label', { class: 'field-label', for: 'icon-padding' }, 'Padding'),
    padSelect,
  );
  const iconCard = card(
    'STEP 3',
    'Make icon',
    h('div', { class: 'card-row' }, icon.root),
    h('p', { class: 'card-help' }, 'Square, centred, resized. Trims to the subject unless you crop by hand.'),
    fields,
    h('div', { class: 'card-actions' }, cropBtn, cropState, resetCrop),
  );
  icon.input.addEventListener('change', () => store.setSettings({ makeIcon: icon.input.checked }));
  let customMode = false;
  sizeSelect.addEventListener('change', () => {
    if (sizeSelect.value === 'custom') {
      customMode = true;
      custom.hidden = false;
      custom.focus();
    } else {
      customMode = false;
      store.setSettings({ size: Number(sizeSelect.value) });
    }
  });
  custom.addEventListener('change', () => store.setSettings({ size: custom.valueAsNumber }));
  padSelect.addEventListener('change', () => store.setSettings({ paddingPct: Number(padSelect.value) }));

  const root = h('div', { class: 'steps' }, convert, removeCard, iconCard);

  function update(state: State) {
    const s = state.settings;
    bg.input.checked = s.removeBackground;
    icon.input.checked = s.makeIcon;

    const known = (SIZE_CHOICES as readonly number[]).includes(s.size);
    const showCustom = customMode || !known;
    sizeSelect.value = showCustom ? 'custom' : String(s.size);
    custom.hidden = !showCustom;
    if (document.activeElement !== custom) custom.value = String(s.size);
    padSelect.value = String(s.paddingPct);
    for (const e of [sizeSelect, custom, padSelect, cropBtn]) e.disabled = !s.makeIcon;
    iconCard.classList.toggle('is-off', !s.makeIcon);
    removeCard.classList.toggle('is-off', !s.removeBackground);

    const pic = state.pictures.find((p) => p.id === state.selectedId);
    touchUp.disabled = !(s.removeBackground && pic?.mask) || !handlers.onTouchUp;
    cropBtn.disabled = !s.makeIcon || !pic?.original || !handlers.onCrop;
    cropState.textContent = s.makeIcon && pic?.original ? (pic.crop ? 'Crop: manual' : 'Crop: automatic') : '';
    resetCrop.hidden = !(s.makeIcon && pic?.crop);

    const failed = state.modelState === 'failed';
    const downloading = state.modelState === 'downloading';
    // Offline and the model was never stored: say so before the person tries.
    const needsConnection = !state.online && state.modelState !== 'ready';
    bg.input.disabled = needsConnection && !s.removeBackground;
    modelMsg.hidden = !(failed || downloading || needsConnection);
    modelMsg.textContent = failed
      ? DOWNLOAD_FAILED
      : downloading
        ? 'Downloading the background-removal model (one time)…'
        : OFFLINE_MESSAGE;
    retry.hidden = !failed;
  }

  return { el: root, update };
}
