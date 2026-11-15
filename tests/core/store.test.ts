import { describe, expect, test, vi } from 'vitest';
import { createStore } from '../../src/ui/store';
import { DEFAULT_SETTINGS } from '../../src/core/types';

function storeWith(...names: string[]) {
  const store = createStore();
  const ids = names.map((name) => store.addPicture({ name }));
  return { store, ids };
}

describe('pictures', () => {
  test('adding two pictures selects the first', () => {
    const { store, ids } = storeWith('a.jpg', 'b.jpg');
    expect(store.getState().pictures.map((p) => p.name)).toEqual(['a.jpg', 'b.jpg']);
    expect(store.getState().selectedId).toBe(ids[0]);
  });

  test('a new picture starts waiting, with no mask or crop', () => {
    const { store, ids } = storeWith('a.jpg');
    const p = store.getState().pictures[0]!;
    expect(p).toMatchObject({ id: ids[0], status: 'waiting', original: null, mask: null, crop: null, isHeic: false });
  });

  test('removing the selected picture selects its neighbour', () => {
    const { store, ids } = storeWith('a', 'b', 'c');
    store.select(ids[1]!);
    store.removePicture(ids[1]!);
    expect(store.getState().selectedId).toBe(ids[2]);
  });

  test('removing the selected last picture selects the one before it', () => {
    const { store, ids } = storeWith('a', 'b');
    store.select(ids[1]!);
    store.removePicture(ids[1]!);
    expect(store.getState().selectedId).toBe(ids[0]);
  });

  test('removing the only picture leaves nothing selected', () => {
    const { store, ids } = storeWith('a');
    store.removePicture(ids[0]!);
    expect(store.getState().selectedId).toBeNull();
    expect(store.getState().pictures).toEqual([]);
  });

  test('removing another picture keeps the selection', () => {
    const { store, ids } = storeWith('a', 'b');
    store.removePicture(ids[1]!);
    expect(store.getState().selectedId).toBe(ids[0]);
  });

  test('selecting an unknown id is ignored', () => {
    const { store, ids } = storeWith('a');
    store.select('nope');
    expect(store.getState().selectedId).toBe(ids[0]);
  });

  test('updatePicture changes only that picture and ignores unknown ids', () => {
    const { store, ids } = storeWith('a', 'b');
    store.updatePicture(ids[0]!, { status: 'working', progress: 0.5 });
    store.updatePicture('nope', { status: 'failed' });
    const [a, b] = store.getState().pictures;
    expect([a!.status, a!.progress, b!.status]).toEqual(['working', 0.5, 'waiting']);
  });
});

describe('settings', () => {
  test('start as the defaults', () => {
    expect(createStore().getState().settings).toEqual(DEFAULT_SETTINGS);
  });
  test('an out of range size is clamped', () => {
    const store = createStore();
    store.setSettings({ size: 5000 });
    expect(store.getState().settings.size).toBe(2048);
  });
  test('turning Make icon off drops ico and svg', () => {
    const store = createStore();
    store.setSettings({ makeIcon: true, formats: ['png', 'ico', 'svg'] });
    expect(store.getState().settings.formats).toEqual(['png', 'ico', 'svg']);
    store.setSettings({ makeIcon: false });
    expect(store.getState().settings.formats).toEqual(['png']);
  });
});

describe('subscriptions', () => {
  test('subscribers hear each change once and can unsubscribe', () => {
    const store = createStore();
    const seen = vi.fn();
    const off = store.subscribe(seen);
    store.setSettings({ size: 128 });
    expect(seen).toHaveBeenCalledTimes(1);
    store.addPicture({ name: 'a' });
    expect(seen).toHaveBeenCalledTimes(2);
    off();
    store.setSettings({ size: 64 });
    expect(seen).toHaveBeenCalledTimes(2);
  });
  test('model state changes are announced', () => {
    const store = createStore();
    const seen = vi.fn();
    store.subscribe(seen);
    store.setModelState('downloading');
    expect(store.getState().modelState).toBe('downloading');
    expect(seen).toHaveBeenCalledTimes(1);
  });
});

describe('connection', () => {
  test('starts online and announces changes', () => {
    const store = createStore();
    expect(store.getState().online).toBe(true);
    const seen = vi.fn();
    store.subscribe(seen);
    store.setOnline(false);
    expect(store.getState().online).toBe(false);
    expect(seen).toHaveBeenCalledTimes(1);
  });
});
