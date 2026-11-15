# Icon Maker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser tool that converts HEIC/JPG/PNG/WebP photos to PNG, removes backgrounds, and makes square icons (PNG, ICO, SVG), working offline on Windows PCs and iPhone/iPad.

**Architecture:** A Vite + TypeScript static app. All image logic lives in DOM-free modules under `src/core` operating on plain RGBA pixel arrays, so it is unit-testable in Node. PNG, ICO and resizing are written in pure TypeScript (PNG via `fflate`'s zlib); only decoding and the segmentation worker touch browser APIs. A thin `src/ui` layer binds a small store to the screen. A service worker caches the app and model for offline use.

**Tech Stack:** Vite, TypeScript, Vitest, Playwright (Chromium + WebKit), `vite-plugin-pwa`, `fflate`, `heic-to`, a segmentation library chosen in Task 2 (default `@imgly/background-removal`).

**Spec:** `docs/superpowers/specs/2026-11-14-icon-maker-design.md`

## Global Constraints

- Everything runs in the browser; pictures are never uploaded.
- Vite + TypeScript, no UI framework.
- Inputs: HEIC/HEIF, JPG, PNG, WebP. Outputs: PNG, ICO, SVG.
- Working copy capped at 4096 px on the long side. Model input about 1024 px long side.
- Defaults: Remove background off, Make icon off, size 256, padding 8, formats `['png']`.
- Sizes 64, 128, 256, 512, 1024 or custom 16 to 2048. Padding 0, 4, 8, 16 percent of the square.
- ICO contains 16, 32, 48, 64, 128 and 256 px images, each stored as PNG, regardless of the chosen size.
- SVG wraps the PNG as a data URL; the screen says it is a wrapped bitmap, not a traced vector.
- ICO and SVG are offered only when Make icon is on. At least one format is always selected.
- File names: `IMG_1234.png`, `IMG_1234-cutout.png`, `IMG_1234-icon-256.png`, `IMG_1234-icon.ico`, `IMG_1234-icon-256.svg`, `icons-YYYY-MM-DD.zip`; duplicates get `-2`, `-3`.
- Pictures, masks and settings are memory-only; only the app shell and the model are cached.
- Hosted on GitHub Pages (public repository), installable, works offline after first visit.
- Pictures are processed one at a time; one failure never stops the rest.
- Error messages are plain language, shown on the affected picture.
- Touch targets at least 44 px; must work with finger, Apple Pencil and mouse.

## Review Focus

Input classes the spec implies but does not spell out. Each has a pinning test in the task named.

1. iPhone file with an empty MIME type, an uppercase `.HEIC` extension, or an extension that lies about the contents: still decoded as what the bytes say (Task 8).
2. Crop box of zero size, negative size, or partly or wholly outside the picture: clamped, or falls back to automatic framing; never throws (Task 5).
3. Custom icon size left blank, 0, text, or 5000: clamped to 16 to 2048, non-numbers become 256 (Task 3).
4. Same file added twice, names with several dots, no extension, or characters Windows forbids: unique, valid output names (Task 3).
5. Picture smaller than the icon size, or an extreme shape such as 1 x 500 px: output is still exactly size x size with visible content, no crash (Task 5).

---

## File Structure

```
package.json, tsconfig.json, vite.config.ts, index.html, spike.html (temporary)
.github/workflows/deploy.yml
scripts/copy-models.mjs            copies model files into public/models at build
src/main.ts
src/core/types.ts                  shared types and defaults
src/core/naming.ts                 names, dedupe, settings normalisation
src/core/mask.ts                   apply mask, brush dabs, undo history, mask resize
src/core/icon.ts                   bounds, crop clamp, resize, makeIcon
src/core/encode.ts                 PNG, ICO, SVG
src/core/zip.ts                    ZIP with failure note
src/core/decode.ts                 sniff, fit, decodeFile
src/core/segment-logic.ts          downscale, retry, upscale around an engine
src/core/segment.ts, segment.worker.ts   worker-backed Segmenter
src/core/pipeline.ts               summarize, renderOutputs, buildDownloadAll
src/ui/store.ts, dropzone.ts, thumbnails.ts, preview.ts, steps.ts,
       touchup.ts, crop.ts, deliver.ts, styles.css
tests/core/*.test.ts               Vitest
tests/e2e/*.spec.ts, tests/fixtures/
docs/release-checklist.md, README.md
```

---

### Task 1: Scaffold, tooling, deploy pipeline

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `.gitignore`, `.github/workflows/deploy.yml`, `tests/core/smoke.test.ts`

**Interfaces:**
- Produces: `npm run dev`, `npm test` (Vitest, Node environment), `npm run build`, `npm run typecheck`; `vite.config.ts` base path read from `process.env.VITE_BASE ?? '/'`.

- [ ] **Step 1:** `npm init`; install `vite typescript vitest vite-plugin-pwa fflate heic-to`. Set `tsconfig` to `strict`, target ES2022, DOM and WebWorker libs.
- [ ] **Step 2:** Write `tests/core/smoke.test.ts` asserting `1 + 1 === 2`. Run `npm test`: PASS (proves the runner works).
- [ ] **Step 3:** `index.html` and `src/main.ts` render a heading "Icon Maker". Run `npm run build`: succeeds.
- [ ] **Step 4:** Write `.github/workflows/deploy.yml`: on push to `main`, `npm ci`, `npm test`, `npm run build` with `VITE_BASE=/${{ github.event.repository.name }}/`, publish `dist` with the official Pages actions. `.gitignore`: `node_modules`, `dist`, `public/models`.
- [ ] **Step 5:** Commit `chore: scaffold Vite + TypeScript app with Pages deploy`.
- [ ] **Step 6:** Ask the owner to create a public GitHub repository and enable Pages (source: GitHub Actions). Add the remote and push only after the owner confirms the repository name; confirm the page loads at its URL.

---

### Task 2: Background-removal spike on the owner's devices (throwaway)

**Files:**
- Create: `spike.html`, `src/spike.ts` (both deleted at the end of this task), `docs/superpowers/spike-results.md`
- Modify: `vite.config.ts` (add `spike.html` as a second build input while the spike exists)

**Interfaces:**
- Produces: a recorded decision in `spike-results.md`: either "keep `@imgly/background-removal`" or "switch to <named permissive model>", plus the model file sizes. Task 9 implements whichever is recorded.

- [ ] **Step 1:** Install `@imgly/background-removal`. `spike.html` has a file picker; for each chosen picture it decodes (HEIC through `heic-to`), shrinks to 1024 px long side, runs `removeBackground`, and prints: decode ms, removal ms, whether the model downloaded (and total bytes transferred), and the result drawn on a checkerboard. Wrap in try/catch and print any error.
- [ ] **Step 2:** Build and deploy. Owner opens `/spike.html` on the iPhone and the iPad and runs three real 12 MP photos, at least one HEIC and one of black gear on a dark surface, noting whether the tab reloads or crashes.
- [ ] **Step 3:** Record results in `spike-results.md`. **Pass:** all three photos complete on both devices with no tab reload, each in 60 seconds or less after the first (model-download) run. If it fails, repeat with Transformers.js and a smaller model, confirm the model's licence on its model card, and record that instead.
- [ ] **Step 4:** Check the largest model file against GitHub Pages' 100 MB per-file limit; record the sizes. If any file exceeds it, note that Task 15 must split or host it differently and tell the owner.
- [ ] **Step 5:** Delete `spike.html`, `src/spike.ts` and the extra Vite input. Commit `docs: record background-removal spike results`.

---

### Task 3: Shared types, naming, settings normalisation

**Files:**
- Create: `src/core/types.ts`, `src/core/naming.ts`
- Test: `tests/core/naming.test.ts`

**Interfaces:**
- Produces (`types.ts`):
  - `interface Pixels { width: number; height: number; data: Uint8ClampedArray }` (RGBA)
  - `interface Mask { width: number; height: number; data: Uint8Array }` (0 to 255 opacity)
  - `interface Rect { x: number; y: number; w: number; h: number }`
  - `type Format = 'png' | 'ico' | 'svg'`
  - `interface Settings { removeBackground: boolean; makeIcon: boolean; size: number; paddingPct: number; formats: Format[] }`
  - `const DEFAULT_SETTINGS: Settings`
  - `interface OutputFile { name: string; data: Uint8Array; mime: string }`
  - `class NothingLeftError extends Error`
- Produces (`naming.ts`):
  - `type OutputKind = 'plain' | 'cutout' | 'icon-png' | 'icon-ico' | 'icon-svg'`
  - `outputName(source: string, kind: OutputKind, size?: number): string`
  - `dedupe(names: string[]): string[]`
  - `zipName(date: Date): string`
  - `normalizeSettings(s: Settings): Settings`

- [ ] **Step 1: Write failing tests.**
  - `outputName('IMG_1234.HEIC','plain')` is `IMG_1234.png`; `'cutout'` gives `IMG_1234-cutout.png`; `('IMG_1234.HEIC','icon-png',256)` gives `IMG_1234-icon-256.png`; `'icon-ico'` gives `IMG_1234-icon.ico`; `('x.jpg','icon-svg',64)` gives `x-icon-64.svg`.
  - Review Focus 4: `'my.photo.v2.HEIC'` gives `my.photo.v2.png`; `'scan'` gives `scan.png`; `'a<b>:c|d?.jpg'` gives `a_b__c_d_.png`; an empty or all-illegal name gives `image.png`.
  - `dedupe(['a.png','a.png','a.png','b.png'])` equals `['a.png','a-2.png','a-3.png','b.png']`; matching is case-insensitive (`A.png` collides with `a.png`).
  - `zipName(new Date(2026,10,14))` is `icons-2026-11-14.zip`.
  - `normalizeSettings`, Review Focus 3: `size` `0`, `NaN`, `-5` give 256 for NaN and clamp to 16 otherwise; `5000` gives 2048; `100.7` gives 101; `paddingPct` not in `[0,4,8,16]` becomes 8; with `makeIcon: false`, `formats` drops `ico` and `svg`; empty `formats` becomes `['png']`.
- [ ] **Step 2:** Run `npx vitest run tests/core/naming.test.ts`: FAIL (modules missing).
- [ ] **Step 3:** Implement the modules to the signatures above. Illegal characters are `<>:"/\|?*` and control characters, each replaced by `_`.
- [ ] **Step 4:** Run the tests: PASS. Commit `feat(core): types, naming and settings normalisation`.

---

### Task 4: Mask operations and undo history

**Files:**
- Create: `src/core/mask.ts`
- Test: `tests/core/mask.test.ts`

**Interfaces:**
- Consumes: `Pixels`, `Mask`, `Rect` from Task 3.
- Produces:
  - `applyMask(p: Pixels, m: Mask): Pixels`: returns a new picture whose alpha is `round(alpha * mask / 255)`; throws if sizes differ.
  - `resizeMask(m: Mask, width: number, height: number): Mask`: bilinear.
  - `paintDab(m: Mask, cx: number, cy: number, radius: number, mode: 'erase' | 'restore', rec?: StrokeRecorder): Rect`: sets mask to 0 (erase) or 255 (restore) inside the circle with a 1 px soft edge; returns the changed rectangle clipped to the mask. Before changing a 64 x 64 tile for the first time in a stroke it passes the tile to `rec`.
  - `class MaskHistory { constructor(limit?: number); beginStroke(): StrokeRecorder; endStroke(): void; undo(m: Mask): boolean; canUndo(): boolean }`: stores only the original bytes of tiles touched by each stroke (default limit 30 strokes) so memory stays small on iPhone.

- [ ] **Step 1: Write failing tests.** `applyMask` halves alpha for mask 128 on an opaque pixel (alpha 128) and leaves RGB unchanged; size mismatch throws. `resizeMask` of a 2 x 2 to 4 x 4 keeps corner values. `paintDab` erase at the centre of a 20 x 20 all-255 mask with radius 5 zeroes the centre, leaves the corner at 255, and returns a rect inside the mask; a dab centred outside the picture returns a clipped rect and does not throw; restore after erase returns centre to 255. History: three strokes then three `undo` calls return the mask exactly to its starting bytes; `undo` with nothing returns `false`; a stroke past `limit` drops the oldest without corrupting later undos; a stroke touching only one tile saves at most 64 x 64 bytes (assert via a `bytesHeld()` accessor).
- [ ] **Step 2:** Run: FAIL.
- [ ] **Step 3:** Implement. Tile snapshots are keyed by tile index within a stroke so each tile is saved once.
- [ ] **Step 4:** Run: PASS. Commit `feat(core): mask apply, brush and undo history`.

---

### Task 5: Icon framing and resizing

**Files:**
- Create: `src/core/icon.ts`
- Test: `tests/core/icon.test.ts`

**Interfaces:**
- Consumes: `Pixels`, `Rect`, `NothingLeftError`.
- Produces:
  - `subjectBounds(p: Pixels, alphaThreshold?: number): Rect | null`: bounding box of pixels with alpha above the threshold (default 8); `null` if none.
  - `clampCrop(crop: Rect, width: number, height: number): Rect | null`: rounds to integers, clips to the picture, returns `null` if the result has width or height under 1.
  - `resize(p: Pixels, width: number, height: number): Pixels`: area averaging when shrinking, bilinear when enlarging; both on alpha-premultiplied values so edges do not get dark fringes.
  - `makeIcon(p: Pixels, opts: { size: number; paddingPct: number; crop: Rect | null }): Pixels`: region is the clamped crop, else `subjectBounds`, else (nothing visible) throws `NothingLeftError`. Each side's padding is `round(size * paddingPct / 100)`; the region is scaled to fit the remaining inner square keeping its aspect ratio, never to less than 1 px per side, and centred on a transparent `size x size` picture.

- [ ] **Step 1: Write failing tests.**
  - `subjectBounds` on a 10 x 10 picture with an opaque 3 x 2 block at (4,5) returns `{x:4,y:5,w:3,h:2}`; fully transparent returns `null`.
  - `makeIcon` of an opaque 100 x 50 picture, `size: 64, paddingPct: 8`: output is 64 x 64; the four corners and the outer 5 px border are transparent; the centre is opaque.
  - A transparent picture with an opaque block uses the block, not the whole picture; `paddingPct: 0` makes the block touch the edges of the longer axis.
  - A manual `crop` overrides the subject box.
  - Review Focus 2: `clampCrop({x:-5,y:-5,w:10,h:10}, 20, 20)` is `{x:0,y:0,w:5,h:5}`; `{x:0,y:0,w:0,h:10}`, `{w:-3}`, and a rect wholly outside return `null`; `makeIcon` with such a crop falls back to automatic framing instead of throwing.
  - Review Focus 5: a 10 x 10 opaque source with `size: 256` gives 256 x 256 with an opaque centre; a 1 x 500 source with `size: 64` gives 64 x 64 with at least one opaque column in the centre; a fully transparent source throws `NothingLeftError`.
  - `resize` of a solid 4 x 4 red opaque picture to 2 x 2 stays red and opaque; a half-transparent edge keeps its RGB (no darkening).
- [ ] **Step 2:** Run: FAIL.
- [ ] **Step 3:** Implement to the signatures above.
- [ ] **Step 4:** Run: PASS. Commit `feat(core): icon framing, crop clamping and resizing`.

---

### Task 6: PNG, ICO and SVG encoders

**Files:**
- Create: `src/core/encode.ts`
- Test: `tests/core/encode.test.ts`

**Interfaces:**
- Consumes: `Pixels`, `resize` from Task 5.
- Produces:
  - `encodePng(p: Pixels): Uint8Array`: 8-bit RGBA PNG built from IHDR, one IDAT compressed with `fflate.zlibSync`, IEND, with CRC-32 on every chunk.
  - `ICO_SIZES: readonly [16, 32, 48, 64, 128, 256]`
  - `encodeIco(source: Pixels): Uint8Array`: resizes `source` to each of `ICO_SIZES` and writes an ICO whose entries each hold a PNG (width byte 0 means 256).
  - `encodeSvg(png: Uint8Array, size: number): string`: an SVG of `size x size` containing one `<image>` with a base64 PNG data URL.

- [ ] **Step 1: Write failing tests.** `encodePng` of a 2 x 1 picture starts with bytes `137 80 78 71 13 10 26 10`, IHDR width/height read back as 2 and 1; decoding the IDAT with `fflate.unzlibSync` and removing the per-row filter byte returns the original 8 bytes. `encodeIco`: header reserved 0, type 1, count 6; entry widths read `[16,32,48,64,128,0]`; each entry's offset and size point at data starting with the PNG signature whose IHDR width matches the entry. `encodeSvg(png, 256)` contains `width="256"`, `viewBox="0 0 256 256"` and `data:image/png;base64,`, and the base64 decodes back to `png`.
- [ ] **Step 2:** Run: FAIL.
- [ ] **Step 3:** Implement. Use a table-driven CRC-32.
- [ ] **Step 4:** Run: PASS. Commit `feat(core): PNG, ICO and SVG encoders`.

---

### Task 7: ZIP bundling

**Files:**
- Create: `src/core/zip.ts`
- Test: `tests/core/zip.test.ts`

**Interfaces:**
- Consumes: `OutputFile`.
- Produces: `buildZip(files: OutputFile[], failures: { picture: string; reason: string }[]): Uint8Array`: ZIP of the files; when `failures` is non-empty, also a `NOT-INCLUDED.txt` listing each picture and reason, one per line.

- [ ] **Step 1: Write failing tests.** Round-trip with `fflate.unzipSync`: two files come back byte-identical; with no files and no failures the result is a valid empty ZIP; with one failure `NOT-INCLUDED.txt` contains `IMG_9.heic` and its reason and is absent when there are none.
- [ ] **Step 2:** Run: FAIL. **Step 3:** Implement with `zipSync`. **Step 4:** Run: PASS. Commit `feat(core): ZIP bundling with failure note`.

---

### Task 8: Decoding

**Files:**
- Create: `src/core/decode.ts`, `tests/fixtures/` (see step 4)
- Test: `tests/core/decode.test.ts`

**Interfaces:**
- Consumes: `Pixels`.
- Produces:
  - `type SourceKind = 'heic' | 'jpeg' | 'png' | 'webp'`
  - `sniffKind(name: string, type: string, head: Uint8Array): SourceKind | null`: bytes decide first (`ftyp` at offset 4 with brand `heic`, `heix`, `hevc`, `mif1`, `msf1` or `heif`; JPEG `FF D8 FF`; PNG signature; `RIFF....WEBP`); if the bytes are unrecognised, fall back to MIME type then extension (case-insensitive); otherwise `null`.
  - `fitWithin(width: number, height: number, max: number): { w: number; h: number }`: scale down to fit, never up, never below 1.
  - `decodeFile(file: File): Promise<Pixels>`: reads the first 32 bytes, calls `sniffKind`, rejects with `Error("Couldn't read this file")` on `null`; HEIC goes through `heic-to` (imported on demand) to a PNG blob; all kinds then go through `createImageBitmap` (orientation from the image) and are drawn at `fitWithin(…, 4096)`.

- [ ] **Step 1: Write failing tests** (Node, byte arrays only). Review Focus 1: HEIC bytes with `type: ''` and name `IMG_1.HEIC` give `'heic'`; the same with name `photo.jpg` still give `'heic'`; JPEG bytes named `x.png` give `'jpeg'`; unrecognised bytes with type `image/heic` give `'heic'`; unrecognised bytes, empty type, name `notes.txt` give `null`. `fitWithin(8000,6000,4096)` is `{w:4096,h:3072}`; `(100,50,4096)` unchanged; `(1,10000,4096)` is `{w:1,h:4096}`.
- [ ] **Step 2:** Run: FAIL. **Step 3:** Implement. Use `OffscreenCanvas` when present, otherwise a hidden `<canvas>`.
- [ ] **Step 4:** Add fixtures: an iPhone portrait HEIC of equipment, a rotated JPG, a transparent PNG. **Strip location and camera metadata from every fixture first** (the repository is public). Ask the owner for the HEIC.
- [ ] **Step 5:** Run unit tests: PASS. `decodeFile` is exercised against the fixtures in Task 16. Commit `feat(core): file sniffing and decoding`.

---

### Task 9: Segmentation behind a stable interface

**Files:**
- Create: `src/core/segment-logic.ts`, `src/core/segment.ts`, `src/core/segment.worker.ts`, `scripts/copy-models.mjs`
- Test: `tests/core/segment-logic.test.ts`

**Interfaces:**
- Consumes: `Pixels`, `Mask`, `resizeMask` (Task 4), `resize` (Task 5); the engine decision from Task 2.
- Produces:
  - `type Engine = (input: Pixels) => Promise<Mask>`
  - `class SegmentError extends Error`
  - `segmentWith(engine: Engine, p: Pixels, opts?: { inputLongSide?: number }): Promise<Mask>`: shrinks `p` so its long side is at most `inputLongSide` (default 1024), calls `engine`, resizes the returned mask to `p`'s size; if `engine` rejects, retries once with long side 512; a second rejection throws `SegmentError("Not enough memory to remove this background")`.
  - `type Progress = { stage: 'download' | 'inference'; fraction: number }`
  - `interface Segmenter { removeBackground(p: Pixels, onProgress: (e: Progress) => void): Promise<Mask>; modelReady(): Promise<boolean> }`
  - `createSegmenter(): Segmenter`: spawns `segment.worker.ts`, serialises requests, uses `segmentWith` inside the worker with the engine from Task 2; `modelReady()` is true when the model files are already in the browser cache.

- [ ] **Step 1: Write failing tests** with a fake engine. A 4000 x 3000 input reaches the engine with long side 1024 and the returned mask is 4000 x 3000. An engine that rejects once is called again with long side 512 and the call resolves. An engine that rejects twice rejects with `SegmentError`. A 500 x 400 input is passed through unshrunk.
- [ ] **Step 2:** Run: FAIL. **Step 3:** Implement `segment-logic.ts`.
- [ ] **Step 4:** Implement the worker and `createSegmenter` for the engine chosen in Task 2. `scripts/copy-models.mjs` copies the engine's model and WASM files from `node_modules` to `public/models`; set the engine's public path to `import.meta.env.BASE_URL + 'models/'`. Run it from `prebuild` and `predev`.
- [ ] **Step 5:** Run unit tests: PASS; run `npm run build` and confirm `dist/models` exists. Commit `feat(core): segmentation interface with worker and retry`.

---

### Task 10: Pipeline and summary

**Files:**
- Create: `src/core/pipeline.ts`
- Test: `tests/core/pipeline.test.ts`

**Interfaces:**
- Consumes: everything in `src/core` above.
- Produces:
  - `interface PictureData { name: string; original: Pixels; mask: Mask | null; crop: Rect | null }`
  - `summarize(s: Settings, hasHeic: boolean): string`
  - `renderOutputs(pic: PictureData, s: Settings): OutputFile[]`: applies the mask when `removeBackground` is on and a mask exists; with `makeIcon` off returns one PNG named `plain` or `cutout`; with `makeIcon` on, runs `makeIcon` at `s.size` for PNG and SVG, and at 256 for the ICO source; only the formats in `s.formats`; throws `NothingLeftError` when nothing is visible.
  - `buildDownloadAll(pics: PictureData[], s: Settings, date: Date): { zip: Uint8Array; name: string; failures: { picture: string; reason: string }[] }`: renders each picture, collects failures, de-duplicates names across the batch, builds the ZIP.

- [ ] **Step 1: Write failing tests.**
  - `summarize(DEFAULT_SETTINGS, true)` is `This will: convert HEIC, save as PNG.`; with `hasHeic: false`, `This will: convert, save as PNG.`; `{removeBackground, makeIcon, size 256, formats png}` gives `This will: convert HEIC, remove background, make a 256 px icon, save as PNG.`; formats `['png','ico','svg']` end `save as PNG, ICO and SVG.`; `['png','ico']` end `save as PNG and ICO.`
  - `renderOutputs` on a 40 x 20 opaque picture: defaults give one file `name.png`; `removeBackground` with a mask gives `name-cutout.png` whose corners are transparent where the mask is 0; `makeIcon` with all three formats gives `name-icon-256.png`, `name-icon.ico`, `name-icon-256.svg`; `makeIcon` with `['png']` gives one file; a fully transparent mask with `makeIcon` throws `NothingLeftError`.
  - `buildDownloadAll` with three pictures where the second is fully transparent: ZIP holds outputs for the first and third, `failures` has one entry for the second with reason `Nothing left after background removal`, and the ZIP contains `NOT-INCLUDED.txt`; two pictures with the same name give `a.png` and `a-2.png`.
- [ ] **Step 2:** Run: FAIL. **Step 3:** Implement. **Step 4:** Run: PASS. Commit `feat(core): pipeline, summary and batch download`.

---

### Task 11: UI shell and store

**Files:**
- Create: `src/ui/store.ts`, `src/ui/dropzone.ts`, `src/ui/thumbnails.ts`, `src/ui/preview.ts`, `src/ui/steps.ts`, `src/ui/styles.css`; modify `src/main.ts`, `index.html`
- Test: `tests/core/store.test.ts`

**Interfaces:**
- Consumes: `Settings`, `PictureData`, `decodeFile`, `createSegmenter`, `summarize`, `normalizeSettings`.
- Produces:
  - `type Status = 'waiting' | 'working' | 'done' | 'failed'`
  - `interface Picture extends PictureData { id: string; status: Status; error?: string; progress?: number }`
  - `createStore(): Store` with `getState(): { pictures: Picture[]; selectedId: string | null; settings: Settings; modelState: 'unknown' | 'downloading' | 'ready' | 'failed' }`, `subscribe(fn): () => void`, `addPicture(p)`, `removePicture(id)`, `select(id)`, `setSettings(patch)` (always passes through `normalizeSettings`), `updatePicture(id, patch)`.

- [ ] **Step 1: Write failing tests.** Adding two pictures selects the first; removing the selected one selects a neighbour, and removing the last gives `selectedId: null`; `setSettings({ size: 5000 })` stores 2048; turning `makeIcon` off removes `ico` and `svg` from `formats`; subscribers are called once per change and can unsubscribe.
- [ ] **Step 2:** Run: FAIL. **Step 3:** Implement the store.
- [ ] **Step 4:** Build the screen to the layout in the spec: drop zone (drop, picker, paste; accepts `image/*,.heic,.heif`), thumbnail strip with status and remove button, before/after preview with checkerboard behind "after", the three labelled step cards, Save-as checkboxes (ICO and SVG disabled while Make icon is off; SVG carries the "wrapped bitmap, not a traced vector" note), the "This will:" line, and two download buttons. Processing runs sequentially: decode on add; segment when Remove background is on and the picture has no mask, with a per-picture progress bar.
- [ ] **Step 5:** Wire the error table: unreadable file shows "Couldn't read this file" on its thumbnail; model download failure shows "Background removal needs a one-time download. Check your connection and try again." with a Retry button while Convert and Make icon keep working; "Nothing left after background removal" appears on the picture.
- [ ] **Step 6:** Run `npm test` and `npm run typecheck`: PASS. Run `npm run dev` and check on desktop and in a phone-width window: layout, 44 px touch targets, labels, keyboard focus. Commit `feat(ui): single-screen pipeline interface`.

---

### Task 12: Touch-up editor

**Files:**
- Create: `src/ui/touchup.ts`; modify `src/ui/steps.ts`, `src/ui/styles.css`

**Interfaces:**
- Consumes: `paintDab`, `MaskHistory`, `applyMask`, store.
- Produces: `openTouchUp(picture: Picture, onDone: (mask: Mask) => void): void`.

- [ ] **Step 1:** Full-screen overlay with a canvas showing the picture over a checkerboard through the current mask, Erase and Restore tools, brush size slider, Undo, Done, Cancel. Pointer events handle mouse, finger and Pencil. Pan and zoom by wheel, pinch and two-finger drag; a single touch paints.
- [ ] **Step 2:** On pointer down call `history.beginStroke()`; interpolate dabs between pointer moves so fast strokes leave no gaps; on pointer up call `endStroke()`. Cancel undoes every stroke made in the session and closes. Done passes the edited mask back and the preview refreshes.
- [ ] **Step 3:** The Touch up button is enabled only when the selected picture has a mask.
- [ ] **Step 4:** Manual check on a desktop browser with a mouse; finger and Pencil are checked in Task 16's checklist. Commit `feat(ui): touch-up editor`.

---

### Task 13: Crop editor

**Files:**
- Create: `src/ui/crop.ts`; modify `src/ui/steps.ts`

**Interfaces:**
- Consumes: `clampCrop`, store.
- Produces: `openCrop(picture: Picture, onDone: (crop: Rect | null) => void): void`.

- [ ] **Step 1:** Overlay showing the picture with a draggable, resizable box (corner and edge handles, at least 44 px hit areas) and buttons Apply, Reset (automatic framing, calls `onDone(null)`) and Cancel.
- [ ] **Step 2:** The returned rect goes through `clampCrop`; a box under 1 px is treated as no crop. The step card shows "Crop: manual" or "Crop: automatic".
- [ ] **Step 3:** Manual check with mouse and touch emulation. Commit `feat(ui): manual crop editor`.

---

### Task 14: Delivery and sharing

**Files:**
- Create: `src/ui/deliver.ts`; modify `src/ui/steps.ts`
- Test: `tests/core/deliver.test.ts`

**Interfaces:**
- Consumes: `OutputFile`.
- Produces: `deliver(files: OutputFile[], deps?: { nav: Pick<Navigator, 'canShare' | 'share'>; download: (file: File) => void }): Promise<'shared' | 'downloaded' | 'cancelled'>`.

- [ ] **Step 1: Write failing tests** with fake deps. When `canShare({files})` is true and `share` resolves: `'shared'`, no download. When `share` rejects with `AbortError`: `'cancelled'`, no download, no error. When `canShare` is missing or false: `download` is called once per file and the result is `'downloaded'`. When `share` rejects with any other error: falls back to download.
- [ ] **Step 2:** Run: FAIL. **Step 3:** Implement; default `download` uses a temporary `<a download>` and revokes the object URL. **Step 4:** Run: PASS.
- [ ] **Step 5:** Connect both buttons: "Download this one" delivers `renderOutputs` for the selected picture; "Download all (ZIP)" delivers `buildDownloadAll` and shows a message listing any failures. Commit `feat(ui): share-sheet delivery with download fallback`.

---

### Task 15: Offline and installable

**Files:**
- Modify: `vite.config.ts`, `index.html`, `src/main.ts`, `src/core/segment.ts`
- Create: `public/icons/*.png` (180, 192, 512), `scripts/make-app-icons.ts`

**Interfaces:**
- Consumes: `encodePng`, `Segmenter.modelReady`.
- Produces: a web app manifest named "Icon Maker", a service worker that precaches the app shell and caches `models/` files on first use (cache-first, named `icon-maker-models`).

- [ ] **Step 1:** Configure `vite-plugin-pwa`: manifest (name, `display: standalone`, icons, `start_url` and `scope` from the base path), precache the app shell, runtime cache-first for `/models/` requests; raise the precache size limit only if the shell needs it. Add `<link rel="apple-touch-icon">` and iOS meta tags.
- [ ] **Step 2:** `scripts/make-app-icons.ts` draws a simple placeholder icon (rounded square with a cut-out corner) with `encodePng`; run once and commit the PNGs.
- [ ] **Step 3:** Call `navigator.storage.persist()` after the model first downloads. When the model is not cached and `navigator.onLine` is false, the Remove background card shows "Needs a one-time download. Connect to the internet once to set it up." and the switch is disabled.
- [ ] **Step 4:** Build and serve (`npm run build && npx vite preview`); in Chromium DevTools confirm the app installs, reload offline, and a model fetched earlier is served from cache. Commit `feat: installable PWA with offline model cache`.

---

### Task 16: End-to-end tests, checklist, README

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/convert.spec.ts`, `tests/e2e/icon.spec.ts`, `tests/e2e/offline.spec.ts`, `docs/release-checklist.md`, `README.md`

- [ ] **Step 1:** Install Playwright with Chromium and WebKit; the config serves `vite preview`.
- [ ] **Step 2: `convert.spec.ts`.** Load the HEIC fixture, defaults, Download: the file is `<name>.png`, starts with the PNG signature, and its height exceeds its width for the portrait fixture (not sideways). A text file added with the HEIC shows "Couldn't read this file" on its own thumbnail while the HEIC still converts. Run on both browsers.
- [ ] **Step 3: `icon.spec.ts`.** Make icon on, formats PNG + ICO + SVG, size 128: three files with the names in the spec; the ICO header count is 6; the SVG contains `width="128"`. Chromium only: with Remove background on and the real model, a fixture of gear on a plain background yields a PNG whose corner pixel is transparent (timeout 180 s). Touch-up: dragging the Erase brush across the centre makes those pixels transparent in the preview canvas.
- [ ] **Step 4: `offline.spec.ts`.** In a fresh context set offline: the Remove background card shows the one-time-download message. In a warmed context (model fetched once), go offline, reload, run removal on a small fixture: succeeds.
- [ ] **Step 5:** Write `docs/release-checklist.md` from the spec's manual list: HEIC from Photos; removal; touch-up with finger and Apple Pencil; crop; save to Files; launch offline from the home screen; load the PNG into NovaFlow as an equipment picture. Write `README.md`: what the tool does, how to install it on iPhone (Share, Add to Home Screen), the three steps in plain words, the AGPL note for the segmentation library, development commands.
- [ ] **Step 6:** Run `npm test`, `npx playwright test`, `npm run build`: all PASS. Push, confirm the Pages deployment, and have the owner run the checklist on the iPhone and iPad. Commit `test: end-to-end suite, release checklist and README`.

---

## Self-review notes

- Spec coverage: screen and steps (Tasks 11 to 13), defaults and naming (3), formats (6), batch and ZIP (7, 10, 14), persistence (15), architecture modules (3 to 10), engine risk and fallback (2, 9), error table (5, 9, 10, 11, 14, 15), testing and manual checklist (all, 16), out of scope respected.
- Type names are used as defined in Task 3 throughout (`Pixels`, `Mask`, `Rect`, `Settings`, `OutputFile`, `NothingLeftError`).
- One decision the spec left open and this plan fixes: the Task 2 pass threshold (three 12 MP photos, no tab reload, 60 seconds or less after the first run).
