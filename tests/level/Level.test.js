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
