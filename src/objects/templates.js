import { GameObject, COLLISION_GROUP } from './GameObject.js';
import { Behavior, createBehavior } from './Behavior.js';
import { BehaviorTrigger } from './BehaviorTrigger.js';

/**
 * Canonical game object templates keyed by type.
 * Each is a frozen blueprint — use getTemplate() to obtain a mutable clone.
 */
export const TEMPLATES = {
  platform: new GameObject({
    type: 'platform',
    name: 'Platform',
    collisionGroup: COLLISION_GROUP.ENVIRONMENT,
    collisionMask: COLLISION_GROUP.PLAYER | COLLISION_GROUP.ENEMY,
    properties: { width: 4, height: 1 },
  }),

  wall: new GameObject({
    type: 'wall',
    name: 'Wall',
    collisionGroup: COLLISION_GROUP.ENVIRONMENT,
    collisionMask: COLLISION_GROUP.PLAYER | COLLISION_GROUP.ENEMY | COLLISION_GROUP.PROJECTILE,
    properties: { width: 1, height: 4 },
  }),

  enemy: (() => {
    const e = new GameObject({
      type: 'enemy',
      name: 'Enemy',
      collisionGroup: COLLISION_GROUP.ENEMY,
      collisionMask: COLLISION_GROUP.PLAYER | COLLISION_GROUP.ENVIRONMENT | COLLISION_GROUP.PROJECTILE,
      properties: { hp: 1, damage: 1 },
    });
    e.addBehavior(createBehavior('move'));
    e.addBehavior(createBehavior('die'));
    e.addBehavior(createBehavior('patrol'));
    e.addTrigger(new BehaviorTrigger({ type: 'proximity', behaviorId: 'chase', params: { radius: 6 } }));
    e.addTrigger(new BehaviorTrigger({ type: 'on_collide', behaviorId: 'die', params: { with: 'projectile' } }));
    return e;
  })(),

  spawn_point: new GameObject({
    type: 'spawn_point',
    name: 'Spawn Point',
    collisionGroup: COLLISION_GROUP.NONE,
    collisionMask: COLLISION_GROUP.NONE,
    properties: { playerIndex: 0 },
  }),

  collectible: (() => {
    const c = new GameObject({
      type: 'collectible',
      name: 'Collectible',
      collisionGroup: COLLISION_GROUP.COLLECTIBLE,
      collisionMask: COLLISION_GROUP.PLAYER,
      properties: { value: 1, scoreType: 'coin' },
    });
    c.addBehavior(new Behavior({ id: 'collect', name: 'Collect', animation: 'pickup', params: {} }));
    c.addTrigger(new BehaviorTrigger({ type: 'on_collide', behaviorId: 'collect', params: { with: 'player' } }));
    return c;
  })(),

  level_end: (() => {
    const le = new GameObject({
      type: 'level_end',
      name: 'Level End',
      collisionGroup: COLLISION_GROUP.TRIGGER,
      collisionMask: COLLISION_GROUP.PLAYER,
      properties: { nextLevel: '' },
    });
    le.addBehavior(new Behavior({ id: 'complete_level', name: 'Complete Level', animation: 'victory', params: {} }));
    le.addTrigger(new BehaviorTrigger({ type: 'on_collide', behaviorId: 'complete_level', params: { with: 'player' } }));
    return le;
  })(),

  event_trigger: (() => {
    const et = new GameObject({
      type: 'event_trigger',
      name: 'Event Trigger',
      collisionGroup: COLLISION_GROUP.TRIGGER,
      collisionMask: COLLISION_GROUP.PLAYER,
      properties: { eventName: '', oneShot: true },
    });
    et.addBehavior(new Behavior({ id: 'fire_event', name: 'Fire Event', animation: null, params: {} }));
    et.addTrigger(new BehaviorTrigger({ type: 'proximity', behaviorId: 'fire_event', params: { radius: 2 } }));
    return et;
  })(),

  player: (() => {
    const p = new GameObject({
      type: 'player',
      name: 'Player',
      collisionGroup: COLLISION_GROUP.PLAYER,
      collisionMask: COLLISION_GROUP.ENVIRONMENT | COLLISION_GROUP.ENEMY | COLLISION_GROUP.COLLECTIBLE | COLLISION_GROUP.TRIGGER,
      properties: { enableGravity: true },
      animations: [
        { id: 'a_idle',      name: 'idle',      spriteSheetId: null, frameWidth: 32, frameHeight: 32, frameStart: 0, frameCount: 1, fps: 1, loop: true },
        { id: 'a_run',       name: 'run',       spriteSheetId: null, frameWidth: 32, frameHeight: 32, frameStart: 1, frameCount: 1, fps: 1, loop: true },
        { id: 'a_jump',      name: 'jump',      spriteSheetId: null, frameWidth: 32, frameHeight: 32, frameStart: 2, frameCount: 1, fps: 1, loop: false },
        { id: 'a_crouch',    name: 'crouch',    spriteSheetId: null, frameWidth: 32, frameHeight: 32, frameStart: 3, frameCount: 1, fps: 1, loop: true },
        { id: 'a_dash',      name: 'dash',      spriteSheetId: null, frameWidth: 32, frameHeight: 32, frameStart: 4, frameCount: 1, fps: 1, loop: false },
        { id: 'a_fall',      name: 'fall',      spriteSheetId: null, frameWidth: 32, frameHeight: 32, frameStart: 2, frameCount: 1, fps: 1, loop: false },
        { id: 'a_move_up',   name: 'move_up',   spriteSheetId: null, frameWidth: 32, frameHeight: 32, frameStart: 2, frameCount: 1, fps: 1, loop: false },
        { id: 'a_move_down', name: 'move_down', spriteSheetId: null, frameWidth: 32, frameHeight: 32, frameStart: 2, frameCount: 1, fps: 1, loop: false },
      ],
    });
    p.addBehavior(new Behavior({ id: 'jump',       name: 'Jump',       animation: 'jump',      params: {} }));
    p.addBehavior(new Behavior({ id: 'fall',       name: 'Fall',       animation: 'fall',      params: {} }));
    p.addBehavior(new Behavior({ id: 'move_up',    name: 'Move Up',    animation: 'move_up',   params: {} }));
    p.addBehavior(new Behavior({ id: 'move_down',  name: 'Move Down',  animation: 'move_down', params: {} }));
    p.addBehavior(new Behavior({ id: 'move_left',  name: 'Move Left',  animation: 'run',       params: {} }));
    p.addBehavior(new Behavior({ id: 'move_right', name: 'Move Right', animation: 'run',       params: {} }));
    p.addBehavior(new Behavior({ id: 'crouch',     name: 'Crouch',     animation: 'crouch',    params: {} }));
    p.addBehavior(new Behavior({ id: 'dash',       name: 'Dash',       animation: 'dash',      params: {} }));
    p.addTrigger(new BehaviorTrigger({ type: 'control', behaviorId: 'jump',       params: { action: 'jump'      } }));
    p.addTrigger(new BehaviorTrigger({ type: 'control', behaviorId: 'move_left',  params: { action: 'moveLeft'  } }));
    p.addTrigger(new BehaviorTrigger({ type: 'control', behaviorId: 'move_right', params: { action: 'moveRight' } }));
    p.addTrigger(new BehaviorTrigger({ type: 'control', behaviorId: 'crouch',     params: { action: 'crouch'    } }));
    p.addTrigger(new BehaviorTrigger({ type: 'control', behaviorId: 'dash',       params: { action: 'dash'      } }));
    return p;
  })(),
};

/**
 * Get a cloned template by type.
 * @param {string} type
 * @returns {GameObject|null}
 */
export function getTemplate(type) {
  const t = TEMPLATES[type];
  return t ? t.clone() : null;
}

/**
 * List all available templates (type + name).
 * @returns {Array<{type: string, name: string}>}
 */
export function getTemplateList() {
  return Object.values(TEMPLATES).map((t) => ({ type: t.type, name: t.name }));
}
