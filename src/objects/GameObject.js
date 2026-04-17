import { Behavior } from './Behavior.js';
import { BehaviorTrigger } from './BehaviorTrigger.js';

let _nextId = 1;

/** Collision group bit flags. */
export const COLLISION_GROUP = {
  NONE:        0,
  PLAYER:      1 << 0,   // 1
  ENVIRONMENT: 1 << 1,   // 2
  ENEMY:       1 << 2,   // 4
  COLLECTIBLE: 1 << 3,   // 8
  TRIGGER:     1 << 4,   // 16
  PROJECTILE:  1 << 5,   // 32
};

/**
 * A GameObject represents any placeable entity in a level.
 */
export class GameObject {
  /**
   * @param {object} opts
   * @param {string} opts.type           — template type (e.g. 'platform', 'enemy')
   * @param {string} opts.name           — display name
   * @param {number} [opts.collisionGroup] — which group this belongs to
   * @param {number} [opts.collisionMask]  — which groups this collides with
   * @param {Array<Behavior>} [opts.behaviors]
   * @param {Array<BehaviorTrigger>} [opts.triggers]
   * @param {object} [opts.properties]   — arbitrary key/value properties
   * @param {string} [opts.id]           — unique id (auto-generated if omitted)
   */
  constructor({
    type,
    name,
    collisionGroup = COLLISION_GROUP.NONE,
    collisionMask = COLLISION_GROUP.NONE,
    behaviors = [],
    triggers = [],
    properties = {},
    animations = [],
    id = null,
  }) {
    this.id = id || `obj_${_nextId++}`;
    this.type = type;
    this.name = name;
    this.collisionGroup = collisionGroup;
    this.collisionMask = collisionMask;
    this.behaviors = behaviors;
    this.triggers = triggers;
    this.properties = { ...properties };
    this.animations = animations.map((a) => ({ ...a }));
  }

  /** @param {Behavior} behavior */
  addBehavior(behavior) {
    this.behaviors.push(behavior);
  }

  /** Remove first behavior with matching id. */
  removeBehavior(behaviorId) {
    const idx = this.behaviors.findIndex((b) => b.id === behaviorId);
    if (idx !== -1) this.behaviors.splice(idx, 1);
  }

  /** @param {BehaviorTrigger} trigger */
  addTrigger(trigger) {
    this.triggers.push(trigger);
  }

  /** Remove trigger by index. */
  removeTrigger(index) {
    this.triggers.splice(index, 1);
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      collisionGroup: this.collisionGroup,
      collisionMask: this.collisionMask,
      behaviors: this.behaviors.map((b) => b.toJSON()),
      triggers: this.triggers.map((t) => t.toJSON()),
      properties: { ...this.properties },
      animations: this.animations.map((a) => ({ ...a })),
    };
  }

  static fromJSON(data) {
    return new GameObject({
      ...data,
      behaviors: (data.behaviors || []).map((b) => Behavior.fromJSON(b)),
      triggers: (data.triggers || []).map((t) => BehaviorTrigger.fromJSON(t)),
      animations: data.animations || [],
    });
  }

  clone() {
    return new GameObject({
      id: null, // new unique id
      type: this.type,
      name: this.name,
      collisionGroup: this.collisionGroup,
      collisionMask: this.collisionMask,
      behaviors: this.behaviors.map((b) => b.clone()),
      triggers: this.triggers.map((t) => t.clone()),
      properties: { ...this.properties },
      animations: this.animations.map((a) => ({ ...a })),
    });
  }
}
