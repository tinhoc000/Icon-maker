import { h } from './dom';

const ACCEPT = 'image/*,.heic,.heif,.HEIC,.HEIF';

/** Drop area, file picker and paste handler. Calls onFiles with whatever the person gives it. */
export function createDropzone(onFiles: (files: File[]) => void): HTMLElement {
  const input = h<HTMLInputElement>('input', { type: 'file', multiple: true, accept: ACCEPT, hidden: true });
  const button = h<HTMLButtonElement>(
    'button',
    { type: 'button', class: 'dropzone-button' },
    h('span', { class: 'dropzone-title' }, 'Drop pictures here, or tap to choose'),
    h('span', { class: 'dropzone-hint' }, 'Accepts: HEIC, JPG, PNG, WebP'),
  );
  const zone = h('div', { class: 'dropzone' }, button, input);

  const give = (list: FileList | File[] | null | undefined) => {
    const files = list ? Array.from(list) : [];
    if (files.length > 0) onFiles(files);
  };

  button.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    give(input.files);
    input.value = ''; // lets the same file be chosen again
  });

  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('is-over');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('is-over');
    give(e.dataTransfer?.files);
  });

  document.addEventListener('paste', (e) => {
    const files = Array.from(e.clipboardData?.files ?? []);
    if (files.length > 0) give(files);
  });

  return zone;
}

/** The "+ Add" button in the thumbnail strip opens the same picker. */
export function createAddButton(onFiles: (files: File[]) => void): HTMLElement {
  const input = h<HTMLInputElement>('input', { type: 'file', multiple: true, accept: ACCEPT, hidden: true });
  const button = h<HTMLButtonElement>('button', { type: 'button', class: 'add-button' }, '+ Add');
  button.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length > 0) onFiles(files);
  });
  return h('div', { class: 'add-wrap' }, button, input);
}
