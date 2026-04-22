/**
 * Supported operations a BehaviorEffect can apply to a property.
 * 'spawn'   — create a new runtime object using spawnSpec
 * 'destroy' — remove the target object from the runtime
 * @type {string[]}
 */
export const OPERATIONS = ['set', 'add', 'multiply', 'spawn', 'destroy'];

/**
 * A BehaviorEffect describes a single mutation to a property of an object in
 * the level. Effects are collected on a Behavior and executed by BehaviorSystem
 * when the behavior is activated.
 *
 * For 'spawn' effects, `spawnSpec` carries the spawn parameters.
 * For 'destroy' effects, the target identified by `targetRef` is removed.
 * `targetRef` may be 'self', 'target' (the contact object), or an object ID.
 */
export class BehaviorEffect {
  /**
   * @param {object} opts
   * @param {string} opts.targetRef   — 'self', 'target', or a level object ID
   * @param {string} opts.property    — dot-path: 'x', 'y', or 'properties.<key>'
   * @param {'set'|'add'|'multiply'|'spawn'|'destroy'} opts.operation
   * @param {number|string|boolean} opts.value — value to apply (ignored for spawn/destroy)
   * @param {SpawnSpec|null} [opts.spawnSpec]  — required when operation === 'spawn'
   */
  constructor({ targetRef, property, operation, value, spawnSpec = null }) {
    this.targetRef = targetRef;
    this.property = property;
    this.operation = operation;
    this.value = value;
    /** @type {SpawnSpec|null} */
    this.spawnSpec = spawnSpec;
  }

  toJSON() {
    return {
      targetRef: this.targetRef,
      property: this.property,
      operation: this.operation,
      value: this.value,
      spawnSpec: this.spawnSpec ? { ...this.spawnSpec, properties: { ...this.spawnSpec.properties } } : null,
    };
  }

  static fromJSON(data) {
    return new BehaviorEffect(data);
  }

  clone() {
    return new BehaviorEffect({
      targetRef: this.targetRef,
      property: this.property,
      operation: this.operation,
      value: this.value,
      spawnSpec: this.spawnSpec ? { ...this.spawnSpec, properties: { ...this.spawnSpec.properties } } : null,
    });
  }
}

/**
 * @typedef {object} SpawnSpec
 * @property {string} objectType  — template type to spawn (e.g. 'projectile')
 * @property {number} offsetX     — x offset relative to owner position
 * @property {number} offsetY     — y offset relative to owner position
 * @property {number} velocityX   — initial horizontal velocity (stored in runtime obj properties)
 * @property {number} velocityY   — initial vertical velocity
 * @property {object} properties  — extra property overrides merged onto the spawned object
 * @property {number} lifetime    — seconds before the object is auto-destroyed (0 = infinite)
 */
