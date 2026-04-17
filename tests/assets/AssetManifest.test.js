import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AssetManifest, ASSET_CATEGORY, ASSET_SOURCE } from '../../src/assets/AssetManifest.js';

// Stub localStorage
function createLocalStorageStub() {
  const store = {};
  return {
    getItem: vi.fn((key) => store[key] ?? null),
    setItem: vi.fn((key, val) => { store[key] = val; }),
    removeItem: vi.fn((key) => { delete store[key]; }),
    _store: store,
  };
}

// Stub fetch
function stubFetch(data) {
  return vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(data) }));
}

describe('AssetManifest', () => {
  let manifest;
  let originalFetch;
  let originalLocalStorage;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalLocalStorage = globalThis.localStorage;
    globalThis.localStorage = createLocalStorageStub();
    manifest = new AssetManifest('test_manifest');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.localStorage = originalLocalStorage;
  });

  it('starts unloaded', () => {
    expect(manifest.loaded).toBe(false);
  });

  it('loads with empty bundled manifest', async () => {
    globalThis.fetch = stubFetch({});
    await manifest.init('/assets/manifest.json');
    expect(manifest.loaded).toBe(true);
    expect(manifest.list(ASSET_CATEGORY.OBJECTS)).toEqual([]);
  });

  it('loads bundled entries from manifest', async () => {
    globalThis.fetch = stubFetch({
      objects: {
        platform: { name: 'Platform', path: '/assets/objects/platform.json' },
      },
    });
    await manifest.init('/assets/manifest.json');

    const objects = manifest.list(ASSET_CATEGORY.OBJECTS);
    expect(objects).toHaveLength(1);
    expect(objects[0].id).toBe('platform');
    expect(objects[0].name).toBe('Platform');
    expect(objects[0].source).toBe(ASSET_SOURCE.BUNDLED);
  });

  it('get returns entry by category and id', async () => {
    globalThis.fetch = stubFetch({
      levels: { level1: { name: 'Level 1', objects: ['platform'] } },
    });
    await manifest.init();

    const entry = manifest.get(ASSET_CATEGORY.LEVELS, 'level1');
    expect(entry).not.toBe(null);
    expect(entry.name).toBe('Level 1');
    expect(entry.objects).toEqual(['platform']);
  });

  it('get returns null for unknown entry', async () => {
    globalThis.fetch = stubFetch({});
    await manifest.init();
    expect(manifest.get(ASSET_CATEGORY.OBJECTS, 'nope')).toBe(null);
  });

  it('set adds a local entry', async () => {
    globalThis.fetch = stubFetch({});
    await manifest.init();

    manifest.set(ASSET_CATEGORY.OBJECTS, { id: 'custom1', name: 'Custom' });
    const entry = manifest.get(ASSET_CATEGORY.OBJECTS, 'custom1');
    expect(entry.name).toBe('Custom');
    expect(entry.source).toBe(ASSET_SOURCE.LOCAL);
  });

  it('set persists to localStorage', async () => {
    globalThis.fetch = stubFetch({});
    await manifest.init();

    manifest.set(ASSET_CATEGORY.OBJECTS, { id: 'x', name: 'X' });
    expect(globalThis.localStorage.setItem).toHaveBeenCalled();

    const stored = JSON.parse(globalThis.localStorage._store['test_manifest']);
    expect(stored.objects.x).toBeDefined();
    expect(stored.objects.x.name).toBe('X');
  });

  it('remove deletes local entry', async () => {
    globalThis.fetch = stubFetch({});
    await manifest.init();

    manifest.set(ASSET_CATEGORY.OBJECTS, { id: 'y', name: 'Y' });
    expect(manifest.remove(ASSET_CATEGORY.OBJECTS, 'y')).toBe(true);
    expect(manifest.get(ASSET_CATEGORY.OBJECTS, 'y')).toBe(null);
  });

  it('remove refuses to delete bundled entry', async () => {
    globalThis.fetch = stubFetch({
      objects: { platform: { name: 'Platform' } },
    });
    await manifest.init();

    expect(manifest.remove(ASSET_CATEGORY.OBJECTS, 'platform')).toBe(false);
    expect(manifest.get(ASSET_CATEGORY.OBJECTS, 'platform')).not.toBe(null);
  });

  it('loads local entries from localStorage on init', async () => {
    globalThis.localStorage._store['test_manifest'] = JSON.stringify({
      objects: { saved1: { id: 'saved1', name: 'Saved', source: 'local' } },
    });
    globalThis.fetch = stubFetch({});
    await manifest.init();

    const entry = manifest.get(ASSET_CATEGORY.OBJECTS, 'saved1');
    expect(entry).not.toBe(null);
    expect(entry.name).toBe('Saved');
    expect(entry.source).toBe(ASSET_SOURCE.LOCAL);
  });

  it('local entries do not overwrite bundled entries', async () => {
    globalThis.localStorage._store['test_manifest'] = JSON.stringify({
      objects: { platform: { id: 'platform', name: 'Hacked', source: 'local' } },
    });
    globalThis.fetch = stubFetch({
      objects: { platform: { name: 'Platform', path: '/assets/objects/platform.json' } },
    });
    await manifest.init();

    const entry = manifest.get(ASSET_CATEGORY.OBJECTS, 'platform');
    expect(entry.name).toBe('Platform');
    expect(entry.source).toBe(ASSET_SOURCE.BUNDLED);
  });

  it('resolveLevelAssets collects all dependencies', async () => {
    globalThis.fetch = stubFetch({});
    await manifest.init();

    manifest.set(ASSET_CATEGORY.OBJECTS, {
      id: 'enemy', name: 'Enemy', sprites: ['enemy.png'], sounds: ['hit.wav'],
    });
    manifest.set(ASSET_CATEGORY.LEVELS, {
      id: 'level1', name: 'Level 1',
      objects: ['enemy'],
      sprites: ['bg.png'],
      music: ['theme.mp3'],
    });

    const deps = manifest.resolveLevelAssets('level1');
    expect(deps.objects).toEqual(['enemy']);
    expect(deps.sprites).toContain('bg.png');
    expect(deps.sprites).toContain('enemy.png');
    expect(deps.sounds).toContain('hit.wav');
    expect(deps.music).toContain('theme.mp3');
  });

  it('resolveLevelAssets deduplicates', async () => {
    globalThis.fetch = stubFetch({});
    await manifest.init();

    manifest.set(ASSET_CATEGORY.OBJECTS, {
      id: 'a', name: 'A', sprites: ['shared.png'],
    });
    manifest.set(ASSET_CATEGORY.OBJECTS, {
      id: 'b', name: 'B', sprites: ['shared.png'],
    });
    manifest.set(ASSET_CATEGORY.LEVELS, {
      id: 'lvl', name: 'Lvl', objects: ['a', 'b'], sprites: ['shared.png'],
    });

    const deps = manifest.resolveLevelAssets('lvl');
    expect(deps.sprites).toEqual(['shared.png']);
  });

  it('resolveLevelAssets returns empty for unknown level', async () => {
    globalThis.fetch = stubFetch({});
    await manifest.init();

    const deps = manifest.resolveLevelAssets('nope');
    expect(deps.objects).toEqual([]);
    expect(deps.sprites).toEqual([]);
  });

  it('handles fetch failure gracefully', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('network')));
    await manifest.init();
    expect(manifest.loaded).toBe(true);
    expect(manifest.list(ASSET_CATEGORY.OBJECTS)).toEqual([]);
  });

  it('handles corrupted localStorage gracefully', async () => {
    globalThis.localStorage._store['test_manifest'] = 'not-json{{{';
    globalThis.fetch = stubFetch({});
    await manifest.init();
    expect(manifest.loaded).toBe(true);
  });
});
