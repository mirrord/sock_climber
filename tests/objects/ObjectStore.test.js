import { describe, it, expect, beforeEach } from 'vitest';
import { ObjectStore } from '../../src/objects/ObjectStore.js';
import { GameObject } from '../../src/objects/GameObject.js';

// ---- Minimal AssetStore stub ----

function makeStubStore() {
  const data = {};
  const manifest = {};
  return {
    save(category, id, name, json) {
      if (!data[category]) data[category] = {};
      if (!manifest[category]) manifest[category] = {};
      data[category][id] = json;
      manifest[category][id] = { id, name };
    },
    loadSync(category, id) {
      return data[category]?.[id] ?? null;
    },
    delete(category, id) {
      if (data[category]) delete data[category][id];
      if (manifest[category]) delete manifest[category][id];
      return true;
    },
    list(category) {
      return Object.values(manifest[category] ?? {});
    },
  };
}

describe('ObjectStore (no backing store)', () => {
  let store;

  beforeEach(() => {
    store = new ObjectStore();
  });

  it('starts with an empty list', () => {
    expect(store.list()).toEqual([]);
  });

  it('save + load round-trips a GameObject', () => {
    const obj = new GameObject({ type: 'enemy', name: 'Slime', id: 'e1' });
    store.save(obj);
    const loaded = store.load('e1');
    expect(loaded).toBeInstanceOf(GameObject);
    expect(loaded.id).toBe('e1');
    expect(loaded.type).toBe('enemy');
    expect(loaded.name).toBe('Slime');
  });

  it('load returns null for unknown id', () => {
    expect(store.load('nope')).toBeNull();
  });

  it('list returns saved id + name entries', () => {
    const a = new GameObject({ type: 'enemy', name: 'A', id: 'a' });
    const b = new GameObject({ type: 'wall', name: 'B', id: 'b' });
    store.save(a);
    store.save(b);
    const listed = store.list();
    expect(listed).toHaveLength(2);
    expect(listed.map(e => e.id)).toContain('a');
    expect(listed.map(e => e.id)).toContain('b');
  });

  it('loadAll returns all saved GameObjects', () => {
    store.save(new GameObject({ type: 'wall', name: 'W', id: 'w1' }));
    store.save(new GameObject({ type: 'enemy', name: 'E', id: 'e1' }));
    const all = store.loadAll();
    expect(all).toHaveLength(2);
    expect(all.every(o => o instanceof GameObject)).toBe(true);
  });

  it('delete removes the object', () => {
    store.save(new GameObject({ type: 'wall', name: 'W', id: 'w1' }));
    store.delete('w1');
    expect(store.list()).toHaveLength(0);
    expect(store.load('w1')).toBeNull();
  });

  it('save overwrites an existing object with the same id', () => {
    const obj = new GameObject({ type: 'wall', name: 'Old', id: 'w1' });
    store.save(obj);
    obj.name = 'New';
    store.save(obj);
    const loaded = store.load('w1');
    expect(loaded.name).toBe('New');
    expect(store.list()).toHaveLength(1);
  });
});

describe('ObjectStore (with AssetStore backing)', () => {
  let stubAssetStore;
  let store;

  beforeEach(() => {
    stubAssetStore = makeStubStore();
    store = new ObjectStore(stubAssetStore);
  });

  it('save delegates to assetStore.save', () => {
    const obj = new GameObject({ type: 'enemy', name: 'Slime', id: 's1' });
    store.save(obj);
    expect(stubAssetStore.loadSync('objects', 's1')).toBeTruthy();
  });

  it('load falls back to assetStore.loadSync', () => {
    const obj = new GameObject({ type: 'enemy', name: 'Slime', id: 's1' });
    store.save(obj);
    // Create a fresh store pointing to the same assetStore (cold start)
    const cold = new ObjectStore(stubAssetStore);
    const loaded = cold.load('s1');
    expect(loaded).toBeInstanceOf(GameObject);
    expect(loaded.name).toBe('Slime');
  });

  it('loadAll on cold store loads from assetStore', () => {
    store.save(new GameObject({ type: 'wall', name: 'W', id: 'w1' }));
    store.save(new GameObject({ type: 'enemy', name: 'E', id: 'e1' }));
    const cold = new ObjectStore(stubAssetStore);
    const all = cold.loadAll();
    expect(all).toHaveLength(2);
  });

  it('delete delegates to assetStore.delete', () => {
    const obj = new GameObject({ type: 'enemy', name: 'Slime', id: 's1' });
    store.save(obj);
    store.delete('s1');
    expect(stubAssetStore.loadSync('objects', 's1')).toBeNull();
    expect(stubAssetStore.list('objects')).toHaveLength(0);
  });

  it('list delegates to assetStore.list', () => {
    store.save(new GameObject({ type: 'wall', name: 'W', id: 'w1' }));
    const cold = new ObjectStore(stubAssetStore);
    const listed = cold.list();
    expect(listed.map(e => e.id)).toContain('w1');
  });
});
