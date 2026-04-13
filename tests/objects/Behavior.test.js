import { describe, it, expect } from 'vitest';
import {
  Behavior,
  STANDARD_BEHAVIORS,
  createBehavior,
} from '../../src/objects/Behavior.js';

describe('Behavior', () => {
  it('creates a behavior with required fields', () => {
    const b = new Behavior({ id: 'move', name: 'Move' });
    expect(b.id).toBe('move');
    expect(b.name).toBe('Move');
    expect(b.animation).toBe(null);
    expect(b.params).toEqual({});
  });

  it('accepts optional animation link', () => {
    const b = new Behavior({ id: 'die', name: 'Die', animation: 'death_anim' });
    expect(b.animation).toBe('death_anim');
  });

  it('accepts arbitrary params', () => {
    const b = new Behavior({
      id: 'move',
      name: 'Move',
      params: { speed: 5, direction: 'right' },
    });
    expect(b.params.speed).toBe(5);
    expect(b.params.direction).toBe('right');
  });

  it('serializes to JSON and back', () => {
    const b = new Behavior({
      id: 'move',
      name: 'Move',
      animation: 'walk_cycle',
      params: { speed: 3 },
    });
    const json = b.toJSON();
    const restored = Behavior.fromJSON(json);
    expect(restored.id).toBe('move');
    expect(restored.animation).toBe('walk_cycle');
    expect(restored.params.speed).toBe(3);
  });

  it('clones without sharing references', () => {
    const b = new Behavior({ id: 'move', name: 'Move', params: { speed: 5 } });
    const c = b.clone();
    c.params.speed = 10;
    expect(b.params.speed).toBe(5);
    expect(c.params.speed).toBe(10);
  });
});

describe('STANDARD_BEHAVIORS', () => {
  it('includes move and die', () => {
    const ids = STANDARD_BEHAVIORS.map((b) => b.id);
    expect(ids).toContain('move');
    expect(ids).toContain('die');
  });

  it('all entries are Behavior instances', () => {
    for (const b of STANDARD_BEHAVIORS) {
      expect(b).toBeInstanceOf(Behavior);
    }
  });
});

describe('createBehavior', () => {
  it('creates from a standard template by id', () => {
    const b = createBehavior('move');
    expect(b.id).toBe('move');
    expect(b).toBeInstanceOf(Behavior);
  });

  it('returns a clone, not the same instance', () => {
    const a = createBehavior('move');
    const b = createBehavior('move');
    expect(a).not.toBe(b);
  });

  it('returns null for unknown id', () => {
    expect(createBehavior('nonexistent')).toBe(null);
  });
});
