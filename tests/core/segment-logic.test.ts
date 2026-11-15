import { describe, expect, test } from 'vitest';
import { alphaFromEngineOutput, SegmentError, segmentWith, type Engine } from '../../src/core/segment-logic';
import type { Pixels } from '../../src/core/types';
import { fullMask, solid } from './helpers';

function recordingEngine(failures = 0) {
  const seen: { width: number; height: number }[] = [];
  let remaining = failures;
  const engine: Engine = async (input: Pixels) => {
    seen.push({ width: input.width, height: input.height });
    if (remaining-- > 0) throw new Error('out of memory');
    return fullMask(input.width, input.height, 200);
  };
  return { engine, seen };
}

describe('segmentWith', () => {
  test('a large picture is shrunk for the model and the mask is scaled back up', async () => {
    const { engine, seen } = recordingEngine();
    const mask = await segmentWith(engine, solid(4000, 3000, [1, 2, 3, 255]));
    expect(seen).toEqual([{ width: 1024, height: 768 }]);
    expect(mask.width).toBe(4000);
    expect(mask.height).toBe(3000);
    expect(mask.data.length).toBe(4000 * 3000);
    expect(mask.data[0]).toBe(200);
    expect(mask.data[mask.data.length - 1]).toBe(200);
  });

  test('a small picture is passed through at its own size', async () => {
    const { engine, seen } = recordingEngine();
    const mask = await segmentWith(engine, solid(500, 400, [0, 0, 0, 255]));
    expect(seen).toEqual([{ width: 500, height: 400 }]);
    expect(mask.width).toBe(500);
  });

  test('one failure is retried at half the size', async () => {
    const { engine, seen } = recordingEngine(1);
    const mask = await segmentWith(engine, solid(2000, 1000, [0, 0, 0, 255]));
    expect(seen).toEqual([
      { width: 1024, height: 512 },
      { width: 512, height: 256 },
    ]);
    expect(mask.width).toBe(2000);
    expect(mask.height).toBe(1000);
  });

  test('two failures give a SegmentError with a plain message', async () => {
    const { engine, seen } = recordingEngine(2);
    const attempt = segmentWith(engine, solid(2000, 1000, [0, 0, 0, 255]));
    await expect(attempt).rejects.toBeInstanceOf(SegmentError);
    await expect(attempt).rejects.toThrow('Not enough memory to remove this background');
    expect(seen.length).toBe(2);
  });

  test('the model input size can be set', async () => {
    const { engine, seen } = recordingEngine();
    await segmentWith(engine, solid(800, 800, [0, 0, 0, 255]), { inputLongSide: 400 });
    expect(seen).toEqual([{ width: 400, height: 400 }]);
  });

  test('a mask of the wrong size from the engine is still scaled to the picture', async () => {
    const engine: Engine = async () => fullMask(10, 10, 77);
    const mask = await segmentWith(engine, solid(300, 200, [0, 0, 0, 255]));
    expect([mask.width, mask.height, mask.data[0]]).toEqual([300, 200, 77]);
  });
});

describe('alphaFromEngineOutput', () => {
  test('takes every fourth byte when the library returns RGBA', () => {
    const rgba = new Uint8Array([255, 255, 255, 10, 255, 255, 255, 200]);
    expect(Array.from(alphaFromEngineOutput(rgba, 2, 1).data)).toEqual([10, 200]);
  });
  test('uses the bytes as they are when they are already one per pixel', () => {
    expect(Array.from(alphaFromEngineOutput(new Uint8Array([7, 9]), 2, 1).data)).toEqual([7, 9]);
  });
  test('any other length is an error', () => {
    expect(() => alphaFromEngineOutput(new Uint8Array(5), 2, 1)).toThrow();
  });
});

describe('SegmentError cause', () => {
  test('keeps the last error the engine threw, so the real reason is not lost', async () => {
    const engine: Engine = async () => {
      throw new Error('session failed: bad input shape');
    };
    const err = await segmentWith(engine, solid(100, 100, [0, 0, 0, 255])).catch((e) => e);
    expect(err).toBeInstanceOf(SegmentError);
    expect(String((err as SegmentError).cause)).toContain('session failed: bad input shape');
  });
});
