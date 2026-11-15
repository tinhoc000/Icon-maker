import { describe, expect, test } from 'vitest';
import { isModelChunk, isModelManifest } from '../../src/pwa-caching';

describe('model caching rules', () => {
  const manifest = new URL('https://x.github.io/icon-maker/models/resources.json');
  const chunk = new URL('https://x.github.io/icon-maker/models/9bd2256393c4c4fc.');
  test('the manifest is fetched fresh when online, so a library upgrade is noticed', () => {
    expect(isModelManifest({ url: manifest })).toBe(true);
    expect(isModelChunk({ url: manifest })).toBe(false);
  });
  test('hash-named chunks never change, so they are cached for good', () => {
    expect(isModelChunk({ url: chunk })).toBe(true);
    expect(isModelManifest({ url: chunk })).toBe(false);
  });
  test('other files are neither', () => {
    const page = new URL('https://x.github.io/icon-maker/assets/index.js');
    expect(isModelChunk({ url: page }) || isModelManifest({ url: page })).toBe(false);
  });
});
