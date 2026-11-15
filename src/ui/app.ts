import { decodeFile, isHeicFile } from '../core/decode';
import { buildDownloadAll, renderOutputs } from '../core/pipeline';
import { createSegmenter, ModelDownloadError } from '../core/segment';
import { h } from './dom';
import { deliver } from './deliver';
import { createDropzone } from './dropzone';
import { openCrop } from './crop';
import { openTouchUp } from './touchup';
import { createPreview } from './preview';
import { createSave, type SaveHandlers } from './save';
import { createStore, toPictureData, type Store } from './store';
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
        } else if (e.stage === 'inference' && store.getState().modelState !== 'ready') {
          // The model is loaded once inference starts, so the download message should go away.
          store.setModelState('ready');
          void keepStorage();
        }
        store.updatePicture(id, {
          stage: e.stage === 'download' ? 'Downloading model' : 'Removing background',
          progress: e.fraction,
        });
      });
      store.setModelState('ready');
      void keepStorage();
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

  /** Asks the browser not to evict the cached model when storage runs low. Harmless if refused. */
  let storageRequested = false;
  async function keepStorage() {
    if (storageRequested) return;
    storageRequested = true;
    try {
      await navigator.storage?.persist?.();
    } catch {
      // not available in this browser; the cache still works
    }
  }

  // Know up front whether the model is already on this device, and follow the connection.
  void segmenter.modelReady().then((ready) => {
    if (ready && store.getState().modelState === 'unknown') store.setModelState('ready');
  });
  store.setOnline(navigator.onLine);
  window.addEventListener('online', () => store.setOnline(true));
  window.addEventListener('offline', () => store.setOnline(false));

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
    onTouchUp: () => {
      const pic = store.getState().pictures.find((p) => p.id === store.getState().selectedId);
      if (pic?.mask) openTouchUp(pic, (mask) => store.updatePicture(pic.id, { mask }));
    },
    onCrop: () => {
      const { pictures, selectedId, settings } = store.getState();
      const pic = pictures.find((p) => p.id === selectedId);
      if (pic?.original) openCrop(pic, settings, (crop) => store.updatePicture(pic.id, { crop }));
    },
    onResetCrop: () => {
      const { selectedId } = store.getState();
      if (selectedId) store.updatePicture(selectedId, { crop: null });
    },
    onRetryModel: () => {
      store.setModelState('unknown');
      void pump();
    },
    ...extra.steps,
  });
  // --- Saving -----------------------------------------------------------------------------------
  const nextFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 30));

  async function downloadOne() {
    const { pictures, selectedId, settings } = store.getState();
    const pic = pictures.find((p) => p.id === selectedId);
    const data = pic && toPictureData(pic);
    if (!pic || !data || pic.status !== 'done') return;
    save.say('Preparing…');
    await nextFrame(); // let the message paint before the heavy work
    try {
      const files = renderOutputs(data, settings);
      const result = await deliver(files);
      const saved = files.length === 1 ? files[0]!.name : `${files.length} files`;
      save.say(result === 'downloaded' ? `Saved ${saved}.` : '');
    } catch (err) {
      save.say(`${pic.name}: ${err instanceof Error ? err.message : 'Could not save this picture'}`);
    }
  }

  async function downloadAll() {
    const { pictures, settings } = store.getState();
    const isReady = (p: (typeof pictures)[number]) => !!p.original && p.status === 'done';
    const prior = pictures.filter((p) => !isReady(p)).map((p) => ({
      picture: p.name,
      reason: p.status === 'failed' ? (p.error ?? 'Could not be processed') : 'Not finished yet',
    }));
    const ready = pictures.filter(isReady).map((p) => toPictureData(p)!);
    save.say('Preparing…');
    await nextFrame();
    try {
      const { zip, name, failures } = buildDownloadAll(ready, settings, new Date(), prior);
      const result = await deliver([{ name, data: zip, mime: 'application/zip' }]);
      const left =
        failures.length > 0
          ? ` ${failures.length} picture(s) left out; the ZIP has NOT-INCLUDED.txt with the reasons.`
          : '';
      save.say(result === 'cancelled' ? '' : `Saved ${name}.${left}`);
    } catch (err) {
      save.say(err instanceof Error ? err.message : 'Could not build the ZIP');
    }
  }

  const save = createSave(store, { onDownloadOne: () => void downloadOne(), onDownloadAll: () => void downloadAll(), ...extra.save });

  root.replaceChildren(
    h('header', { class: 'app-header' }, h('h1', {}, 'Icon Maker')),
    h(
      'main',
      { class: 'app-main' },
      h('div', { class: 'intake' }, dropzone, thumbs.el),
      h('div', { class: 'workspace' }, preview.el, h('div', { class: 'controls' }, steps.el, save.el)),
      h(
        'p',
        { class: 'app-footer' },
        'Your pictures never leave this device. Works offline after the first visit. On iPhone or iPad: tap Share, then Add to Home Screen.',
      ),
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
