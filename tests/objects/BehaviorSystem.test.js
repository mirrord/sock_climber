import { describe, it, expect, beforeEach } from 'vitest';
import {
  evaluateTriggers,
  applyEffect,
  createTimerState,
} from '../../src/objects/BehaviorSystem.js';
import { BehaviorTrigger } from '../../src/objects/BehaviorTrigger.js';
import { BehaviorEffect } from '../../src/objects/BehaviorEffect.js';

// ── helpers ────────────────────────────────────────────────────────────────

function makeTrigger(type, behaviorId, params = {}) {
  return new BehaviorTrigger({ type, behaviorId, params });
}

function makeObj(id, x = 0, y = 0, props = {}) {
  return { id, x, y, properties: { ...props } };
}

function emptyInput() {
  return { actions: new Set() };
}

// ── createTimerState ────────────────────────────────────────────────────────

describe('createTimerState', () => {
  it('returns an empty map', () => {
    const ts = createTimerState();
    expect(ts).toBeInstanceOf(Map);
    expect(ts.size).toBe(0);
  });
});

// ── evaluateTriggers ────────────────────────────────────────────────────────

describe('evaluateTriggers — timer', () => {
  it('fires when timer runs down to zero or below', () => {
    const triggers = [makeTrigger('timer', 'patrol', { interval: 1.0 })];
    const timerState = createTimerState();
    const owner = makeObj('obj_1', 0, 0);
    // First call: remaining = 1.0 - 0.5 = 0.5 → no fire
    let fired = evaluateTriggers(owner, triggers, 0.5, emptyInput(), new Set(), timerState);
    expect(fired).not.toContain('patrol');

    // Second call: remaining = 0.5 - 0.6 = -0.1 → fire + reset
    fired = evaluateTriggers(owner, triggers, 0.6, emptyInput(), new Set(), timerState);
    expect(fired).toContain('patrol');
  });

  it('resets timer after firing', () => {
    const triggers = [makeTrigger('timer', 'idle', { interval: 1.0 })];
    const timerState = createTimerState();
    const owner = makeObj('obj_1');
    evaluateTriggers(owner, triggers, 1.1, emptyInput(), new Set(), timerState);
    // Reset: timer should be near 1.0 again
    const fired2 = evaluateTriggers(owner, triggers, 0.5, emptyInput(), new Set(), timerState);
    expect(fired2).not.toContain('idle');
  });

  it('does not fire when dt < interval', () => {
    const triggers = [makeTrigger('timer', 'patrol', { interval: 2.0 })];
    const timerState = createTimerState();
    const owner = makeObj('obj_1');
    const fired = evaluateTriggers(owner, triggers, 0.016, emptyInput(), new Set(), timerState);
    expect(fired).not.toContain('patrol');
  });
});

describe('evaluateTriggers — proximity', () => {
  it('fires when owner is within range of another object', () => {
    const triggers = [makeTrigger('proximity', 'chase', { range: 5 })];
    const owner = makeObj('obj_1', 0, 0);
    const others = [makeObj('player', 3, 4)]; // distance = 5
    const fired = evaluateTriggers(owner, triggers, 0.016, emptyInput(), new Set(), createTimerState(), others);
    expect(fired).toContain('chase');
  });

  it('does not fire when all objects are out of range', () => {
    const triggers = [makeTrigger('proximity', 'chase', { range: 3 })];
    const owner = makeObj('obj_1', 0, 0);
    const others = [makeObj('player', 10, 10)];
    const fired = evaluateTriggers(owner, triggers, 0.016, emptyInput(), new Set(), createTimerState(), others);
    expect(fired).not.toContain('chase');
  });

  it('does not check owner against itself', () => {
    const triggers = [makeTrigger('proximity', 'chase', { range: 100 })];
    const owner = makeObj('obj_1', 0, 0);
    const fired = evaluateTriggers(owner, triggers, 0.016, emptyInput(), new Set(), createTimerState(), [owner]);
    expect(fired).not.toContain('chase');
  });
});

describe('evaluateTriggers — on_collide', () => {
  it('fires when behaviorId appears in collisionEvents', () => {
    const triggers = [makeTrigger('on_collide', 'die', { with: 'player' })];
    const owner = makeObj('obj_1');
    const collisionEvents = new Set(['die']);
    const fired = evaluateTriggers(owner, triggers, 0.016, emptyInput(), collisionEvents, createTimerState());
    expect(fired).toContain('die');
  });

  it('does not fire when not in collisionEvents', () => {
    const triggers = [makeTrigger('on_collide', 'die', { with: 'player' })];
    const fired = evaluateTriggers(makeObj('obj_1'), triggers, 0.016, emptyInput(), new Set(), createTimerState());
    expect(fired).not.toContain('die');
  });
});

