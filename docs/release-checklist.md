# Release checklist (real devices)

Run this on your iPhone and your iPad, on the deployed site, before relying on a release.
Automated tests cover the logic and Chromium/WebKit on a PC; they cannot cover a phone's memory limits,
the Photos picker, Apple Pencil, or the share sheet.

Use three real photos from the camera (full 12 MP): one **HEIC** from Photos, one of black equipment on a
dark surface, and one **portrait** (held upright) so you can see whether it comes out sideways.

## 1. Memory test for background removal (do this first)

This decides whether the background-removal engine is good enough on phones. The plan's pass mark:

- [ ] Remove background on all three photos, one after another, **without Safari reloading or crashing the tab**.
- [ ] Each photo takes **60 seconds or less** after the first one (the first includes the model download).
- [ ] Note the model download size and time: ______ MB, ______ s. Note the time per photo: ______ s.

If it fails, tell the developer which device and photo. The engine sits behind one file
(`src/core/segment.worker.ts`), so it can be swapped for a smaller model without changing the screen.
Background removal runs single-threaded on GitHub Pages (it cannot send the headers multi-threading needs),
so expect it to be slower than on a PC.

## 2. Everyday checks

- [ ] **HEIC from Photos:** choose the HEIC; the thumbnail shows **Ready**; the line says "convert HEIC".
- [ ] **Upright:** the portrait photo is the right way up in the preview and in the saved PNG.
- [ ] **Remove background:** the subject is cut out; the "After" side shows a chequerboard behind it.
- [ ] **Touch up with a finger:** Erase removes a leftover; Restore brings back a cut-off part; Undo works;
      pinch zooms; two fingers move the picture; Cancel leaves the result as it was.
- [ ] **Touch up with Apple Pencil (iPad):** the same, with the Pencil.
- [ ] **Crop:** drag the box and its corners with a finger; Apply changes the icon; Reset goes back to automatic.
- [ ] **Make icon:** PNG, ICO and SVG saved at the size you chose; the SVG note is visible.
- [ ] **Save to Files:** Download this one opens the share sheet; Save to Files puts the files where you expect.
- [ ] **Download all (ZIP):** the ZIP opens in Files; an unreadable file is listed in `NOT-INCLUDED.txt`.
- [ ] **Offline from the home screen:** add to Home Screen, turn on aeroplane mode, open it from the Home Screen:
      the app loads, HEIC conversion works, and background removal works (the model was downloaded earlier).
- [ ] **Offline before the model was downloaded** (use a second device or clear site data first): the Remove
      background card says it needs a one-time download and the switch is off.
- [ ] Rotate the device: nothing is cut off, buttons are easy to tap.

## 3. NovaFlow

- [ ] Make an icon with Remove background and Make icon on; save the PNG.
- [ ] In NovaFlow, add it as an equipment picture; it appears with a transparent background and looks sharp.

## Result

Date: ______  Device and iOS/iPadOS version: ______  Passed all: yes / no  Notes: ______
