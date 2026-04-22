import { describe, it, expect } from 'vitest';
import {
  Behavior,
  STANDARD_BEHAVIORS,
  createBehavior,
} from '../../src/objects/Behavior.js';
import { BehaviorEffect } from '../../src/objects/BehaviorEffect.js';

describe('Behavior', () => {
  it('creates a behavior with required fields', () => {
    const b = new Behavior({ id: 'move', name: 'Move' });
    expect(b.id).toBe('move');
    expect(b.name).toBe('Move');
    expect(b.animation).toBe(null);
    expect(b.params).toEqual({});
    expect(b.effects).toEqual([]);
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

  it('accepts effects and stores them as BehaviorEffect instances', () => {
    const b = new Behavior({
      id: 'hurt',
      name: 'Hurt',
      effects: [{ targetRef: 'self', property: 'properties.health', operation: 'add', value: -10 }],
    });
    expect(b.effects).toHaveLength(1);
    expect(b.effects[0]).toBeInstanceOf(BehaviorEffect);
    expect(b.effects[0].value).toBe(-10);
  });

  it('accepts effects as BehaviorEffect instances directly', () => {
    const eff = new BehaviorEffect({ targetRef: 'self', property: 'x', operation: 'set', value: 0 });
    const b = new Behavior({ id: 'reset', name: 'Reset', effects: [eff] });
    expect(b.effects[0]).toBe(eff);
  });

  it('serializes effects in toJSON', () => {
    const b = new Behavior({
      id: 'kill',
      name: 'Kill',
      effects: [{ targetRef: 'self', property: 'properties.alive', operation: 'set', value: false }],
    });
    const json = b.toJSON();
    expect(json.effects).toHaveLength(1);
    expect(json.effects[0]).toEqual({
      targetRef: 'self', property: 'properties.alive', operation: 'set', value: false,
    });
  });

  it('deserializes effects from JSON', () => {
    const json = {
      id: 'kill', name: 'Kill', animation: null, params: {},
      effects: [{ targetRef: 'self', property: 'properties.alive', operation: 'set', value: false }],
    };
    const b = Behavior.fromJSON(json);
    expect(b.effects).toHaveLength(1);
    expect(b.effects[0]).toBeInstanceOf(BehaviorEffect);
  });

  it('clone does not share effects array or effect instances', () => {
    const b = new Behavior({
      id: 'move', name: 'Move',
      effects: [{ targetRef: 'self', property: 'x', operation: 'add', value: 1 }],
    });
    const c = b.clone();
    c.effects[0].value = 99;
    expect(b.effects[0].value).toBe(1);
    expect(c.effects).not.toBe(b.effects);
  });
});

describe('STANDARD_BEHAVIORS', () => {
  it('includes move, die, and idle', () => {
    const ids = STANDARD_BEHAVIORS.map((b) => b.id);
    expect(ids).toContain('move');
    expect(ids).toContain('die');
    expect(ids).toContain('idle');
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
