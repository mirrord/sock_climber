import { describe, it, expect, beforeEach } from 'vitest';
import { BehaviorStore } from '../../src/objects/BehaviorStore.js';
import { Behavior } from '../../src/objects/Behavior.js';

function makeBehavior(id = 'custom_move', name = 'Custom Move') {
  return new Behavior({ id, name, animation: 'move', params: { speed: 3 } });
}

describe('BehaviorStore (in-memory, no AssetStore)', () => {
  let store;

  beforeEach(() => {
    store = new BehaviorStore();
  });

  it('starts with an empty list', () => {
    expect(store.list()).toEqual([]);
  });

  it('saves a behavior and lists it', () => {
    const b = makeBehavior();
    store.save(b);
    const list = store.list();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('custom_move');
    expect(list[0].name).toBe('Custom Move');
  });

  it('loads a saved behavior by id', () => {
    const b = makeBehavior();
    store.save(b);
    const loaded = store.load('custom_move');
    expect(loaded).toBeInstanceOf(Behavior);
    expect(loaded.id).toBe('custom_move');
    expect(loaded.params.speed).toBe(3);
  });

  it('returns null for unknown id', () => {
    expect(store.load('nonexistent')).toBe(null);
  });

  it('overwrites when saving with same id', () => {
    store.save(makeBehavior('b1', 'First'));
    store.save(new Behavior({ id: 'b1', name: 'Updated', animation: null }));
    const loaded = store.load('b1');
    expect(loaded.name).toBe('Updated');
    expect(store.list()).toHaveLength(1);
  });

  it('loads all saved behaviors', () => {
    store.save(makeBehavior('b1', 'One'));
    store.save(makeBehavior('b2', 'Two'));
    const all = store.loadAll();
    expect(all).toHaveLength(2);
    expect(all.every(b => b instanceof Behavior)).toBe(true);
  });

  it('deletes a saved behavior by id', () => {
    store.save(makeBehavior('b1', 'One'));
    store.delete('b1');
    expect(store.list()).toHaveLength(0);
    expect(store.load('b1')).toBe(null);
  });

  it('ignores delete of unknown id without error', () => {
    expect(() => store.delete('nonexistent')).not.toThrow();
  });

  it('preserves effects through save/load round-trip', () => {
    const b = new Behavior({
      id: 'hurt',
      name: 'Hurt',
      effects: [{ targetRef: 'self', property: 'properties.health', operation: 'add', value: -10 }],
    });
    store.save(b);
    const loaded = store.load('hurt');
    expect(loaded.effects).toHaveLength(1);
    expect(loaded.effects[0].value).toBe(-10);
  });
});

describe('BehaviorStore (with AssetStore)', () => {
  it('delegates list/save/loadSync to assetStore', () => {
    const fakeAssetStore = {
      _data: new Map(),
      list(cat) {
        return Array.from(this._data.values()).filter(e => e.cat === cat).map(e => ({ id: e.id, name: e.name }));
      },
      save(cat, id, name, data) { this._data.set(id, { cat, id, name, data }); },
      loadSync(cat, id) { return this._data.get(id)?.data ?? null; },
    };

    const store = new BehaviorStore(fakeAssetStore);
    store.save(makeBehavior('net_move', 'Net Move'));
    const list = store.list();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('net_move');
    const loaded = store.load('net_move');
    expect(loaded).toBeInstanceOf(Behavior);
    expect(loaded.id).toBe('net_move');
  });
});
