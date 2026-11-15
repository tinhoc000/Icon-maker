import { decodeFile, isHeicFile } from '../core/decode';
import { createSegmenter, ModelDownloadError } from '../core/segment';
import { h } from './dom';
import { createDropzone } from './dropzone';
import { createPreview } from './preview';
import { createSave, type SaveHandlers } from './save';
import { createStore, type Store } from './store';
import { createSteps, type StepHandlers } from './steps';
import { createThumbnails } from './thumbnails';

export interface App {
  store: Store;
  say(text: string): void;
}

export function mountApp(root: HTMLElement, extra: { steps?: Partial<StepHandlers>; save?: SaveHandlers } = {}): App {
  const store = createStore();
  const segmenter = createSegmenter();

  // --- Reading files (one at a time, to keep memory low on phones) -------------------------------
  let decodeQueue: Promise<void> = Promise.resolve();

  function addFiles(files: File[]) {
    for (const file of files) {
      const id = store.addPicture({ name: file.name, status: 'working' });
      store.updatePicture(id, { stage: 'Reading', progress: 0 });
      decodeQueue = decodeQueue.then(async () => {
        if (!store.getState().pictures.some((p) => p.id === id)) return; // removed while waiting
        const isHeic = await isHeicFile(file);
        store.updatePicture(id, { isHeic });
        try {
          const original = await decodeFile(file);
          store.updatePicture(id, { original, status: 'waiting', stage: undefined, progress: undefined });
        } catch (err) {
          store.updatePicture(id, {
            status: 'failed',
            stage: undefined,
            progress: undefined,
            error: err instanceof Error ? err.message : "Couldn't read this file",
          });
        }
        void pump();
      });
    }
  }

  // --- Background removal (one picture at a time) ------------------------------------------------
  let pumping = false;

  async function segmentOne(id: string) {
    const pic = store.getState().pictures.find((p) => p.id === id);
    if (!pic?.original) return;
    store.updatePicture(id, { status: 'working', stage: 'Removing background', progress: 0 });
    try {
      const mask = await segmenter.removeBackground(pic.original, (e) => {
        if (e.stage === 'download' && e.fraction < 1 && store.getState().modelState !== 'downloading') {
          store.setModelState('downloading');
        }
        store.updatePicture(id, {
          stage: e.stage === 'download' ? 'Downloading model' : 'Removing background',
          progress: e.fraction,
        });
      });
      store.setModelState('ready');
      store.updatePicture(id, { mask, status: 'done', stage: undefined, progress: undefined, error: undefined });
    } catch (err) {
      if (err instanceof ModelDownloadError) {
        store.setModelState('failed');
        store.updatePicture(id, { status: 'waiting', stage: undefined, progress: undefined });
      } else {
        store.updatePicture(id, {
          status: 'failed',
          stage: undefined,
          progress: undefined,
          error: err instanceof Error ? err.message : 'Background removal failed',
        });
      }
    }
  }

  /** Brings every picture's status in line with the settings, then removes backgrounds in turn. */
  async function pump() {
    if (pumping) return;
    pumping = true;
    try {
      for (;;) {
        const { pictures, settings, modelState } = store.getState();
        for (const p of pictures) {
          if (!p.original || p.status === 'working') continue;
          if (p.status === 'failed' && settings.removeBackground) continue;
          const want = settings.removeBackground && !p.mask ? 'waiting' : 'done';
          if (p.status !== want || (want === 'done' && p.error)) {
            store.updatePicture(p.id, { status: want, error: undefined });
          }
        }
        if (!settings.removeBackground || modelState === 'failed') break;
        const next = store.getState().pictures.find((p) => p.original && !p.mask && p.status === 'waiting');
        if (!next) break;
        await segmentOne(next.id);
      }
    } finally {
      pumping = false;
    }
  }

  let lastRemove = store.getState().settings.removeBackground;
  store.subscribe((state) => {
    if (state.settings.removeBackground !== lastRemove) {
      lastRemove = state.settings.removeBackground;
      void pump();
    }
  });

  // --- Screen -----------------------------------------------------------------------------------
  const dropzone = createDropzone(addFiles);
  const thumbs = createThumbnails(store, addFiles);
  const preview = createPreview();
  const steps = createSteps(store, {
    onRetryModel: () => {
      store.setModelState('unknown');
      void pump();
    },
    ...extra.steps,
  });
  const save = createSave(store, extra.save ?? {});

  root.replaceChildren(
    h('header', { class: 'app-header' }, h('h1', {}, 'Icon Maker')),
    h(
      'main',
      { class: 'app-main' },
      h('div', { class: 'intake' }, dropzone, thumbs.el),
      h('div', { class: 'workspace' }, preview.el, h('div', { class: 'controls' }, steps.el, save.el)),
    ),
  );

  const render = () => {
    const state = store.getState();
    thumbs.update(state);
    preview.update(state);
    steps.update(state);
    save.update(state);
  };
  store.subscribe(render);
  render();

  return { store, say: save.say };
}
