/** RGBA picture, 4 bytes per pixel, not premultiplied. */
export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** One byte per pixel: 0 = removed, 255 = kept. */
export interface Mask {
  width: number;
  height: number;
  data: Uint8Array;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Format = 'png' | 'ico' | 'svg';

export interface Settings {
  removeBackground: boolean;
  makeIcon: boolean;
  size: number;
  paddingPct: number;
  formats: Format[];
}

export const DEFAULT_SETTINGS: Settings = {
  removeBackground: false,
  makeIcon: false,
  size: 256,
  paddingPct: 8,
  formats: ['png'],
};

export const SIZE_MIN = 16;
export const SIZE_MAX = 2048;
export const SIZE_CHOICES = [64, 128, 256, 512, 1024] as const;
export const PADDING_CHOICES = [0, 4, 8, 16] as const;

export interface OutputFile {
  name: string;
  data: Uint8Array;
  mime: string;
}

export class NothingLeftError extends Error {
  constructor() {
    super('Nothing left after background removal');
    this.name = 'NothingLeftError';
  }
}