describe('evaluateTriggers — control', () => {
  it('fires when the mapped action is active in input snapshot', () => {
    const triggers = [makeTrigger('control', 'jump', { action: 'jump' })];
    const input = { actions: new Set(['jump']) };
    const fired = evaluateTriggers(makeObj('obj_1'), triggers, 0.016, input, new Set(), createTimerState());
    expect(fired).toContain('jump');
  });

  it('does not fire when the action is absent', () => {
    const triggers = [makeTrigger('control', 'jump', { action: 'jump' })];
    const fired = evaluateTriggers(makeObj('obj_1'), triggers, 0.016, emptyInput(), new Set(), createTimerState());
    expect(fired).not.toContain('jump');
  });
});

describe('evaluateTriggers — stat_change', () => {
  it('fires when a property crosses below a threshold', () => {
    const triggers = [makeTrigger('stat_change', 'die', { property: 'health', threshold: 0, comparison: 'lte' })];
    const owner = makeObj('obj_1', 0, 0, { health: -5 });
    const fired = evaluateTriggers(owner, triggers, 0.016, emptyInput(), new Set(), createTimerState());
    expect(fired).toContain('die');
  });

  it('does not fire when property is above threshold', () => {
    const triggers = [makeTrigger('stat_change', 'die', { property: 'health', threshold: 0, comparison: 'lte' })];
    const owner = makeObj('obj_1', 0, 0, { health: 5 });
    const fired = evaluateTriggers(owner, triggers, 0.016, emptyInput(), new Set(), createTimerState());
    expect(fired).not.toContain('die');
  });
});

describe('evaluateTriggers — on_interact', () => {
  it('never fires (placeholder)', () => {
    const triggers = [makeTrigger('on_interact', 'talk', {})];
    const fired = evaluateTriggers(makeObj('obj_1'), triggers, 0.016, emptyInput(), new Set(), createTimerState());
    expect(fired).not.toContain('talk');
  });
});

describe('evaluateTriggers — multiple triggers', () => {
  it('can fire multiple behaviors in one frame', () => {
    const triggers = [
      makeTrigger('control', 'jump', { action: 'jump' }),
      makeTrigger('on_collide', 'die', {}),
    ];
    const input = { actions: new Set(['jump']) };
    const collisionEvents = new Set(['die']);
    const fired = evaluateTriggers(makeObj('obj_1'), triggers, 0.016, input, collisionEvents, createTimerState());
    expect(fired).toContain('jump');
    expect(fired).toContain('die');
  });
});

// ── applyEffect ─────────────────────────────────────────────────────────────

describe('applyEffect — targetRef self', () => {
  it('sets x directly', () => {
    const owner = makeObj('obj_1', 5, 10);
    const effect = new BehaviorEffect({ targetRef: 'self', property: 'x', operation: 'set', value: 0 });
    applyEffect(effect, owner, []);
    expect(owner.x).toBe(0);
  });

  it('adds to y', () => {
    const owner = makeObj('obj_1', 0, 5);
    const effect = new BehaviorEffect({ targetRef: 'self', property: 'y', operation: 'add', value: 3 });
    applyEffect(effect, owner, []);
    expect(owner.y).toBe(8);
  });

  it('multiplies x', () => {
    const owner = makeObj('obj_1', 4, 0);
    const effect = new BehaviorEffect({ targetRef: 'self', property: 'x', operation: 'multiply', value: 2 });
    applyEffect(effect, owner, []);
    expect(owner.x).toBe(8);
  });

  it('sets a nested property (properties.health)', () => {
    const owner = makeObj('obj_1', 0, 0, { health: 100 });
    const effect = new BehaviorEffect({ targetRef: 'self', property: 'properties.health', operation: 'set', value: 0 });
    applyEffect(effect, owner, []);
    expect(owner.properties.health).toBe(0);
  });

  it('adds to a nested property', () => {
    const owner = makeObj('obj_1', 0, 0, { score: 10 });
    const effect = new BehaviorEffect({ targetRef: 'self', property: 'properties.score', operation: 'add', value: 5 });
    applyEffect(effect, owner, []);
    expect(owner.properties.score).toBe(15);
  });

  it('sets a string value on a nested property', () => {
    const owner = makeObj('obj_1', 0, 0, { state: 'idle' });
    const effect = new BehaviorEffect({ targetRef: 'self', property: 'properties.state', operation: 'set', value: 'dead' });
    applyEffect(effect, owner, []);
    expect(owner.properties.state).toBe('dead');
  });
});

describe('applyEffect — targetRef by object id', () => {
  it('sets a property on another object by id', () => {
    const owner = makeObj('obj_1');
    const target = makeObj('obj_2', 0, 0, { health: 50 });
    const effect = new BehaviorEffect({ targetRef: 'obj_2', property: 'properties.health', operation: 'add', value: -10 });
    applyEffect(effect, owner, [owner, target]);
    expect(target.properties.health).toBe(40);
  });

  it('does nothing when target id is not found', () => {
    const owner = makeObj('obj_1');
    const effect = new BehaviorEffect({ targetRef: 'unknown', property: 'x', operation: 'set', value: 99 });
    expect(() => applyEffect(effect, owner, [owner])).not.toThrow();
  });
});
