import { expect, test } from '@playwright/test';
import { gearFile, gearPng } from './fixtures';
import { addPictures, injectFullMask, toggle } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('the Before picture comes back after visiting a picture that could not be read', async ({ page }) => {
  await addPictures(page, [gearFile(), { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') }]);
  const before = page.locator('.preview-canvas[aria-label="Original picture"]');
  await expect.poll(() => before.evaluate((c) => (c as HTMLCanvasElement).width)).toBe(600);
  await page.locator('.thumb-select').nth(1).click();
  await expect.poll(() => before.evaluate((c) => (c as HTMLCanvasElement).width)).toBe(1); // the unreadable one has nothing to show
  await page.locator('.thumb-select').nth(0).click();
  await expect.poll(() => before.evaluate((c) => (c as HTMLCanvasElement).width)).toBe(600);
});

test('typing a custom size is not overwritten when the app updates in the background', async ({ page }) => {
  await toggle(page, 'Make icon').click();
  await page.locator('#icon-size').selectOption('custom');
  const custom = page.locator('#icon-size-custom');
  await custom.click();
  await custom.fill('');
  await page.keyboard.type('3');
  await page.evaluate(() => window.__iconMaker!.store.setModelState('unknown')); // any background update
  await page.keyboard.type('00');
  await expect(custom).toHaveValue('300');
});

test('dropping a picture anywhere on the page adds it instead of leaving the app', async ({ page }) => {
  const b64 = gearPng().toString('base64');
  const dataTransfer = await page.evaluateHandle((data) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'dropped.png', { type: 'image/png' }));
    return dt;
  }, b64);
  await page.dispatchEvent('.app-header', 'dragover', { dataTransfer });
  await page.dispatchEvent('.app-header', 'drop', { dataTransfer });
  await expect(page.locator('.thumb')).toHaveCount(1);
  await expect(page.locator('.thumb-select').first()).toHaveAttribute('aria-label', /dropped\.png/);
});

test('the page refuses script injected into it (content security policy)', async ({ page }) => {
  const ran = await page.evaluate(() => {
    const s = document.createElement('script');
    s.textContent = 'window.__injected = 1';
    document.head.append(s);
    return (window as unknown as { __injected?: number }).__injected;
  });
  expect(ran).toBeUndefined();
});

test.describe('Chromium only', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'uses Chromium touch input and an iPhone user agent');

  test.describe('touch', () => {
    test.use({ hasTouch: true });

    test('starting a pinch in Touch up does not leave a hole in the mask', async ({ page }) => {
      await addPictures(page, [gearFile()]);
      await injectFullMask(page);
      await page.getByRole('button', { name: 'Touch up…' }).click();
      const box = (await page.locator('.tu-viewport').boundingBox())!;
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      const cdp = await page.context().newCDPSession(page);
      const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: { x: number; y: number; id: number }[]) =>
        cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
      await touch('touchStart', [{ x: cx, y: cy, id: 1 }]);
      await touch('touchStart', [{ x: cx, y: cy, id: 1 }, { x: cx + 60, y: cy, id: 2 }]);
      await touch('touchMove', [{ x: cx - 30, y: cy, id: 1 }, { x: cx + 90, y: cy, id: 2 }]);
      await touch('touchEnd', []);

      await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
      await page.getByRole('button', { name: 'Done' }).click();
      const holes = await page.evaluate(() => window.__iconMaker!.store.getState().pictures[0]!.mask!.data.filter((v) => v === 0).length);
      expect(holes).toBe(0);
    });
  });

  test.describe('iPhone share sheet', () => {
    test.use({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    });

    test('when the share sheet needs another tap, the app asks for one and then shares', async ({ page }) => {
      await page.addInitScript(() => {
        const w = window as unknown as { __calls: number; __shared?: string[] };
        w.__calls = 0;
        Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
        Object.defineProperty(navigator, 'share', {
          configurable: true,
          value: async (data: { files: File[] }) => {
            w.__calls++;
            if (w.__calls === 1) throw Object.assign(new Error('needs a fresh tap'), { name: 'NotAllowedError' });
            w.__shared = data.files.map((f) => f.name);
          },
        });
      });
      await page.goto('/');
      await addPictures(page, [gearFile()]);
      await page.getByRole('button', { name: 'Download this one' }).click();
      const again = page.getByRole('button', { name: 'Tap to save' });
      await expect(again).toBeVisible();
      await expect(page.locator('.save .card-msg')).not.toContainText('Saved');
      await again.click();
      await expect.poll(() => page.evaluate(() => (window as unknown as { __calls: number }).__calls)).toBe(2);
      expect(await page.evaluate(() => (window as unknown as { __shared?: string[] }).__shared)).toEqual(['gear.png']);
      await expect(again).toBeHidden();
    });
  });
});
