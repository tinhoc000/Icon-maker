# Icon Maker

Turns photos into clean icons, in the browser, on a PC or an iPhone/iPad. Pictures never leave your device.

It does three things, in this order, and you choose which to use:

1. **Convert**: reads iPhone HEIC photos (and JPG, PNG, WebP) and saves them as PNG. Always on.
2. **Remove background**: cuts the subject out so the rest is transparent. A **Touch up** brush fixes leftovers.
3. **Make icon**: makes a square, centred, resized picture. **Crop** lets you choose the area by hand.

Save as **PNG**, **ICO** (a Windows icon holding 16 to 256 px) and/or **SVG**. The SVG wraps the PNG as a
bitmap; it is not a traced vector, so it will not scale sharper than the PNG. A line above the download
buttons says exactly what will happen, for example: *This will: convert HEIC, remove background, make a 256 px icon, save as PNG.*

Add several pictures at once; **Download all (ZIP)** saves them together. A picture that cannot be processed is
left out and listed in `NOT-INCLUDED.txt` inside the ZIP.

## Use on iPhone or iPad

Open the site in Safari, tap **Share**, then **Add to Home Screen**. After the first visit it works offline.
The first time you switch on **Remove background**, the app downloads its model (about 100 MB, one time) and keeps it.
Downloads go through the share sheet, so you can choose **Save to Files** or **Save Image**.

## Use the icons in NovaFlow

Make an icon with **Remove background** and **Make icon** on, save the PNG, then add it as an equipment
picture in NovaFlow. NovaFlow reads PNG, JPG, WebP and GIF; it does not read ICO or SVG files as pictures.

## Development

```
npm install
npm run dev          # first run downloads the model files into public/models (about 100 MB, then cached)
npm test             # unit tests for src/core and the store
npm run test:e2e     # browser tests in Chromium and WebKit (builds the app first)
npm run build        # type-check and build into dist/
```

- All image logic is in `src/core` and works on plain pixel arrays, so it is tested without a browser.
  `src/ui` is the screen. Background removal runs in a Web Worker (`src/core/segment.worker.ts`).
- The design and the plan are in `docs/superpowers/specs` and `docs/superpowers/plans`.
- The HEIC browser test runs only if you add a HEIC as `tests/fixtures/sample.heic`. That folder is
  git-ignored on purpose: phone photos can contain your location.
- The model files are downloaded at build time and checked against `scripts/models.lock.json` (committed). After a
  deliberate upgrade of `@imgly/background-removal`, review the change, then run `npm run models:lock` and commit the lock.
- The page has a Content-Security-Policy (in `index.html`) so injected script cannot run or send data elsewhere.
  If a new feature needs a new kind of resource, widen it there on purpose.
- Test pages can reach the app's store as `window.__iconMaker` (like `window.__novaflow` in NovaFlow).

## Publish on GitHub Pages

1. Create a **public** GitHub repository and push this project to its `main` branch.
2. In the repository, open **Settings, Pages** and set **Source** to **GitHub Actions**.
3. The workflow in `.github/workflows/deploy.yml` runs the unit tests, builds, and publishes.
   The site address is `https://<your-name>.github.io/<repository-name>/`.
4. Before relying on it, run `docs/release-checklist.md` on your iPhone and iPad.

## Licences

Background removal uses [`@imgly/background-removal`](https://github.com/imgly/background-removal-js), which is
licensed AGPL-3.0, together with the model files it downloads. Keep the repository public, and check their
licence terms before using the tool commercially. HEIC decoding uses `heic-to` (libheif).
