import { BehaviorEffect } from './BehaviorEffect.js';

/**
 * A Behavior defines an action a game object can perform.
 * Behaviors can optionally reference an animation name and carry a list of
 * effects that BehaviorSystem applies when the behavior is activated.
 */
export class Behavior {
  /**
   * @param {object} opts
   * @param {string} opts.id        — unique identifier (e.g. 'move', 'die')
   * @param {string} opts.name      — display name
   * @param {string|null} [opts.animation] — optional animation to play
   * @param {object} [opts.params]  — arbitrary parameters for this behavior
   * @param {BehaviorEffect[]} [opts.effects] — effects applied when this behavior fires
   */
  constructor({ id, name, animation = null, params = {}, effects = [] }) {
    this.id = id;
    this.name = name;
    this.animation = animation;
    this.params = { ...params };
    this.effects = effects.map((e) => (e instanceof BehaviorEffect ? e : BehaviorEffect.fromJSON(e)));
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      animation: this.animation,
      params: { ...this.params },
      effects: this.effects.map((e) => e.toJSON()),
    };
  }

  static fromJSON(data) {
    return new Behavior(data);
  }

  clone() {
    return new Behavior({
      id: this.id,
      name: this.name,
      animation: this.animation,
      params: { ...this.params },
      effects: this.effects.map((e) => e.clone()),
    });
  }
}

/** Standard behaviors always available to any object. */
export const STANDARD_BEHAVIORS = [
  new Behavior({ id: 'move',      name: 'Move',      animation: 'move',      params: { speed: 5, direction: 'right' } }),
  new Behavior({ id: 'die',       name: 'Die',       animation: 'death',     params: {} }),
  new Behavior({ id: 'idle',      name: 'Idle',      animation: 'idle',      params: {} }),
  new Behavior({ id: 'patrol',    name: 'Patrol',    animation: 'move',      params: { speed: 2, distance: 4 } }),
  new Behavior({ id: 'chase',     name: 'Chase',     animation: 'move',      params: { speed: 4, range: 6 } }),
  new Behavior({ id: 'jump',      name: 'Jump',      animation: 'jump',      params: {} }),
  new Behavior({ id: 'fall',      name: 'Fall',      animation: 'fall',      params: {} }),
  new Behavior({ id: 'move_up',   name: 'Move Up',   animation: 'move_up',   params: {} }),
  new Behavior({ id: 'move_down', name: 'Move Down', animation: 'move_down', params: {} }),
];

/**
 * Create a Behavior clone from a standard template by id.
 * @param {string} id
 * @returns {Behavior|null}
 */
export function createBehavior(id) {
  const template = STANDARD_BEHAVIORS.find((b) => b.id === id);
  return template ? template.clone() : null;
}
