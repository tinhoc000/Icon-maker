import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gearFile, makeJpeg, withExifOrientation } from './fixtures';
import { addPictures, collectDownloads, pngOf } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('a plain conversion downloads a PNG at the original size', async ({ page }) => {
  await addPictures(page, [gearFile()]);
  await expect(page.locator('.summary')).toHaveText('This will: convert, save as PNG.');
  const [file] = await collectDownloads(page, 'Download this one', 1);
  expect(file!.suggestedFilename()).toBe('gear.png');
  const png = await pngOf(file!);
  expect([png.width, png.height]).toEqual([600, 400]);
});

test('an unreadable file shows a message and does not block the others', async ({ page }) => {
  await addPictures(page, [gearFile(), { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') }]);
  const statuses = await page.locator('.thumb').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.status));
  expect(statuses).toEqual(['done', 'failed']);
  await expect(page.locator('.thumb-select').nth(1)).toHaveAttribute('aria-label', /Couldn't read this file/);
  const [file] = await collectDownloads(page, 'Download this one', 1);
  expect(file!.suggestedFilename()).toBe('gear.png');
});

test('a phone JPEG that is stored sideways comes out upright', async ({ page }) => {
  const jpeg = withExifOrientation(await makeJpeg(page, 60, 40), 6); // 6 = rotate 90 degrees clockwise
  await addPictures(page, [{ name: 'IMG_0001.JPG', mimeType: 'image/jpeg', buffer: jpeg }]);
  const [file] = await collectDownloads(page, 'Download this one', 1);
  expect(file!.suggestedFilename()).toBe('IMG_0001.png');
  const png = await pngOf(file!);
  expect([png.width, png.height]).toEqual([40, 60]);
});

test('a file with no MIME type and an upper-case extension is still read', async ({ page }) => {
  await addPictures(page, [{ name: 'PHOTO.PNG', mimeType: '', buffer: gearFile().buffer }]);
  const [file] = await collectDownloads(page, 'Download this one', 1);
  expect(file!.suggestedFilename()).toBe('PHOTO.png');
});

const HEIC = fileURLToPath(new URL('../fixtures/sample.heic', import.meta.url));
test('an iPhone HEIC photo converts to PNG', async ({ page }) => {
  test.skip(!existsSync(HEIC), 'Add a HEIC (location data removed) as tests/fixtures/sample.heic to run this test.');
  await addPictures(page, [HEIC]);
  await expect(page.locator('.summary')).toHaveText('This will: convert HEIC, save as PNG.');
  const [file] = await collectDownloads(page, 'Download this one', 1);
  expect(file!.suggestedFilename()).toBe('sample.png');
  const png = await pngOf(file!);
  expect(png.width).toBeGreaterThan(0);
});
