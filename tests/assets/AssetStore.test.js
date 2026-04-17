import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AssetStore } from '../../src/assets/AssetStore.js';
import { AssetManifest, ASSET_CATEGORY, ASSET_SOURCE } from '../../src/assets/AssetManifest.js';

function createLocalStorageStub() {
  const store = {};
  return {
    getItem: vi.fn((key) => store[key] ?? null),
    setItem: vi.fn((key, val) => { store[key] = val; }),
    removeItem: vi.fn((key) => { delete store[key]; }),
    _store: store,
  };
}

function stubFetch(data) {
  return vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(data) }));
}

describe('AssetStore', () => {
  let manifest;
  let store;
  let originalFetch;
  let originalLocalStorage;

  beforeEach(async () => {
    originalFetch = globalThis.fetch;
    originalLocalStorage = globalThis.localStorage;
    globalThis.localStorage = createLocalStorageStub();
    globalThis.fetch = stubFetch({});

    manifest = new AssetManifest('test_manifest');
    await manifest.init();
    store = new AssetStore(manifest, 'test_data');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.localStorage = originalLocalStorage;
  });

  it('save persists data to localStorage and updates manifest', () => {
    store.save(ASSET_CATEGORY.OBJECTS, 'obj1', 'Object 1', { type: 'enemy' });

    expect(globalThis.localStorage.setItem).toHaveBeenCalledWith(
      'test_data:objects:obj1',
      JSON.stringify({ type: 'enemy' })
    );

    const entry = manifest.get(ASSET_CATEGORY.OBJECTS, 'obj1');
    expect(entry).not.toBe(null);
    expect(entry.name).toBe('Object 1');
  });

  it('load returns data from cache', async () => {
    store.save(ASSET_CATEGORY.OBJECTS, 'obj1', 'Object 1', { type: 'enemy' });
    const data = await store.load(ASSET_CATEGORY.OBJECTS, 'obj1');
    expect(data).toEqual({ type: 'enemy' });
  });

  it('load returns data from localStorage', async () => {
    globalThis.localStorage._store['test_data:objects:obj2'] = JSON.stringify({ type: 'wall' });
    const data = await store.load(ASSET_CATEGORY.OBJECTS, 'obj2');
    expect(data).toEqual({ type: 'wall' });
  });

  it('load fetches bundled assets', async () => {
    const bundledData = { type: 'platform', name: 'Platform' };
    // Re-init manifest with a bundled entry
    globalThis.fetch = stubFetch({
      objects: { platform: { name: 'Platform', path: '/assets/objects/platform.json' } },
    });
    manifest = new AssetManifest('test_manifest2');
    await manifest.init();
    store = new AssetStore(manifest, 'test_data2');

    // Now mock the fetch for the actual asset
    globalThis.fetch = stubFetch(bundledData);
    const data = await store.load(ASSET_CATEGORY.OBJECTS, 'platform');
    expect(data).toEqual(bundledData);
  });

  it('load returns null for unknown asset', async () => {
    const data = await store.load(ASSET_CATEGORY.OBJECTS, 'nope');
    expect(data).toBe(null);
  });

  it('loadSync returns cached data', () => {
    store.save(ASSET_CATEGORY.OBJECTS, 'obj1', 'Obj', { x: 1 });
    expect(store.loadSync(ASSET_CATEGORY.OBJECTS, 'obj1')).toEqual({ x: 1 });
  });

  it('loadSync returns localStorage data', () => {
    globalThis.localStorage._store['test_data:levels:lv1'] = JSON.stringify({ w: 10 });
    expect(store.loadSync(ASSET_CATEGORY.LEVELS, 'lv1')).toEqual({ w: 10 });
  });

  it('loadSync returns null when not in cache or localStorage', () => {
    expect(store.loadSync(ASSET_CATEGORY.OBJECTS, 'nope')).toBe(null);
  });

  it('delete removes local asset', () => {
    store.save(ASSET_CATEGORY.OBJECTS, 'obj1', 'Obj', { x: 1 });
    expect(store.delete(ASSET_CATEGORY.OBJECTS, 'obj1')).toBe(true);
    expect(store.loadSync(ASSET_CATEGORY.OBJECTS, 'obj1')).toBe(null);
    expect(globalThis.localStorage.removeItem).toHaveBeenCalledWith('test_data:objects:obj1');
  });

  it('delete refuses to remove bundled asset', async () => {
    globalThis.fetch = stubFetch({
      objects: { platform: { name: 'Platform', path: '/assets/objects/platform.json' } },
    });
    manifest = new AssetManifest('test_manifest3');
    await manifest.init();
    store = new AssetStore(manifest, 'test_data3');

    expect(store.delete(ASSET_CATEGORY.OBJECTS, 'platform')).toBe(false);
  });

  it('list delegates to manifest', () => {
    store.save(ASSET_CATEGORY.LEVELS, 'lv1', 'Level 1', {});
    store.save(ASSET_CATEGORY.LEVELS, 'lv2', 'Level 2', {});
    const entries = store.list(ASSET_CATEGORY.LEVELS);
    expect(entries).toHaveLength(2);
    expect(entries.map(e => e.id)).toContain('lv1');
    expect(entries.map(e => e.id)).toContain('lv2');
  });

  it('save with dependencies stores them in manifest', () => {
    store.save(ASSET_CATEGORY.LEVELS, 'lv1', 'Level 1', {}, {
      objects: ['enemy', 'platform'],
      sprites: ['bg.png'],
    });
    const entry = manifest.get(ASSET_CATEGORY.LEVELS, 'lv1');
    expect(entry.objects).toEqual(['enemy', 'platform']);
    expect(entry.sprites).toEqual(['bg.png']);
  });

  it('clearCache empties the in-memory cache', () => {
    store.save(ASSET_CATEGORY.OBJECTS, 'obj1', 'Obj', { x: 1 });
    store.clearCache();
    // Should still load from localStorage
    expect(store.loadSync(ASSET_CATEGORY.OBJECTS, 'obj1')).toEqual({ x: 1 });
  });
});
