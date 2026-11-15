import { expect, test } from '@playwright/test';
import { gearFile } from './fixtures';
import { addPictures, toggle } from './helpers';

test.skip(({ browserName }) => browserName !== 'chromium', 'offline checks use Chromium service-worker controls');

async function controlled(page: import('@playwright/test').Page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
}

test('before the model is downloaded, offline says what to do and blocks the switch', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');
  await controlled(page);
  await page.waitForTimeout(1500); // let the app files finish caching
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.dropzone')).toBeVisible();
  await expect(toggle(page, 'Remove background').locator('input')).toBeDisabled();
  await expect(page.locator('.card-msg').first()).toHaveText('Needs a one-time download. Connect to the internet once to set it up.');
  // Plain conversion still works offline.
  await addPictures(page, [gearFile()]);
  await expect(page.locator('.thumb').first()).toHaveAttribute('data-status', 'done');
  await context.close();
});

test('after the model was fetched once, background removal works offline', async ({ browser }) => {
  test.setTimeout(300_000);
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');
  await controlled(page);

  await addPictures(page, [gearFile()]);
  await toggle(page, 'Remove background').click();
  await page.waitForFunction(() => !!window.__iconMaker!.store.getState().pictures[0]?.mask, null, { timeout: 240_000 });

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.dropzone')).toBeVisible();
  await page.waitForFunction(() => window.__iconMaker!.store.getState().modelState === 'ready');
  await expect(toggle(page, 'Remove background').locator('input')).toBeEnabled();

  await addPictures(page, [gearFile()]);
  await toggle(page, 'Remove background').click();
  await page.waitForFunction(() => !!window.__iconMaker!.store.getState().pictures[0]?.mask, null, { timeout: 240_000 });
  await context.close();
});
