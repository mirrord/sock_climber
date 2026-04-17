import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AssetLoader } from '../../src/assets/AssetLoader.js';
import { AssetStore } from '../../src/assets/AssetStore.js';
import { AssetManifest, ASSET_CATEGORY } from '../../src/assets/AssetManifest.js';
import { Level } from '../../src/level/Level.js';
import { GameObject } from '../../src/objects/GameObject.js';

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

describe('AssetLoader', () => {
  let manifest;
  let assetStore;
  let loader;
  let originalFetch;
  let originalLocalStorage;

  beforeEach(async () => {
    originalFetch = globalThis.fetch;
    originalLocalStorage = globalThis.localStorage;
    globalThis.localStorage = createLocalStorageStub();
    globalThis.fetch = stubFetch({});

    manifest = new AssetManifest('test_manifest');
    await manifest.init();
    assetStore = new AssetStore(manifest, 'test_data');
    loader = new AssetLoader(assetStore, manifest);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.localStorage = originalLocalStorage;
  });

  it('listObjects returns saved objects', () => {
    assetStore.save(ASSET_CATEGORY.OBJECTS, 'enemy', 'Enemy', { type: 'enemy' });
    assetStore.save(ASSET_CATEGORY.OBJECTS, 'platform', 'Platform', { type: 'platform' });

    const list = loader.listObjects();
    expect(list).toHaveLength(2);
    expect(list.map(o => o.id)).toContain('enemy');
    expect(list.map(o => o.id)).toContain('platform');
  });

  it('listLevels returns saved levels', () => {
    assetStore.save(ASSET_CATEGORY.LEVELS, 'lv1', 'Level 1', {});
    const list = loader.listLevels();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('lv1');
  });

  it('loadObject returns a GameObject', async () => {
    const obj = new GameObject({ type: 'enemy', name: 'Enemy' });
    assetStore.save(ASSET_CATEGORY.OBJECTS, 'enemy', 'Enemy', obj.toJSON());

    const loaded = await loader.loadObject('enemy');
    expect(loaded).toBeInstanceOf(GameObject);
    expect(loaded.type).toBe('enemy');
    expect(loaded.name).toBe('Enemy');
  });

  it('loadObject returns null for unknown', async () => {
    expect(await loader.loadObject('nope')).toBe(null);
  });

  it('loadLevel returns a Level', async () => {
    const level = new Level(10, 8);
    assetStore.save(ASSET_CATEGORY.LEVELS, 'lv1', 'Level 1', level.toJSON());

    const loaded = await loader.loadLevel('lv1');
    expect(loaded).toBeInstanceOf(Level);
    expect(loaded.width).toBe(10);
    expect(loaded.height).toBe(8);
  });

  it('loadLevel returns null for unknown', async () => {
    expect(await loader.loadLevel('nope')).toBe(null);
  });

  it('loadLevelBundle loads level with all objects', async () => {
    const level = new Level(5, 5);
    const enemy = new GameObject({ type: 'enemy', name: 'Enemy' });
    const platform = new GameObject({ type: 'platform', name: 'Platform' });

    assetStore.save(ASSET_CATEGORY.OBJECTS, 'enemy', 'Enemy', enemy.toJSON());
    assetStore.save(ASSET_CATEGORY.OBJECTS, 'platform', 'Platform', platform.toJSON());
    assetStore.save(ASSET_CATEGORY.LEVELS, 'lv1', 'Level 1', level.toJSON(), {
      objects: ['enemy', 'platform'],
      sprites: ['bg.png'],
      sounds: ['hit.wav'],
    });

    const bundle = await loader.loadLevelBundle('lv1');
    expect(bundle).not.toBe(null);
    expect(bundle.level).toBeInstanceOf(Level);
    expect(bundle.objects.size).toBe(2);
    expect(bundle.objects.get('enemy')).toBeInstanceOf(GameObject);
    expect(bundle.objects.get('platform')).toBeInstanceOf(GameObject);
    expect(bundle.spritePaths).toContain('/assets/sprites/bg.png');
    expect(bundle.soundPaths).toContain('/assets/sounds/hit.wav');
  });

  it('loadLevelBundle returns null for unknown level', async () => {
    expect(await loader.loadLevelBundle('nope')).toBe(null);
  });

  it('loadLevelBundle handles missing objects gracefully', async () => {
    const level = new Level(5, 5);
    assetStore.save(ASSET_CATEGORY.LEVELS, 'lv1', 'Level 1', level.toJSON(), {
      objects: ['missing_obj'],
    });

    const bundle = await loader.loadLevelBundle('lv1');
    expect(bundle).not.toBe(null);
    expect(bundle.objects.size).toBe(0);
  });
});
