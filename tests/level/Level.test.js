import { describe, it, expect } from 'vitest';
import { Level, TILE } from '../../src/level/Level.js';

describe('Level', () => {
  it('creates an empty level with given dimensions', () => {
    const level = new Level(10, 8);
    expect(level.width).toBe(10);
    expect(level.height).toBe(8);
    expect(level.getTile(0, 0)).toBe(TILE.EMPTY);
    expect(level.getTile(9, 7)).toBe(TILE.EMPTY);
  });

  it('sets and gets tiles', () => {
    const level = new Level(5, 5);
    level.setTile(2, 3, TILE.SOLID);
    expect(level.getTile(2, 3)).toBe(TILE.SOLID);
    expect(level.getTile(0, 0)).toBe(TILE.EMPTY);
  });

  it('ignores out-of-bounds set', () => {
    const level = new Level(5, 5);
    level.setTile(-1, 0, TILE.SOLID);
    level.setTile(5, 0, TILE.SOLID);
    level.setTile(0, -1, TILE.SOLID);
    level.setTile(0, 5, TILE.SOLID);
    // No throw, just ignored
  });

  it('returns SOLID for out-of-bounds get (treat edges as walls)', () => {
    const level = new Level(5, 5);
    expect(level.getTile(-1, 0)).toBe(TILE.SOLID);
    expect(level.getTile(5, 0)).toBe(TILE.SOLID);
    expect(level.getTile(0, -1)).toBe(TILE.SOLID);
    expect(level.getTile(0, 5)).toBe(TILE.SOLID);
  });

  it('serializes to JSON and deserializes back', () => {
    const level = new Level(3, 3);
    level.setTile(0, 0, TILE.SOLID);
    level.setTile(1, 1, TILE.SPAWN);
    level.setTile(2, 2, TILE.HAZARD);

    const json = level.toJSON();
    const restored = Level.fromJSON(json);

    expect(restored.width).toBe(3);
    expect(restored.height).toBe(3);
    expect(restored.getTile(0, 0)).toBe(TILE.SOLID);
    expect(restored.getTile(1, 1)).toBe(TILE.SPAWN);
    expect(restored.getTile(2, 2)).toBe(TILE.HAZARD);
    expect(restored.getTile(0, 1)).toBe(TILE.EMPTY);
  });

  it('clears all tiles', () => {
    const level = new Level(3, 3);
    level.setTile(0, 0, TILE.SOLID);
    level.setTile(1, 1, TILE.SOLID);
    level.clear();
    expect(level.getTile(0, 0)).toBe(TILE.EMPTY);
    expect(level.getTile(1, 1)).toBe(TILE.EMPTY);
  });

  it('resizes preserving existing tiles', () => {
    const level = new Level(3, 3);
    level.setTile(1, 1, TILE.SOLID);
    level.resize(5, 5);
    expect(level.width).toBe(5);
    expect(level.height).toBe(5);
    expect(level.getTile(1, 1)).toBe(TILE.SOLID);
    expect(level.getTile(4, 4)).toBe(TILE.EMPTY);
  });

  it('finds spawn position', () => {
    const level = new Level(5, 5);
    level.setTile(2, 3, TILE.SPAWN);
    const spawn = level.findSpawn();
    expect(spawn).toEqual({ x: 2, y: 3 });
  });

  it('returns default spawn when none placed', () => {
    const level = new Level(5, 5);
    const spawn = level.findSpawn();
    expect(spawn).toEqual({ x: 0, y: 0 });
  });
});

describe('Level object placement', () => {
  it('starts with empty objects array', () => {
    const level = new Level(5, 5);
    expect(level.objects).toEqual([]);
  });

  it('placeObject adds an entry and returns an id', () => {
    const level = new Level(5, 5);
    const id = level.placeObject({ type: 'player', x: 2, y: 3 });
    expect(typeof id).toBe('string');
    expect(level.objects).toHaveLength(1);
    expect(level.objects[0]).toMatchObject({ type: 'player', x: 2, y: 3, id });
  });

  it('placeObject uses provided id when given', () => {
    const level = new Level(5, 5);
    const id = level.placeObject({ type: 'platform', x: 0, y: 0, id: 'fixed_id' });
    expect(id).toBe('fixed_id');
    expect(level.objects[0].id).toBe('fixed_id');
  });

  it('placeObject copies properties without sharing references', () => {
    const level = new Level(5, 5);
    const props = { foo: 'bar' };
    level.placeObject({ type: 'enemy', x: 1, y: 1, properties: props });
    props.foo = 'changed';
    expect(level.objects[0].properties.foo).toBe('bar');
  });

  it('removeObject removes by id', () => {
    const level = new Level(5, 5);
    const id = level.placeObject({ type: 'player', x: 0, y: 0 });
    level.removeObject(id);
    expect(level.objects).toHaveLength(0);
  });

  it('removeObject is a no-op for unknown id', () => {
    const level = new Level(5, 5);
    level.placeObject({ type: 'player', x: 0, y: 0 });
    level.removeObject('nonexistent');
    expect(level.objects).toHaveLength(1);
  });

  it('findObjectByType returns the first matching object', () => {
    const level = new Level(5, 5);
    level.placeObject({ type: 'enemy', x: 1, y: 1 });
    level.placeObject({ type: 'player', x: 2, y: 3 });
    const found = level.findObjectByType('player');
    expect(found).toMatchObject({ type: 'player', x: 2, y: 3 });
  });

  it('findObjectByType returns null when no match', () => {
    const level = new Level(5, 5);
    expect(level.findObjectByType('player')).toBeNull();
  });

  it('findPlayerSpawn returns position of placed player object', () => {
    const level = new Level(5, 5);
    level.placeObject({ type: 'player', x: 3, y: 4 });
    expect(level.findPlayerSpawn()).toEqual({ x: 3, y: 4 });
  });

  it('findPlayerSpawn returns null when no player object placed', () => {
    const level = new Level(5, 5);
    expect(level.findPlayerSpawn()).toBeNull();
  });

  it('toJSON and fromJSON round-trip preserves objects', () => {
    const level = new Level(5, 5);
    level.placeObject({ type: 'player', x: 1, y: 2, properties: { hp: 3 } });
    const restored = Level.fromJSON(level.toJSON());
    expect(restored.objects).toHaveLength(1);
    expect(restored.objects[0]).toMatchObject({ type: 'player', x: 1, y: 2 });
    expect(restored.objects[0].properties.hp).toBe(3);
  });
});

describe('Level.validate', () => {
  it('returns invalid with error when no player object placed', () => {
    const level = new Level(5, 5);
    const result = level.validate();
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
  });

  it('returns valid when exactly 1 player object placed', () => {
    const level = new Level(5, 5);
    level.placeObject({ type: 'player', x: 0, y: 0 });
    const result = level.validate();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns invalid with error when more than 1 player placed', () => {
    const level = new Level(5, 5);
    level.placeObject({ type: 'player', x: 0, y: 0 });
    level.placeObject({ type: 'player', x: 2, y: 2 });
    const result = level.validate();
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
  });
});
