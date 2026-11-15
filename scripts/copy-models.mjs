// Fetches the background-removal model and runtime files into public/models so the app serves them
// itself (needed for offline use). Every file is checked against scripts/models.lock.json, which is
// committed, so a changed or compromised download host cannot slip different code into the site.
//
//   node scripts/copy-models.mjs                 download (or reuse) and verify
//   node scripts/copy-models.mjs --update-lock   after a deliberate library upgrade: review, then record new hashes
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkChunk } from './lock.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'models');
const lockPath = join(root, 'scripts', 'models.lock.json');
const updateLock = process.argv.includes('--update-lock');

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

let lock;
if (updateLock) {
  lock = { version, chunks: {} };
} else {
  if (!existsSync(lockPath)) throw new Error('scripts/models.lock.json is missing. Run: npm run models:lock');
  lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  if (lock.version !== version) {
    throw new Error(
      `The library is ${version} but scripts/models.lock.json is for ${lock.version}. Review the upgrade, then run: npm run models:lock`,
    );
  }
}

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
    let bytes = existsSync(file) ? readFileSync(file) : null;
    if (bytes && sha256(bytes) === chunk.hash) {
      reused++;
    } else {
      bytes = await get(base + chunk.name);
      if (sha256(bytes) !== chunk.hash) throw new Error(`Checksum mismatch for ${chunk.name}`);
      downloaded++;
    }
    if (updateLock) lock.chunks[chunk.name] = chunk.hash;
    else checkChunk(lock, chunk.name, sha256(bytes)); // against the committed lock, not the host's own list
    writeFileSync(file, bytes);
  }
}

writeFileSync(join(outDir, 'resources.json'), JSON.stringify(kept));
if (updateLock) writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
const totalMb = Object.values(kept).reduce((n, e) => n + e.size, 0) / 1e6;
console.log(
  `models: ${downloaded} file(s) downloaded, ${reused} already present, ${totalMb.toFixed(0)} MB in public/models` +
    (updateLock ? `; wrote scripts/models.lock.json (${Object.keys(lock.chunks).length} files)` : ', all match the lock'),
);
