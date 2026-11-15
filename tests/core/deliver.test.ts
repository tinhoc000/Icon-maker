import { describe, expect, test, vi } from 'vitest';
import { deliver, shouldShare } from '../../src/ui/deliver';
import type { OutputFile } from '../../src/core/types';

const files: OutputFile[] = [
  { name: 'a.png', data: new Uint8Array([1, 2, 3]), mime: 'image/png' },
  { name: 'a.ico', data: new Uint8Array([4]), mime: 'image/x-icon' },
];

function abort() {
  return Object.assign(new Error('cancelled'), { name: 'AbortError' });
}

describe('deliver', () => {
  test('shares the files when sharing is wanted and supported', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const download = vi.fn();
    const result = await deliver(files, { nav: { canShare: () => true, share }, download, preferShare: true });
    expect(result).toBe('shared');
    expect(download).not.toHaveBeenCalled();
    const shared = share.mock.calls[0]![0].files as File[];
    expect(shared.map((f) => f.name)).toEqual(['a.png', 'a.ico']);
    expect(shared[0]!.type).toBe('image/png');
    expect(shared[0]!.size).toBe(3);
  });

  test('a cancelled share is not an error and does not download', async () => {
    const download = vi.fn();
    const nav = { canShare: () => true, share: vi.fn().mockRejectedValue(abort()) };
    expect(await deliver(files, { nav, download, preferShare: true })).toBe('cancelled');
    expect(download).not.toHaveBeenCalled();
  });

  test('without share support each file is downloaded', async () => {
    const download = vi.fn();
    expect(await deliver(files, { nav: {}, download, preferShare: true })).toBe('downloaded');
    expect(download).toHaveBeenCalledTimes(2);
    expect((download.mock.calls[1]![0] as File).name).toBe('a.ico');
  });

  test('when the browser says it cannot share these files, they are downloaded', async () => {
    const download = vi.fn();
    const nav = { canShare: () => false, share: vi.fn() };
    expect(await deliver(files, { nav, download, preferShare: true })).toBe('downloaded');
    expect(nav.share).not.toHaveBeenCalled();
    expect(download).toHaveBeenCalledTimes(2);
  });

  test('any other share failure falls back to downloading', async () => {
    const download = vi.fn();
    const nav = { canShare: () => true, share: vi.fn().mockRejectedValue(new Error('NotAllowedError')) };
    expect(await deliver(files, { nav, download, preferShare: true })).toBe('downloaded');
    expect(download).toHaveBeenCalledTimes(2);
  });

  test('when sharing is not wanted (desktop) files are downloaded without touching share', async () => {
    const download = vi.fn();
    const nav = { canShare: vi.fn(() => true), share: vi.fn() };
    expect(await deliver(files, { nav, download, preferShare: false })).toBe('downloaded');
    expect(nav.share).not.toHaveBeenCalled();
    expect(download).toHaveBeenCalledTimes(2);
  });
});

describe('shouldShare', () => {
  test('iPhone', () => {
    expect(shouldShare({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', maxTouchPoints: 5 })).toBe(true);
  });
  test('iPad using the desktop-style user agent', () => {
    expect(shouldShare({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5 })).toBe(true);
  });
  test('a Mac without a touch screen', () => {
    expect(shouldShare({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 0 })).toBe(false);
  });
  test('Windows', () => {
    expect(shouldShare({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130', maxTouchPoints: 10 })).toBe(false);
  });
});
