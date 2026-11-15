import { expect, test } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { GEAR_BOX, gearFile } from './fixtures';
import { addPictures, collectDownloads, injectFullMask, pngOf, readDownload, toggle } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('Make icon saves PNG, ICO and SVG with the names the spec gives', async ({ page }) => {
  await addPictures(page, [gearFile()]);
  await toggle(page, 'Make icon').click();
  await page.locator('#icon-size').selectOption('128');
  await page.locator('label.check', { hasText: 'ICO' }).click();
  await page.locator('label.check', { hasText: 'SVG' }).click();
  await expect(page.locator('.summary')).toHaveText('This will: convert, make a 128 px icon, save as PNG, ICO and SVG.');

  const files = await collectDownloads(page, 'Download this one', 3);
  expect(files.map((f) => f.suggestedFilename())).toEqual(['gear-icon-128.png', 'gear-icon.ico', 'gear-icon-128.svg']);
  const png = await pngOf(files[0]!);
  expect([png.width, png.height]).toEqual([128, 128]);
  const ico = await readDownload(files[1]!);
  expect(ico.readUInt16LE(2)).toBe(1);
  expect(ico.readUInt16LE(4)).toBe(6);
  expect(strFromU8(new Uint8Array(await readDownload(files[2]!)))).toContain('width="128"');
});

test('ICO and SVG are only offered with Make icon', async ({ page }) => {
  const ico = page.locator('label.check', { hasText: 'ICO' }).locator('input');
  await expect(ico).toBeDisabled();
  await toggle(page, 'Make icon').click();
  await expect(ico).toBeEnabled();
});

test('a custom size outside the range is brought back to 16 to 2048', async ({ page }) => {
  await toggle(page, 'Make icon').click();
  await page.locator('#icon-size').selectOption('custom');
  const custom = page.locator('#icon-size-custom');
  await custom.fill('5000');
  await custom.blur();
  await expect(custom).toHaveValue('2048');
  await custom.fill('3');
  await custom.blur();
  await expect(custom).toHaveValue('16');
  await expect(page.locator('.summary')).toContainText('16 px icon');
});

test('Download all gives one ZIP and lists pictures that were left out', async ({ page }) => {
  await addPictures(page, [gearFile(), { name: 'bad.heic', mimeType: 'image/heic', buffer: Buffer.from('nope') }]);
  const [zip] = await collectDownloads(page, 'Download all (ZIP)', 1);
  expect(zip!.suggestedFilename()).toMatch(/^icons-\d{4}-\d{2}-\d{2}\.zip$/);
  const entries = unzipSync(new Uint8Array(await readDownload(zip!)));
  expect(Object.keys(entries).sort()).toEqual(['NOT-INCLUDED.txt', 'gear.png']);
  expect(strFromU8(entries['NOT-INCLUDED.txt']!)).toContain("bad.heic: Couldn't read this file");
});

test('the same picture added twice gets two different file names', async ({ page }) => {
  await addPictures(page, [gearFile(), gearFile()]);
  const [zip] = await collectDownloads(page, 'Download all (ZIP)', 1);
  const entries = unzipSync(new Uint8Array(await readDownload(zip!)));
  expect(Object.keys(entries).sort()).toEqual(['gear-2.png', 'gear.png']);
});

