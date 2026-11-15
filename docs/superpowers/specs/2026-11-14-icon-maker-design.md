# Icon Maker: design

Date: 2026-11-14
Status: awaiting owner review

## Purpose

A browser tool that turns photos into clean icons for the NovaFlow diagram editor
(`Documents\Software\novaflow_web_app`). The typical job: photograph a piece of AV gear with an
iPhone, cut it out of its background, and get a transparent square PNG to use as an equipment
picture in NovaFlow.

It has three functions, usable alone or together:

1. **Convert**: read iPhone HEIC/HEIF (and JPG, PNG, WebP) and save as PNG.
2. **Remove background**: cut the subject out so the rest is transparent.
3. **Make icon**: square, centred, resized; saved as PNG, ICO and/or SVG.

### What the owner asked for

- Works on a Windows laptop/PC and on iPhone and iPad.
- All processing in the browser; photos are never uploaded.
- One pipeline on one screen, with each function clearly named so it is obvious what is applied.
- Icon output as PNG plus ICO plus SVG.
- Multiple files at once, a touch-up brush, and manual crop.
- Hosted on GitHub Pages, installable to the home screen, working offline after the first visit.
- Built with Vite and TypeScript, no UI framework.

### Assumptions

- PNG is the output that matters for NovaFlow, which imports PNG, JPEG, WebP and GIF only
  (`src/02-body.html` lines 18 and 428) and stores pictures as data URLs inside the project file.
  ICO and SVG are for other uses.
- This is a standalone tool in its own repository, not a feature inside NovaFlow or Signage
  Project Manager.
- The GitHub repository is public.

### Success

From the phone, photo to NovaFlow-ready icon in under a minute, with nothing uploaded.

## Screen

One screen. Single column on a phone; on a PC the preview sits beside the steps.

```
+------------------------------------------------+
| Icon Maker                          [Install]  |
+------------------------------------------------+
| [ Drop pictures here, or tap to choose ]       |
| Accepts: HEIC, JPG, PNG, WebP                  |
+------------------------------------------------+
| Pictures (3)   [img1*] [img2] [img3]  [+ Add]  |
+------------------------------------------------+
|   BEFORE (original)   |   AFTER (result)       |
|                       |   checkerboard = clear |
+------------------------------------------------+
| STEP 1  Convert                    always on   |
|   Reads iPhone HEIC and other photos.          |
+------------------------------------------------+
| STEP 2  Remove background             [ on ]   |
|   Cuts the subject out; the rest goes clear.   |
|   [Touch up...]                                |
+------------------------------------------------+
| STEP 3  Make icon                     [ on ]   |
|   Square, centred, resized.                    |
|   Size [256 v]  Padding [8% v]  [Crop...]      |
+------------------------------------------------+
| SAVE AS   [x] PNG   [ ] ICO   [ ] SVG          |
+------------------------------------------------+
| This will: convert HEIC, remove background,    |
| make a 256 px icon, save as PNG.               |
| [ Download this one ]  [ Download all (ZIP) ]  |
+------------------------------------------------+
```

