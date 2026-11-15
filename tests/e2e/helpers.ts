import { expect, type Download, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { readPng } from '../core/png-helpers';

type Upload = string | { name: string; mimeType: string; buffer: Buffer };

/** Adds pictures through the drop zone's file picker and waits until none is busy. */
export async function addPictures(page: Page, files: Upload[]): Promise<void> {
  const payload = files.map((f) =>
    typeof f === 'string' ? { name: basename(f), mimeType: '', buffer: readFileSync(f) } : f,
  );
  await page.locator('input[type=file]').first().setInputFiles(payload);
  await expect(page.locator('.thumb')).toHaveCount(files.length);
  await page.waitForFunction(() => document.querySelectorAll('.thumb[data-status=working]').length === 0);
}

export const toggle = (page: Page, label: string) => page.locator('label.switch', { hasText: label });

/** Clicks a download button and returns every file the page saves in response. */
export async function collectDownloads(page: Page, button: string, expected: number): Promise<Download[]> {
  const downloads: Download[] = [];
  const onDownload = (d: Download) => downloads.push(d);
  page.on('download', onDownload);
  await page.getByRole('button', { name: button }).click();
  await expect.poll(() => downloads.length).toBe(expected);
  page.off('download', onDownload);
  return downloads;
}

export async function readDownload(d: Download): Promise<Buffer> {
  return readFileSync((await d.path())!);
}

export async function pngOf(d: Download) {
  return readPng(new Uint8Array(await readDownload(d)));
}

/** Gives the first picture a mask that keeps everything, so touch-up can be driven without the model. */
export async function injectFullMask(page: Page): Promise<void> {
  await page.evaluate(() => {
    const { store } = window.__iconMaker!;
    const p = store.getState().pictures[0]!;
    const { width, height } = p.original!;
    store.updatePicture(p.id, { mask: { width, height, data: new Uint8Array(width * height).fill(255) } });
    store.setSettings({ removeBackground: true });
  });
}
