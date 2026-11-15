import { normalizeSettings } from '../core/naming';
import type { PictureData } from '../core/pipeline';
import { DEFAULT_SETTINGS, type Mask, type Pixels, type Rect, type Settings } from '../core/types';

export type Status = 'waiting' | 'working' | 'done' | 'failed';
export type ModelState = 'unknown' | 'downloading' | 'ready' | 'failed';

export interface Picture {
  id: string;
  name: string;
  /** Null until the file has been read, and for files that could not be read. */
  original: Pixels | null;
  mask: Mask | null;
  crop: Rect | null;
  isHeic: boolean;
  status: Status;
  error?: string;
  /** 0 to 1 while working. */
  progress?: number;
  /** What the picture is busy with, for the thumbnail label. */
  stage?: string;
}

export interface State {
  pictures: Picture[];
  selectedId: string | null;
  settings: Settings;
  modelState: ModelState;
}

export interface NewPicture {
  name: string;
  isHeic?: boolean;
  original?: Pixels | null;
  status?: Status;
}

export interface Store {
  getState(): State;
  subscribe(fn: (s: State) => void): () => void;
  addPicture(p: NewPicture): string;
  removePicture(id: string): void;
  select(id: string): void;
  setSettings(patch: Partial<Settings>): void;
  updatePicture(id: string, patch: Partial<Picture>): void;
  setModelState(m: ModelState): void;
}

/** The part of a picture the pipeline needs, or null while it has no pixels. */
export function toPictureData(p: Picture): PictureData | null {
  return p.original ? { name: p.name, original: p.original, mask: p.mask, crop: p.crop } : null;
}

export function createStore(): Store {
  let state: State = { pictures: [], selectedId: null, settings: { ...DEFAULT_SETTINGS }, modelState: 'unknown' };
  const listeners = new Set<(s: State) => void>();
  let counter = 0;

  const set = (next: State) => {
    state = next;
    for (const fn of [...listeners]) fn(state);
  };

  return {
    getState: () => state,

    subscribe(fn) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },

    addPicture(init) {
      const id = `p${++counter}`;
      const picture: Picture = {
        id,
        name: init.name,
        original: init.original ?? null,
        mask: null,
        crop: null,
        isHeic: init.isHeic ?? false,
        status: init.status ?? 'waiting',
      };
      set({ ...state, pictures: [...state.pictures, picture], selectedId: state.selectedId ?? id });
      return id;
    },

    removePicture(id) {
      const index = state.pictures.findIndex((p) => p.id === id);
      if (index < 0) return;
      const pictures = state.pictures.filter((p) => p.id !== id);
      let selectedId = state.selectedId;
      if (selectedId === id) selectedId = pictures[Math.min(index, pictures.length - 1)]?.id ?? null;
      set({ ...state, pictures, selectedId });
    },

    select(id) {
      if (!state.pictures.some((p) => p.id === id)) return;
      set({ ...state, selectedId: id });
    },

    setSettings(patch) {
      set({ ...state, settings: normalizeSettings({ ...state.settings, ...patch }) });
    },

    updatePicture(id, patch) {
      if (!state.pictures.some((p) => p.id === id)) return;
      set({ ...state, pictures: state.pictures.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
    },

    setModelState(modelState) {
      set({ ...state, modelState });
    },
  };
}
