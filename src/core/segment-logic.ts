import { fitWithin } from './decode';
import { resize } from './icon';
import { resizeMask } from './mask';
import type { Mask, Pixels } from './types';

/** Something that can turn a (small) picture into a foreground mask. */
export type Engine = (input: Pixels) => Promise<Mask>;

export class SegmentError extends Error {
  constructor(message = 'Not enough memory to remove this background') {
    super(message);
    this.name = 'SegmentError';
  }
}

/** Long side of the picture handed to the model. */
export const MODEL_INPUT_SIDE = 1024;

/**
 * Runs an engine on a reduced copy of the picture and scales the mask back
 * up. If the engine fails, tries once more at half the size before giving up.
 */
export async function segmentWith(
  engine: Engine,
  p: Pixels,
  opts: { inputLongSide?: number } = {},
): Promise<Mask> {
  const first = opts.inputLongSide ?? MODEL_INPUT_SIDE;
  for (const side of [first, Math.max(1, Math.round(first / 2))]) {
    const { w, h } = fitWithin(p.width, p.height, side);
    const input = w === p.width && h === p.height ? p : resize(p, w, h);
    try {
      const mask = await engine(input);
      return resizeMask(mask, p.width, p.height);
    } catch {
      // fall through to the smaller attempt
    }
  }
  throw new SegmentError();
}

/**
 * The model library hands back either one alpha byte per pixel or full RGBA
 * (its alpha-only format still carries all four channels). Returns the alpha
 * as a mask either way.
 */
export function alphaFromEngineOutput(bytes: Uint8Array, width: number, height: number): Mask {
  const n = width * height;
  if (bytes.length === n) return { width, height, data: bytes };
  if (bytes.length === n * 4) {
    const data = new Uint8Array(n);
    for (let i = 0; i < n; i++) data[i] = bytes[i * 4 + 3]!;
    return { width, height, data };
  }
  throw new Error(`Unexpected mask size: ${bytes.length} bytes for ${width}x${height}`);
}
