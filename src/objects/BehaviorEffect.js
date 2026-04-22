/**
 * Supported operations a BehaviorEffect can apply to a property.
 * @type {string[]}
 */
export const OPERATIONS = ['set', 'add', 'multiply'];

/**
 * A BehaviorEffect describes a single mutation to a property of an object in
 * the level. Effects are collected on a Behavior and executed by BehaviorSystem
 * when the behavior is activated.
 */
export class BehaviorEffect {
  /**
   * @param {object} opts
   * @param {string} opts.targetRef   — 'self' or a level object ID string
   * @param {string} opts.property    — dot-path: 'x', 'y', or 'properties.<key>'
   * @param {'set'|'add'|'multiply'} opts.operation — how to apply the value
   * @param {number|string|boolean} opts.value — value to apply
   */
  constructor({ targetRef, property, operation, value }) {
    this.targetRef = targetRef;
    this.property = property;
    this.operation = operation;
    this.value = value;
  }

  toJSON() {
    return {
      targetRef: this.targetRef,
      property: this.property,
      operation: this.operation,
      value: this.value,
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
    });
  }
}
