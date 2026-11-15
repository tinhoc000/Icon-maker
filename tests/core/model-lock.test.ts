import { describe, expect, test } from 'vitest';
import { checkChunk } from '../../scripts/lock.mjs';

const lock = { version: '1.7.0', chunks: { abc: 'f'.repeat(64) } };

describe('checkChunk', () => {
  test('a chunk that matches the committed hash passes', () => {
    expect(() => checkChunk(lock, 'abc', 'f'.repeat(64))).not.toThrow();
  });
  test('a chunk whose content changed is rejected', () => {
    expect(() => checkChunk(lock, 'abc', '0'.repeat(64))).toThrow(/does not match/);
  });
  test('a chunk that is not in the lock is rejected, with the way to update it', () => {
    expect(() => checkChunk(lock, 'new', 'f'.repeat(64))).toThrow(/models:lock/);
  });
});
