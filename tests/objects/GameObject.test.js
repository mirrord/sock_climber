import { describe, it, expect } from 'vitest';
import {
  GameObject,
  COLLISION_GROUP,
} from '../../src/objects/GameObject.js';
import { Behavior } from '../../src/objects/Behavior.js';
import { BehaviorTrigger } from '../../src/objects/BehaviorTrigger.js';

describe('COLLISION_GROUP', () => {
  it('has expected groups as bit flags', () => {
    expect(COLLISION_GROUP.NONE).toBe(0);
    expect(COLLISION_GROUP.PLAYER).toBe(1);
    expect(COLLISION_GROUP.ENVIRONMENT & COLLISION_GROUP.PLAYER).toBe(0); // distinct
    expect(COLLISION_GROUP.ENEMY & COLLISION_GROUP.PLAYER).toBe(0);
  });
});

describe('GameObject', () => {
  it('creates with required fields', () => {
    const obj = new GameObject({
      type: 'platform',
      name: 'Stone Platform',
    });
    expect(obj.type).toBe('platform');
    expect(obj.name).toBe('Stone Platform');
    expect(obj.collisionGroup).toBe(COLLISION_GROUP.NONE);
    expect(obj.collisionMask).toBe(COLLISION_GROUP.NONE);
    expect(obj.behaviors).toEqual([]);
    expect(obj.triggers).toEqual([]);
    expect(obj.properties).toEqual({});
  });

  it('accepts collision group and mask', () => {
    const obj = new GameObject({
      type: 'wall',
      name: 'Brick Wall',
      collisionGroup: COLLISION_GROUP.ENVIRONMENT,
      collisionMask: COLLISION_GROUP.PLAYER | COLLISION_GROUP.ENEMY,
    });
    expect(obj.collisionGroup).toBe(COLLISION_GROUP.ENVIRONMENT);
    expect(obj.collisionMask & COLLISION_GROUP.PLAYER).toBeTruthy();
    expect(obj.collisionMask & COLLISION_GROUP.ENEMY).toBeTruthy();
  });

  it('adds and removes behaviors', () => {
    const obj = new GameObject({ type: 'enemy', name: 'Slime' });
    const moveBeh = new Behavior({ id: 'move', name: 'Move', params: { speed: 2 } });
    obj.addBehavior(moveBeh);
    expect(obj.behaviors).toHaveLength(1);
    expect(obj.behaviors[0].id).toBe('move');

    obj.removeBehavior('move');
    expect(obj.behaviors).toHaveLength(0);
  });

  it('adds and removes triggers', () => {
    const obj = new GameObject({ type: 'enemy', name: 'Slime' });
    const trig = new BehaviorTrigger({ type: 'proximity', behaviorId: 'move', params: { radius: 5 } });
    obj.addTrigger(trig);
    expect(obj.triggers).toHaveLength(1);

    obj.removeTrigger(0);
    expect(obj.triggers).toHaveLength(0);
  });

  it('serializes to JSON and back', () => {
    const obj = new GameObject({
      type: 'enemy',
      name: 'Slime',
      collisionGroup: COLLISION_GROUP.ENEMY,
      collisionMask: COLLISION_GROUP.PLAYER,
      properties: { hp: 3 },
    });
    obj.addBehavior(new Behavior({ id: 'move', name: 'Move', params: { speed: 2 } }));
    obj.addTrigger(new BehaviorTrigger({ type: 'proximity', behaviorId: 'move', params: { radius: 4 } }));

    const json = obj.toJSON();
    const restored = GameObject.fromJSON(json);

    expect(restored.type).toBe('enemy');
    expect(restored.name).toBe('Slime');
    expect(restored.collisionGroup).toBe(COLLISION_GROUP.ENEMY);
    expect(restored.behaviors).toHaveLength(1);
    expect(restored.behaviors[0].id).toBe('move');
    expect(restored.triggers).toHaveLength(1);
    expect(restored.triggers[0].type).toBe('proximity');
    expect(restored.properties.hp).toBe(3);
  });

  it('clones deeply', () => {
    const obj = new GameObject({ type: 'enemy', name: 'Slime', properties: { hp: 3 } });
    obj.addBehavior(new Behavior({ id: 'die', name: 'Die' }));
    const clone = obj.clone();
    clone.name = 'Big Slime';
    clone.properties.hp = 10;
    clone.behaviors[0].params.test = true;

    expect(obj.name).toBe('Slime');
    expect(obj.properties.hp).toBe(3);
    expect(obj.behaviors[0].params.test).toBeUndefined();
  });

  it('generates a unique id on creation', () => {
    const a = new GameObject({ type: 'wall', name: 'A' });
    const b = new GameObject({ type: 'wall', name: 'B' });
    expect(a.id).toBeTruthy();
    expect(b.id).toBeTruthy();
    expect(a.id).not.toBe(b.id);
  });
});
