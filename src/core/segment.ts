import { fitWithin } from './decode';
import { resize } from './icon';
import { resizeMask } from './mask';
import { MODEL_INPUT_SIDE, SegmentError } from './segment-logic';
import type { WorkerReply, WorkerRequest } from './segment.worker';
import type { Mask, Pixels } from './types';

export type Progress = { stage: 'download' | 'inference'; fraction: number };

export const MODEL_CACHE = 'icon-maker-models';

export const DOWNLOAD_FAILED =
  'Background removal needs a one-time download. Check your connection and try again.';

/** The model files could not be fetched. Convert and Make icon still work. */
export class ModelDownloadError extends Error {
  constructor() {
    super(DOWNLOAD_FAILED);
    this.name = 'ModelDownloadError';
  }
}

export interface Segmenter {
  removeBackground(p: Pixels, onProgress: (e: Progress) => void): Promise<Mask>;
  /** True when the model files are already stored on this device. */
  modelReady(): Promise<boolean>;
}

function modelsUrl(): string {
  return new URL('models/', document.baseURI).href;
}

/**
 * Background removal in a Web Worker. The picture is reduced on this side
 * before it is sent, so the worker never holds a full-size copy; the mask
 * that comes back is scaled up to the picture's size.
 */
export function createSegmenter(): Segmenter {
  let worker: Worker | null = null;
  let nextId = 1;
  let queue: Promise<unknown> = Promise.resolve();

  const getWorker = () =>
    (worker ??= new Worker(new URL('./segment.worker.ts', import.meta.url), { type: 'module' }));

  const dropWorker = () => {
    worker?.terminate();
    worker = null;
  };

  function run(small: Pixels, onProgress: (e: Progress) => void): Promise<Mask> {
    return new Promise<Mask>((resolve, reject) => {
      const w = getWorker();
      const id = nextId++;
      const finish = () => {
        w.removeEventListener('message', onMessage);
        w.removeEventListener('error', onError);
      };
      const onMessage = (event: MessageEvent<WorkerReply>) => {
        const reply = event.data;
        if (reply.id !== id) return;
        if (reply.type === 'progress') {
          onProgress({ stage: reply.stage, fraction: reply.fraction });
          return;
        }
        finish();
        if (reply.type === 'done') {
          resolve({ width: reply.width, height: reply.height, data: new Uint8Array(reply.data) });
        } else if (reply.kind === 'download') {
          // The library remembers a failed load, so start clean for the retry.
          dropWorker();
          reject(new ModelDownloadError());
        } else {
          reject(new SegmentError(reply.message));
        }
      };
      const onError = () => {
        finish();
        dropWorker();
        reject(new SegmentError());
      };
      w.addEventListener('message', onMessage);
      w.addEventListener('error', onError);
      const copy = small.data.slice().buffer as ArrayBuffer;
      const request: WorkerRequest = {
        id,
        publicPath: modelsUrl(),
        width: small.width,
        height: small.height,
        data: copy,
      };
      w.postMessage(request, [copy]);
    });
  }

  return {
    removeBackground(p, onProgress) {
      const job = queue.then(async () => {
        const { w, h } = fitWithin(p.width, p.height, MODEL_INPUT_SIDE);
        const small = w === p.width && h === p.height ? p : resize(p, w, h);
        const mask = await run(small, onProgress);
        return resizeMask(mask, p.width, p.height);
      });
      queue = job.catch(() => undefined);
      return job;
    },

    async modelReady() {
      try {
        if (!('caches' in globalThis)) return false;
        const cache = await caches.open(MODEL_CACHE);
        const manifest = await cache.match(new URL('resources.json', modelsUrl()).href);
        if (!manifest) return false;
        const entries = (await manifest.json()) as Record<string, { chunks: { name: string }[] }>;
        for (const entry of Object.values(entries)) {
          for (const chunk of entry.chunks) {
            if (!(await cache.match(new URL(chunk.name, modelsUrl()).href))) return false;
          }
        }
        return true;
      } catch {
        return false;
      }
    },
  };
}
