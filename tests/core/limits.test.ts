import { describe, expect, test } from 'vitest';
import { batchWarning } from '../../src/ui/limits';

describe('batchWarning', () => {
  test('a few pictures on a phone: no warning', () => {
    expect(batchWarning(8, true)).toBe('');
  });
  test('many pictures on a phone: advise smaller groups', () => {
    expect(batchWarning(9, true)).toMatch(/smaller groups/);
  });
  test('a computer has more memory: no warning', () => {
    expect(batchWarning(40, false)).toBe('');
  });
});
