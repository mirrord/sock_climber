import { describe, it, expect } from 'vitest';
import {
  TRIGGER_TYPES,
  BehaviorTrigger,
} from '../../src/objects/BehaviorTrigger.js';

describe('TRIGGER_TYPES', () => {
  it('contains expected trigger types', () => {
    expect(TRIGGER_TYPES).toContain('timer');
    expect(TRIGGER_TYPES).toContain('proximity');
    expect(TRIGGER_TYPES).toContain('stat_change');
    expect(TRIGGER_TYPES).toContain('on_collide');
    expect(TRIGGER_TYPES).toContain('on_interact');
  });

  it('contains control trigger type', () => {
    expect(TRIGGER_TYPES).toContain('control');
  });
});

describe('BehaviorTrigger', () => {
  it('creates with type, behaviorId, and params', () => {
    const t = new BehaviorTrigger({
      type: 'proximity',
      behaviorId: 'move',
      params: { radius: 3 },
    });
    expect(t.type).toBe('proximity');
    expect(t.behaviorId).toBe('move');
    expect(t.params.radius).toBe(3);
  });

  it('defaults params to empty object', () => {
    const t = new BehaviorTrigger({ type: 'timer', behaviorId: 'die' });
    expect(t.params).toEqual({});
  });

  it('serializes and deserializes', () => {
    const t = new BehaviorTrigger({
      type: 'timer',
      behaviorId: 'die',
      params: { delay: 2.5 },
    });
    const json = t.toJSON();
    const restored = BehaviorTrigger.fromJSON(json);
    expect(restored.type).toBe('timer');
    expect(restored.behaviorId).toBe('die');
    expect(restored.params.delay).toBe(2.5);
  });

  it('clones without sharing references', () => {
    const t = new BehaviorTrigger({
      type: 'proximity',
      behaviorId: 'move',
      params: { radius: 5 },
    });
    const c = t.clone();
    c.params.radius = 10;
    expect(t.params.radius).toBe(5);
  });
});
