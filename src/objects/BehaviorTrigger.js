/** All supported trigger types. */
export const TRIGGER_TYPES = [
  'timer',
  'proximity',
  'stat_change',
  'on_collide',
  'on_interact',
];

/**
 * A BehaviorTrigger links a trigger condition to a behavior id.
 */
export class BehaviorTrigger {
  /**
   * @param {object} opts
   * @param {string} opts.type        — one of TRIGGER_TYPES
   * @param {string} opts.behaviorId  — which behavior this activates
   * @param {object} [opts.params]    — trigger-specific parameters
   */
  constructor({ type, behaviorId, params = {} }) {
    this.type = type;
    this.behaviorId = behaviorId;
    this.params = { ...params };
  }

  toJSON() {
    return {
      type: this.type,
      behaviorId: this.behaviorId,
      params: { ...this.params },
    };
  }

  static fromJSON(data) {
    return new BehaviorTrigger(data);
  }

  clone() {
    return new BehaviorTrigger({
      type: this.type,
      behaviorId: this.behaviorId,
      params: { ...this.params },
    });
  }
}
