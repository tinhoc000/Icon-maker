/// <reference lib="webworker" />
import { preload, segmentForeground, type Config } from '@imgly/background-removal';
import { alphaFromEngineOutput, SegmentError, segmentWith, type Engine } from './segment-logic';
import type { Pixels } from './types';

export type WorkerRequest = {
  id: number;
  publicPath: string;
  width: number;
  height: number;
  data: ArrayBuffer;
};

export type WorkerReply =
  | { id: number; type: 'progress'; stage: 'download' | 'inference'; fraction: number }
  | { id: number; type: 'done'; width: number; height: number; data: ArrayBuffer }
  | { id: number; type: 'error'; kind: 'download' | 'memory'; message: string };

// Keep in step with WANTED in scripts/copy-models.mjs.
const MODEL = 'isnet_fp16';

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let currentId = 0;
const fetched = new Map<string, [number, number]>();

function onLibraryProgress(key: string, current: number, total: number): void {
  if (!key.startsWith('fetch:')) return;
  fetched.set(key, [current, total]);
  let done = 0;
  let all = 0;
  for (const [c, t] of fetched.values()) {
    done += c;
    all += t;
  }
  const reply: WorkerReply = { id: currentId, type: 'progress', stage: 'download', fraction: all ? done / all : 0 };
  ctx.postMessage(reply);
}

let config: Config | null = null;

/** The same config object every time, so the library reuses its loaded model. */
function configFor(publicPath: string): Config {
  config ??= {
    publicPath,
    model: MODEL,
    device: 'cpu',
    output: { format: 'image/x-alpha8', quality: 1 },
    progress: onLibraryProgress,
  };
  return config;
}

const engine: Engine = async (input: Pixels) => {
  // The library's types allow ImageData, but its code only converts Blobs (an ImageData would
  // crash it), so hand it raw RGBA tagged with the picture's size.
  const source = new Blob([input.data as BlobPart], {
    type: `image/x-rgba8;width=${input.width};height=${input.height}`,
  });
  const blob = await segmentForeground(source, config!);
  return alphaFromEngineOutput(new Uint8Array(await blob.arrayBuffer()), input.width, input.height);
};

ctx.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, publicPath, width, height, data } = event.data;
  currentId = id;
  const send = (reply: WorkerReply, transfer: Transferable[] = []) => ctx.postMessage(reply, transfer);

  try {
    await preload(configFor(publicPath));
  } catch (err) {
    send({ id, type: 'error', kind: 'download', message: String(err) });
    return;
  }

  try {
    send({ id, type: 'progress', stage: 'inference', fraction: 0 });
    const mask = await segmentWith(engine, { width, height, data: new Uint8ClampedArray(data) });
    const out = mask.data.buffer as ArrayBuffer;
    send({ id, type: 'done', width: mask.width, height: mask.height, data: out }, [out]);
  } catch (err) {
    const message = err instanceof SegmentError ? err.message : String(err);
    console.error('Background removal failed:', err instanceof SegmentError ? err.cause : err);
    send({ id, type: 'error', kind: 'memory', message });
  }
};
