import type { Pixels } from './types';

export type SourceKind = 'heic' | 'jpeg' | 'png' | 'webp';

/** Longest side of the working copy, in pixels. Larger pictures are scaled down on load. */
export const MAX_WORKING_SIDE = 4096;

export const UNREADABLE = "Couldn't read this file";

const HEIF_BRANDS = ['heic', 'heix', 'hevc', 'mif1', 'msf1', 'heif'];
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function ascii(b: Uint8Array, start: number, end: number): string {
  return b.length >= end ? String.fromCharCode(...b.subarray(start, end)) : '';
}

/** Works out what a file really is: its bytes first, then its MIME type, then its extension. */
export function sniffKind(name: string, type: string, head: Uint8Array): SourceKind | null {
  if (ascii(head, 4, 8) === 'ftyp') {
    // An ISO media file: only HEIF brands are pictures we handle; anything else is video or audio.
    return HEIF_BRANDS.includes(ascii(head, 8, 12)) ? 'heic' : null;
  }
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpeg';
  if (head.length >= 8 && PNG_SIGNATURE.every((v, i) => head[i] === v)) return 'png';
  if (ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 12) === 'WEBP') return 'webp';

  const mime = type.toLowerCase();
  if (mime === 'image/heic' || mime === 'image/heif') return 'heic';
  if (mime === 'image/jpeg') return 'jpeg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';

  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
  if (ext === 'heic' || ext === 'heif') return 'heic';
  if (ext === 'jpg' || ext === 'jpeg') return 'jpeg';
  if (ext === 'png') return 'png';
  if (ext === 'webp') return 'webp';
  return null;
}

/** Scales a size down to fit within max on its long side. Never scales up, never below 1. */
export function fitWithin(width: number, height: number, max: number): { w: number; h: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { w: Math.max(1, Math.round(width * scale)), h: Math.max(1, Math.round(height * scale)) };
}

/** Upright bitmap from the browser's own decoder. Older Safari rejects the orientation option. */
async function nativeBitmap(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return createImageBitmap(file);
  }
}

async function toBitmap(file: Blob, kind: SourceKind): Promise<ImageBitmap> {
  if (kind === 'heic') {
    // Safari can decode HEIC itself, which is faster and lighter than the bundled decoder.
    try {
      return await nativeBitmap(file);
    } catch {
      const { heicTo } = await import('heic-to/csp');
      return (await heicTo({ blob: file, type: 'bitmap' })) as ImageBitmap;
    }
  }
  return nativeBitmap(file);
}

function bitmapToPixels(bitmap: ImageBitmap): Pixels {
  const { w, h } = fitWithin(bitmap.width, bitmap.height, MAX_WORKING_SIDE);
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(w, h)
      : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) throw new Error(UNREADABLE);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  const image = ctx.getImageData(0, 0, w, h);
  canvas.width = canvas.height = 0; // release canvas memory promptly (matters on iPhone)
  return { width: w, height: h, data: image.data };
}

async function readHead(file: Blob): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, 32).arrayBuffer());
}

/** Reads a picture file into pixels, upright and capped at MAX_WORKING_SIDE. */
export async function decodeFile(file: File): Promise<Pixels> {
  let bitmap: ImageBitmap | null = null;
  try {
    const kind = sniffKind(file.name, file.type, await readHead(file));
    if (!kind) throw new Error(UNREADABLE);
    bitmap = await toBitmap(file, kind);
    return bitmapToPixels(bitmap);
  } catch {
    throw new Error(UNREADABLE);
  } finally {
    bitmap?.close();
  }
}

/** True when the file is HEIC/HEIF (used for the "convert HEIC" wording). */
export async function isHeicFile(file: File): Promise<boolean> {
  try {
    return sniffKind(file.name, file.type, await readHead(file)) === 'heic';
  } catch {
    return false;
  }
}