test.describe('editors (Chromium)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'pointer-driven editors are checked in Chromium');

  test('Touch up: the Erase brush makes the painted area transparent', async ({ page }) => {
    await addPictures(page, [gearFile()]);
    await injectFullMask(page);
    await page.getByRole('button', { name: 'Touch up…' }).click();
    const box = (await page.locator('.tu-viewport').boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.5, { steps: 12 });
    await page.mouse.up();
    await page.getByRole('button', { name: 'Done' }).click();

    const mask = await page.evaluate(() => {
      const m = window.__iconMaker!.store.getState().pictures[0]!.mask!;
      const at = (fx: number, fy: number) => m.data[Math.floor(m.height * fy) * m.width + Math.floor(m.width * fx)];
      return { centre: at(0.5, 0.5), corner: at(0.05, 0.05), size: [m.width, m.height] };
    });
    expect(mask).toEqual({ centre: 0, corner: 255, size: [600, 400] });
  });

  test('Touch up: Cancel leaves the mask alone and Undo takes a stroke back', async ({ page }) => {
    await addPictures(page, [gearFile()]);
    await injectFullMask(page);
    await page.getByRole('button', { name: 'Touch up…' }).click();
    const box = (await page.locator('.tu-viewport').boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5, { steps: 5 });
    await page.mouse.up();
    await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('.touchup')).toHaveCount(0);
    const erased = await page.evaluate(() => window.__iconMaker!.store.getState().pictures[0]!.mask!.data.some((v) => v === 0));
    expect(erased).toBe(false);
  });

  test('Crop: dragging the corners limits the icon to the chosen area', async ({ page }) => {
    await addPictures(page, [gearFile()]);
    await toggle(page, 'Make icon').click();
    await page.getByRole('button', { name: 'Crop…' }).click();
    await expect(page.locator('.cr-info')).toHaveText('600 × 400 px');
    const wrap = (await page.locator('.cr-wrap').boundingBox())!;
    const centre = async (h: string) => {
      const b = (await page.locator(`.cr-handle[data-h=${h}]`).boundingBox())!;
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    };
    for (const [handle, fx, fy] of [['nw', 0.25, 0.25], ['se', 0.75, 0.75]] as const) {
      const from = await centre(handle);
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(wrap.x + wrap.width * fx, wrap.y + wrap.height * fy, { steps: 8 });
      await page.mouse.up();
    }
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.locator('.crop-state')).toHaveText('Crop: manual');
    const crop = (await page.evaluate(() => window.__iconMaker!.store.getState().pictures[0]!.crop))!;
    expect(Math.abs(crop.x - GEAR_BOX.x0)).toBeLessThanOrEqual(4);
    expect(Math.abs(crop.y - GEAR_BOX.y0)).toBeLessThanOrEqual(4);
    expect(Math.abs(crop.w - (GEAR_BOX.x1 - GEAR_BOX.x0))).toBeLessThanOrEqual(6);

    const [file] = await collectDownloads(page, 'Download this one', 1);
    const png = await pngOf(file!);
    // The icon is made from the orange box, so the middle is orange.
    const mid = (png.height / 2) * png.width * 4 + (png.width / 2) * 4;
    expect(Array.from(png.rgba.slice(mid, mid + 3))).toEqual([230, 120, 30]);
  });

  test('Crop: Reset returns to automatic framing', async ({ page }) => {
    await addPictures(page, [gearFile()]);
    await toggle(page, 'Make icon').click();
    await page.getByRole('button', { name: 'Crop…' }).click();
    await page.locator('.cr-box').focus();
    await page.keyboard.press('ArrowRight');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.locator('.crop-state')).toHaveText('Crop: manual');
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(page.locator('.crop-state')).toHaveText('Crop: automatic');
  });

  test('real background removal cuts the subject out, and the icon has a clear corner', async ({ page }) => {
    test.setTimeout(240_000);
    await addPictures(page, [gearFile()]);
    await toggle(page, 'Remove background').click();
    await page.waitForFunction(() => window.__iconMaker!.store.getState().pictures[0]!.status === 'done' && !!window.__iconMaker!.store.getState().pictures[0]!.mask, null, { timeout: 200_000 });
    const mask = await page.evaluate(() => {
      const m = window.__iconMaker!.store.getState().pictures[0]!.mask!;
      const at = (fx: number, fy: number) => m.data[Math.floor(m.height * fy) * m.width + Math.floor(m.width * fx)];
      return { centre: at(0.5, 0.5)!, corner: at(0.03, 0.03)! };
    });
    expect(mask.centre).toBeGreaterThan(200);
    expect(mask.corner).toBeLessThan(40);

    const [cutout] = await collectDownloads(page, 'Download this one', 1);
    expect(cutout!.suggestedFilename()).toBe('gear-cutout.png');
    const cut = await pngOf(cutout!);
    expect(cut.rgba[3]).toBeLessThan(40); // top-left pixel is clear

    await toggle(page, 'Make icon').click();
    const [icon] = await collectDownloads(page, 'Download this one', 1);
    expect(icon!.suggestedFilename()).toBe('gear-icon-256.png');
    const png = await pngOf(icon!);
    expect([png.width, png.height]).toEqual([256, 256]);
    expect(png.rgba[3]).toBe(0); // corner of the icon is clear
  });
});
