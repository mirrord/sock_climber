import { describe, it, expect } from 'vitest';
import { BehaviorEffect, OPERATIONS } from '../../src/objects/BehaviorEffect.js';

describe('OPERATIONS', () => {
  it('contains set, add, and multiply', () => {
    expect(OPERATIONS).toContain('set');
    expect(OPERATIONS).toContain('add');
    expect(OPERATIONS).toContain('multiply');
  });
});

describe('BehaviorEffect', () => {
  it('creates with required fields', () => {
    const e = new BehaviorEffect({ targetRef: 'self', property: 'x', operation: 'set', value: 0 });
    expect(e.targetRef).toBe('self');
    expect(e.property).toBe('x');
    expect(e.operation).toBe('set');
    expect(e.value).toBe(0);
  });

  it('accepts object id as targetRef', () => {
    const e = new BehaviorEffect({ targetRef: 'obj_42', property: 'properties.health', operation: 'add', value: -10 });
    expect(e.targetRef).toBe('obj_42');
    expect(e.property).toBe('properties.health');
  });

  it('accepts string value', () => {
    const e = new BehaviorEffect({ targetRef: 'self', property: 'properties.state', operation: 'set', value: 'dead' });
    expect(e.value).toBe('dead');
  });

  it('accepts boolean value', () => {
    const e = new BehaviorEffect({ targetRef: 'self', property: 'properties.active', operation: 'set', value: false });
    expect(e.value).toBe(false);
  });

  it('serializes to JSON', () => {
    const e = new BehaviorEffect({ targetRef: 'self', property: 'y', operation: 'add', value: 5 });
    const json = e.toJSON();
    expect(json).toEqual({ targetRef: 'self', property: 'y', operation: 'add', value: 5, spawnSpec: null });
  });

  it('deserializes from JSON', () => {
    const json = { targetRef: 'obj_1', property: 'properties.speed', operation: 'multiply', value: 2 };
    const e = BehaviorEffect.fromJSON(json);
    expect(e).toBeInstanceOf(BehaviorEffect);
    expect(e.targetRef).toBe('obj_1');
    expect(e.property).toBe('properties.speed');
    expect(e.operation).toBe('multiply');
    expect(e.value).toBe(2);
  });

  it('round-trips through JSON', () => {
    const e = new BehaviorEffect({ targetRef: 'self', property: 'x', operation: 'set', value: 100 });
    const restored = BehaviorEffect.fromJSON(e.toJSON());
    expect(restored.targetRef).toBe(e.targetRef);
    expect(restored.property).toBe(e.property);
    expect(restored.operation).toBe(e.operation);
    expect(restored.value).toBe(e.value);
  });

  it('clones without sharing reference', () => {
    const e = new BehaviorEffect({ targetRef: 'self', property: 'x', operation: 'add', value: 1 });
    const c = e.clone();
    expect(c).not.toBe(e);
    expect(c).toBeInstanceOf(BehaviorEffect);
    expect(c.targetRef).toBe(e.targetRef);
    expect(c.property).toBe(e.property);
    expect(c.operation).toBe(e.operation);
    expect(c.value).toBe(e.value);
  });

  // ── spawn operation ────────────────────────────────────────────────────────

  it('accepts target as targetRef', () => {
    const e = new BehaviorEffect({ targetRef: 'target', property: 'x', operation: 'set', value: 0 });
    expect(e.targetRef).toBe('target');
  });

  it('creates spawn effect with spawnSpec', () => {
    const spec = { objectType: 'projectile', offsetX: 0.5, offsetY: 0, velocityX: 8, velocityY: 0, properties: {}, lifetime: 2 };
    const e = new BehaviorEffect({ targetRef: 'self', property: '', operation: 'spawn', value: 0, spawnSpec: spec });
    expect(e.operation).toBe('spawn');
    expect(e.spawnSpec).toEqual(spec);
  });

  it('creates destroy effect', () => {
    const e = new BehaviorEffect({ targetRef: 'self', property: '', operation: 'destroy', value: 0 });
    expect(e.operation).toBe('destroy');
  });

  it('defaults spawnSpec to null when not provided', () => {
    const e = new BehaviorEffect({ targetRef: 'self', property: 'x', operation: 'set', value: 0 });
    expect(e.spawnSpec).toBeNull();
  });

  it('serializes spawnSpec in toJSON', () => {
    const spec = { objectType: 'projectile', offsetX: 1, offsetY: 0, velocityX: 5, velocityY: 0, properties: {}, lifetime: 3 };
    const e = new BehaviorEffect({ targetRef: 'self', property: '', operation: 'spawn', value: 0, spawnSpec: spec });
    const json = e.toJSON();
    expect(json.spawnSpec).toEqual(spec);
  });

  it('round-trips spawn effect through JSON', () => {
    const spec = { objectType: 'projectile', offsetX: 0, offsetY: 0, velocityX: 6, velocityY: 0, properties: { damage: 2 }, lifetime: 1.5 };
    const e = new BehaviorEffect({ targetRef: 'self', property: '', operation: 'spawn', value: 0, spawnSpec: spec });
    const restored = BehaviorEffect.fromJSON(e.toJSON());
    expect(restored.operation).toBe('spawn');
    expect(restored.spawnSpec).toEqual(spec);
  });

  it('clones spawn effect with isolated spawnSpec', () => {
    const spec = { objectType: 'projectile', offsetX: 0, offsetY: 0, velocityX: 6, velocityY: 0, properties: {}, lifetime: 2 };
    const e = new BehaviorEffect({ targetRef: 'self', property: '', operation: 'spawn', value: 0, spawnSpec: spec });
    const c = e.clone();
    expect(c.spawnSpec).toEqual(spec);
    expect(c.spawnSpec).not.toBe(e.spawnSpec);
  });
});

describe('OPERATIONS', () => {
  it('contains spawn and destroy', () => {
    expect(OPERATIONS).toContain('spawn');
    expect(OPERATIONS).toContain('destroy');
  });
});
