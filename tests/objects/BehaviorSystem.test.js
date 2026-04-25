import { describe, it, expect, beforeEach } from 'vitest';
import {
  evaluateTriggers,
  applyEffect,
  createTimerState,
  detectContacts,
  executeBehavior,
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

// ── detectContacts ─────────────────────────────────────────────────────────

import { Behavior } from '../../src/objects/Behavior.js';

function makeObjSized(id, x, y, w = 1, h = 1) {
  return { id, x, y, properties: { width: w, height: h } };
}

describe('detectContacts', () => {
  it('returns a Map', () => {
    const result = detectContacts([]);
    expect(result).toBeInstanceOf(Map);
  });

  it('detects overlap between two touching objects', () => {
    // Two 1×1 objects at same position — clearly overlapping
    const a = makeObjSized('a', 0, 0, 1, 1);
    const b = makeObjSized('b', 0.5, 0, 1, 1);
    const contacts = detectContacts([a, b]);
    expect(contacts.get('a')).toContain('b');
    expect(contacts.get('b')).toContain('a');
  });

  it('does not report non-overlapping objects', () => {
    const a = makeObjSized('a', 0, 0, 1, 1);
    const b = makeObjSized('b', 10, 0, 1, 1);
    const contacts = detectContacts([a, b]);
    expect(contacts.get('a') ?? []).not.toContain('b');
  });

  it('does not report self-contact', () => {
    const a = makeObjSized('a', 0, 0, 1, 1);
    const contacts = detectContacts([a]);
    expect(contacts.get('a') ?? []).not.toContain('a');
  });

  it('defaults to 1×1 hitbox when properties.width/height are absent', () => {
    const a = { id: 'a', x: 0, y: 0, properties: {} };
    const b = { id: 'b', x: 0.5, y: 0, properties: {} };
    const contacts = detectContacts([a, b]);
    expect(contacts.get('a')).toContain('b');
  });
});

// ── executeBehavior ────────────────────────────────────────────────────────

describe('executeBehavior — normal effects', () => {
  it('applies non-spawn effects and returns empty spawn/destroy lists', () => {
    const owner = makeObj('o', 5, 5);
    const behavior = new Behavior({ id: 'move', name: 'Move', animation: null, params: {} });
    behavior.effects = [new BehaviorEffect({ targetRef: 'self', property: 'x', operation: 'add', value: 1 })];
    const result = executeBehavior(behavior, owner, [owner], new Map());
    expect(owner.x).toBe(6);
    expect(result.spawnRequests).toHaveLength(0);
    expect(result.destroyIds).toHaveLength(0);
  });

  it('resolves target via contacts map', () => {
    const owner = makeObj('o', 0, 0);
    const target = makeObj('t', 0, 0, { health: 10 });
    const contacts = new Map([['o', ['t']]]);
    const behavior = new Behavior({ id: 'hit', name: 'Hit', animation: null, params: {} });
    behavior.effects = [new BehaviorEffect({ targetRef: 'target', property: 'properties.health', operation: 'add', value: -5 })];
    executeBehavior(behavior, owner, [owner, target], contacts);
    expect(target.properties.health).toBe(5);
  });
});

describe('executeBehavior — spawn effect', () => {
  it('produces a spawnRequest for spawn operation', () => {
    const owner = makeObj('o', 3, 4);
    const behavior = new Behavior({ id: 'shoot', name: 'Shoot', animation: null, params: {} });
    behavior.effects = [new BehaviorEffect({
      targetRef: 'self',
      property: '',
      operation: 'spawn',
      value: 0,
      spawnSpec: { objectType: 'projectile', offsetX: 1, offsetY: 0, velocityX: 8, velocityY: 0, properties: {}, lifetime: 2 },
    })];
    const result = executeBehavior(behavior, owner, [owner], new Map());
    expect(result.spawnRequests).toHaveLength(1);
    const req = result.spawnRequests[0];
    expect(req.objectType).toBe('projectile');
    expect(req.x).toBe(4);   // owner.x + offsetX
    expect(req.y).toBe(4);   // owner.y + offsetY
    expect(req.velocityX).toBe(8);
    expect(req.lifetime).toBe(2);
    expect(req.ownerId).toBe('o');
  });

  it('ignores spawn effect when spawnSpec is null', () => {
    const owner = makeObj('o', 0, 0);
    const behavior = new Behavior({ id: 'b', name: 'B', animation: null, params: {} });
    behavior.effects = [new BehaviorEffect({ targetRef: 'self', property: '', operation: 'spawn', value: 0, spawnSpec: null })];
    const result = executeBehavior(behavior, owner, [owner], new Map());
    expect(result.spawnRequests).toHaveLength(0);
  });
});

describe('executeBehavior — destroy effect', () => {
  it('produces a destroyId for destroy operation targeting self', () => {
    const owner = makeObj('o', 0, 0);
    const behavior = new Behavior({ id: 'die', name: 'Die', animation: null, params: {} });
    behavior.effects = [new BehaviorEffect({ targetRef: 'self', property: '', operation: 'destroy', value: 0 })];
    const result = executeBehavior(behavior, owner, [owner], new Map());
    expect(result.destroyIds).toContain('o');
  });

  it('produces a destroyId for destroy operation targeting contact', () => {
    const owner = makeObj('o', 0, 0);
    const target = makeObj('t', 0, 0);
    const contacts = new Map([['o', ['t']]]);
    const behavior = new Behavior({ id: 'kill', name: 'Kill', animation: null, params: {} });
    behavior.effects = [new BehaviorEffect({ targetRef: 'target', property: '', operation: 'destroy', value: 0 })];
    const result = executeBehavior(behavior, owner, [owner, target], contacts);
    expect(result.destroyIds).toContain('t');
  });
});

describe('applyEffect — target resolution via contacts', () => {
  it('resolves target from contacts when targetRef is "target"', () => {
    const owner = makeObj('o', 0, 0);
    const target = makeObj('t', 0, 0, { hp: 10 });
    const contacts = new Map([['o', ['t']]]);
    const effect = new BehaviorEffect({ targetRef: 'target', property: 'properties.hp', operation: 'add', value: -3 });
    applyEffect(effect, owner, [owner, target], contacts);
    expect(target.properties.hp).toBe(7);
  });

  it('does nothing when contacts is empty and targetRef is "target"', () => {
    const owner = makeObj('o', 0, 0);
    const effect = new BehaviorEffect({ targetRef: 'target', property: 'x', operation: 'set', value: 99 });
    expect(() => applyEffect(effect, owner, [owner], new Map())).not.toThrow();
    expect(owner.x).toBe(0);
  });
});

// ── evaluateTriggers — proximity radius param (Fix #4) ────────────────────────

describe('evaluateTriggers — proximity radius param', () => {
  it('fires when trigger uses "radius" param and object is within range', () => {
    const triggers = [makeTrigger('proximity', 'chase', { radius: 5 })];
    const owner = makeObj('obj_1', 0, 0);
    const others = [makeObj('player', 3, 4)]; // distance = 5
    const fired = evaluateTriggers(owner, triggers, 0.016, emptyInput(), new Set(), createTimerState(), others);
    expect(fired).toContain('chase');
  });

  it('does not fire when trigger uses "radius" param and object is out of range', () => {
    const triggers = [makeTrigger('proximity', 'chase', { radius: 3 })];
    const owner = makeObj('obj_1', 0, 0);
    const others = [makeObj('player', 10, 10)];
    const fired = evaluateTriggers(owner, triggers, 0.016, emptyInput(), new Set(), createTimerState(), others);
    expect(fired).not.toContain('chase');
  });

  it('also still works with legacy "range" param', () => {
    const triggers = [makeTrigger('proximity', 'chase', { range: 5 })];
    const owner = makeObj('obj_1', 0, 0);
    const others = [makeObj('player', 3, 4)];
    const fired = evaluateTriggers(owner, triggers, 0.016, emptyInput(), new Set(), createTimerState(), others);
    expect(fired).toContain('chase');
  });
});

// ── evaluateTriggers — stat_change fires on transition only (Fix #5) ──────────

describe('evaluateTriggers — stat_change fires on transition', () => {
  it('fires on the first frame the condition becomes true', () => {
    const triggers = [makeTrigger('stat_change', 'die', { property: 'health', threshold: 0, comparison: 'lte' })];
    const owner = makeObj('obj_1', 0, 0, { health: -5 });
    const timerState = createTimerState();
    const fired = evaluateTriggers(owner, triggers, 0.016, emptyInput(), new Set(), timerState);
    expect(fired).toContain('die');
  });

  it('does NOT fire again on the second consecutive frame when condition still holds', () => {
    const triggers = [makeTrigger('stat_change', 'die', { property: 'health', threshold: 0, comparison: 'lte' })];
    const owner = makeObj('obj_1', 0, 0, { health: -5 });
    const timerState = createTimerState();
    evaluateTriggers(owner, triggers, 0.016, emptyInput(), new Set(), timerState); // first: fires
    const fired2 = evaluateTriggers(owner, triggers, 0.016, emptyInput(), new Set(), timerState); // second: should NOT fire
    expect(fired2).not.toContain('die');
  });

  it('fires again after the condition resets (false → true transition)', () => {
    const triggers = [makeTrigger('stat_change', 'die', { property: 'health', threshold: 0, comparison: 'lte' })];
    const owner = makeObj('obj_1', 0, 0, { health: -5 });
    const timerState = createTimerState();
    evaluateTriggers(owner, triggers, 0.016, emptyInput(), new Set(), timerState); // fires
    owner.properties.health = 10; // condition now false
    evaluateTriggers(owner, triggers, 0.016, emptyInput(), new Set(), timerState); // resets
    owner.properties.health = -5; // condition true again
    const fired3 = evaluateTriggers(owner, triggers, 0.016, emptyInput(), new Set(), timerState);
    expect(fired3).toContain('die');
  });
});