Each step is a labelled card with a one-line explanation. A plain-language summary ("This will:
...") sits above the download buttons and is generated from the same settings object the pipeline
runs, so the label cannot disagree with what happens.

## Behaviour

### Convert (always on)

- Accepts HEIC/HEIF, JPG, PNG and WebP, by drop, file picker, or paste. Other types are rejected
  per file.
- Respects photo orientation.
- The working copy is capped at 4096 px on the long side; larger pictures are scaled down on load.
- With steps 2 and 3 off, the download is a PNG at the working size. This is the HEIC to PNG
  converter.

### Remove background (off by default)

- Switching it on for the first time downloads the model, with a progress bar. The model is then
  cached on the device and works offline.
- Runs once per picture, with per-picture progress, one picture at a time.
- The result is a mask stored beside the original pixels. Later setting changes never rerun it.

### Touch up

- Available on the selected picture once it has a mask.
- Full-screen editor: Erase brush, Restore brush, brush size slider, pinch or scroll to zoom,
  two-finger or space-drag to pan, Undo, Done, Cancel.
- Edits the mask only; original pixels are untouched, so Restore always works.
- Works with finger, Apple Pencil and mouse (pointer events).

### Make icon (off by default)

- Default framing: trim to the subject's bounding box (non-transparent pixels), centre on a
  transparent square, add padding, resize. If the picture has no transparency, the whole picture is
  fitted into the square.
- Sizes: 64, 128, 256 (default), 512, 1024, or a custom value from 16 to 2048.
- Padding: 0, 4, 8 (default), 16 percent of the square.
- **Crop** opens a drag box on the selected picture to choose the area by hand; it replaces the
  automatic bounding box for that picture. Reset returns to automatic.

### Save as

- **PNG**: always available. The icon at the chosen size, or the full picture if Make icon is off.
- **ICO**: only when Make icon is on. One file containing 16, 32, 48, 64, 128 and 256 px images,
  each stored as PNG, regardless of the chosen size.
- **SVG**: only when Make icon is on. An SVG file of the chosen size embedding the PNG as a data
  URL. It is a wrapped bitmap, not a traced vector, and the screen says so.
- At least one format must be selected; PNG is selected by default.

### Multiple pictures

- Step switches, size, padding and formats apply to all pictures.
- Touch-up and manual crop are per picture, on the selected thumbnail.
- Thumbnails show status: waiting, working, done, failed. A picture can be removed from the list.
- **Download this one** saves the selected picture's outputs (several files if several formats).
- **Download all** saves one ZIP of every successful picture's outputs.
- On iPhone and iPad, downloads go through the share sheet (Web Share with files) when available,
  falling back to a normal download link.

### File names

- Plain conversion: `IMG_1234.HEIC` → `IMG_1234.png`
- Background removed, no icon: `IMG_1234-cutout.png`
- Icon: `IMG_1234-icon-256.png`, `IMG_1234-icon.ico`, `IMG_1234-icon-256.svg`
- ZIP: `icons-YYYY-MM-DD.zip`. Duplicate names inside a ZIP get `-2`, `-3`.

### Persistence

Only the app shell and the model are stored on the device (service worker cache). Pictures, masks
and settings live in memory and are gone when the tab closes.

## Architecture

Vite + TypeScript, no UI framework. Static output deployed to GitHub Pages by a GitHub Action on
push to `main`. `vite-plugin-pwa` generates the service worker and manifest.

Everything under `src/core` is free of DOM layout code and testable alone.

| Module | Job | Depends on |
|---|---|---|
| `core/decode` | File → pixels. Browser decoder for JPG/PNG/WebP; `heic-to` for HEIC, loaded on demand. Applies orientation and the 4096 px cap. | `heic-to` |
| `core/segment` | Pixels → mask via `removeBackground(image): Promise<Mask>`. Library hidden behind this interface. Runs in a Web Worker. Feeds the model a reduced copy (about 1024 px long side) and scales the mask up. Reports model-download and inference progress. | segmentation library |
| `core/mask` | Apply a mask to pixels; apply brush strokes (erase/restore) to a mask; undo history. | none |
| `core/icon` | Bounding box, crop, padding, square, high-quality downscale. | none |
| `core/encode` | Write PNG, multi-size ICO (hand-written encoder), SVG wrapper. | none |
| `core/zip` | Bundle outputs into a ZIP. | `fflate` |
| `core/naming` | Output file names and de-duplication. | none |
| `core/pipeline` | Run decode → segment → mask → icon → encode for one picture from a settings object; build the "This will:" summary from the same settings. | the above |
| `ui/*` | Drop zone, thumbnail strip, before/after preview, step cards, touch-up editor, crop editor, download/share. | `core/pipeline` |

### State per picture

Original pixels (working size), optional mask, optional manual crop box, status, error message.
Outputs are generated on Download, not stored.

### Background-removal engine

- Default: `@imgly/background-removal` (AGPL-3.0, acceptable in a public repository), with its
  model and WASM files served from the app's own origin so they can be cached for offline use.
- Risk: Safari on iPhone can kill a tab that holds a large photo and model weights together.
  Reports of this are anecdotal, so it is tested first.
- **First implementation task:** a throwaway test page run on the owner's iPhone and iPad with
  real 12 MP photos, measuring whether it completes, how long it takes, and the download size.
- Fallback if it fails: Transformers.js with a smaller model whose licence is confirmed on its
  model card before use. Only `core/segment` changes.

## Error handling

Messages are plain language, shown on the affected picture; nothing fails silently.

| Situation | Behaviour |
|---|---|
| Unreadable or unsupported file | Thumbnail shows "Couldn't read this file". Other pictures carry on. |
| Model download fails or is interrupted | "Background removal needs a one-time download. Check your connection and try again." with Retry. Convert and Make icon keep working. |
| Offline and the model was never downloaded | The Remove background card says so before the user tries. |
| Out of memory or inference error | Retry once at a lower model input size, then mark the picture failed with a message. |
| One picture fails in a batch | The rest continue. The ZIP holds what succeeded; a note lists what did not. |
| Nothing to trim (fully transparent result) | Make icon reports "Nothing left after background removal" for that picture. |
| Sharing unavailable or cancelled | Fall back to a download link; a cancelled share is not an error. |

## Testing

- **Unit (Vitest)**, for `src/core`: ICO output parses back with the six expected sizes; bounding
  box, crop and padding maths; mask brush strokes and undo; file naming and de-duplication; summary
  text for each settings combination; pipeline run with a fake segmenter; ZIP contents.
- **Fixtures**: a real iPhone HEIC, a rotated JPG, a PNG with transparency.
- **Browser (Playwright, Chromium and WebKit)**: load a picture, toggle steps, download, check the
  output files; a failed file does not block the others.
- **Manual checklist on the real iPhone and iPad** before each release: HEIC from Photos;
  background removal; touch-up with a finger; crop; save to Files; launch offline from the home
  screen; load the resulting PNG into NovaFlow as an equipment picture.

## Out of scope for version 1

- True vector tracing for SVG.
- Output formats other than PNG, ICO and SVG.
- Saving pictures or settings between visits.
- Sending results directly into NovaFlow.
- Per-picture step settings (steps are shared across the batch).
