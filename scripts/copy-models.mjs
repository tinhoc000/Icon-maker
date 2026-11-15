// Fetches the background-removal model and runtime files into public/models so
// the app serves them itself (needed for offline use). Files that are already
// present with the right checksum are kept, so this is quick after the first run.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'models');
const { version } = JSON.parse(
  readFileSync(join(root, 'node_modules', '@imgly', 'background-removal', 'package.json'), 'utf8'),
);
const base = `https://staticimgly.com/@imgly/background-removal-data/${version}/dist/`;

// Keep in step with MODEL in src/core/segment.worker.ts.
const WANTED = [
  '/models/isnet_fp16',
  '/onnxruntime-web/ort-wasm-simd-threaded.wasm',
  '/onnxruntime-web/ort-wasm-simd-threaded.mjs',
];

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

mkdirSync(outDir, { recursive: true });
const all = JSON.parse(new TextDecoder().decode(await get(base + 'resources.json')));
const kept = {};
let downloaded = 0;
let reused = 0;

for (const key of WANTED) {
  const entry = all[key];
  if (!entry) throw new Error(`${key} is missing from the model manifest for version ${version}`);
  kept[key] = entry;
  for (const chunk of entry.chunks) {
    const file = join(outDir, chunk.name);
    if (existsSync(file) && sha256(readFileSync(file)) === chunk.hash) {
      reused++;
      continue;
    }
    const bytes = await get(base + chunk.name);
    if (sha256(bytes) !== chunk.hash) throw new Error(`Checksum mismatch for ${chunk.name}`);
    writeFileSync(file, bytes);
    downloaded++;
  }
}

writeFileSync(join(outDir, 'resources.json'), JSON.stringify(kept));
const totalMb = Object.values(kept).reduce((n, e) => n + e.size, 0) / 1e6;
console.log(
  `models: ${downloaded} file(s) downloaded, ${reused} already present, ${totalMb.toFixed(0)} MB in public/models`,
);
