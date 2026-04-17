import { describe, it, expect, beforeEach } from 'vitest';
import { LevelStore } from '../../src/level/LevelStore.js';
import { Level, TILE } from '../../src/level/Level.js';

describe('LevelStore', () => {
  let store;

  beforeEach(() => {
    store = new LevelStore();
  });

  it('starts with an empty list', () => {
    expect(store.list()).toEqual([]);
  });

  it('saves a level with a name', () => {
    const level = new Level(5, 5);
    level.setTile(1, 1, TILE.SOLID);
    store.save('test-level', level);
    const names = store.list();
    expect(names).toContain('test-level');
  });

  it('loads a saved level by name', () => {
    const level = new Level(5, 5);
    level.setTile(2, 3, TILE.SOLID);
    store.save('my-level', level);

    const loaded = store.load('my-level');
    expect(loaded).not.toBe(null);
    expect(loaded.width).toBe(5);
    expect(loaded.getTile(2, 3)).toBe(TILE.SOLID);
  });

  it('returns null for unknown level', () => {
    expect(store.load('nope')).toBe(null);
  });

  it('overwrites existing level on save with same name', () => {
    const a = new Level(3, 3);
    const b = new Level(5, 5);
    store.save('x', a);
    store.save('x', b);
    expect(store.list()).toHaveLength(1);
    expect(store.load('x').width).toBe(5);
  });

  it('deletes a level by name', () => {
    store.save('a', new Level(3, 3));
    store.save('b', new Level(4, 4));
    store.delete('a');
    expect(store.list()).toEqual(['b']);
  });

  it('delete does nothing for unknown name', () => {
    store.delete('nope'); // no throw
  });

  it('loaded level is a clone (not a shared reference)', () => {
    const level = new Level(3, 3);
    store.save('test', level);
    const loaded = store.load('test');
    loaded.setTile(0, 0, TILE.HAZARD);
    const loaded2 = store.load('test');
    expect(loaded2.getTile(0, 0)).toBe(TILE.EMPTY);
  });
});
