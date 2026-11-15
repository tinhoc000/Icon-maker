import { strFromU8, unzipSync } from 'fflate';
import { expect, test } from 'vitest';
import { buildZip } from '../../src/core/zip';

const file = (name: string, bytes: number[]) => ({ name, data: new Uint8Array(bytes), mime: 'image/png' });

test('files come back byte-identical', () => {
  const back = unzipSync(buildZip([file('a.png', [1, 2, 3]), file('b.ico', [9, 8])], []));
  expect(Object.keys(back).sort()).toEqual(['a.png', 'b.ico']);
  expect(Array.from(back['a.png']!)).toEqual([1, 2, 3]);
  expect(Array.from(back['b.ico']!)).toEqual([9, 8]);
});

test('nothing in gives a valid empty ZIP', () => {
  expect(Object.keys(unzipSync(buildZip([], [])))).toEqual([]);
});

test('failures are listed in NOT-INCLUDED.txt', () => {
  const back = unzipSync(buildZip([file('a.png', [1])], [{ picture: 'IMG_9.heic', reason: "Couldn't read this file" }]));
  const note = strFromU8(back['NOT-INCLUDED.txt']!);
  expect(note).toContain('IMG_9.heic');
  expect(note).toContain("Couldn't read this file");
  expect(Object.keys(back)).toContain('a.png');
});

test('no note when nothing failed', () => {
  expect(Object.keys(unzipSync(buildZip([file('a.png', [1])], [])))).toEqual(['a.png']);
});
