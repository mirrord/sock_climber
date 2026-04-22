import { Behavior, STANDARD_BEHAVIORS, createBehavior } from './Behavior.js';
import { BehaviorEffect } from './BehaviorEffect.js';

/**
 * Controller for creating, editing, and managing a library of Behaviors.
 * Operates on a single "current" behavior at a time.
 *
 * Mirrors the pattern of ObjectEditor.
 */
export class BehaviorEditor {
  constructor() {
    /** @type {Behavior|null} */
    this.current = null;
    /** @type {Behavior[]} */
    this.library = [];
  }

  // ---- Create ----

  /**
   * Create a new behavior by cloning a standard template.
   * @param {string} id — id of the standard behavior to clone
   */
  createFromStandard(id) {
    const b = createBehavior(id);
    if (!b) throw new Error(`No standard behavior with id '${id}'`);
    this.current = b;
  }

  /**
   * Create a blank custom behavior.
   * @param {string} id
   * @param {string} name
   */
  createBlank(id, name) {
    this.current = new Behavior({ id, name });
  }

  // ---- Load / Save ----

  /** Load an existing behavior (cloned so edits don't mutate the original). */
  load(behavior) {
    this.current = behavior.clone();
  }

  /** Return a cloned snapshot of the current behavior. */
  save() {
    this._requireCurrent();
    return this.current.clone();
  }

  /** Export current behavior as a JSON string. */
  exportJSON() {
    this._requireCurrent();
    return JSON.stringify(this.current.toJSON());
  }

  /** Import a behavior from a JSON string and set it as current. */
  importJSON(jsonStr) {
    const data = JSON.parse(jsonStr);
    this.current = Behavior.fromJSON(data);
  }

  // ---- Library ----

  /** Save a clone of the current behavior into the library. */
  saveToLibrary() {
    this._requireCurrent();
    this.library.push(this.current.clone());
  }

  /** Load a behavior from the library by index (cloned). */
  loadFromLibrary(index) {
    const b = this.library[index];
    if (!b) return;
    this.current = b.clone();
  }

  /** Remove a behavior from the library by index. */
  removeFromLibrary(index) {
    this.library.splice(index, 1);
  }

  // ---- Edit current behavior ----

  setName(name) {
    this._requireCurrent();
    this.current.name = name;
  }

  setAnimation(animation) {
    this._requireCurrent();
    this.current.animation = animation;
  }

  /**
   * Add or update a param on the current behavior.
   * @param {string} key
   * @param {*} value
   */
  setParam(key, value) {
    this._requireCurrent();
    this.current.params[key] = value;
  }

  /**
   * Remove a param from the current behavior.
   * @param {string} key
   */
  removeParam(key) {
    this._requireCurrent();
    delete this.current.params[key];
  }

  // ---- Effects ----

  /**
   * Add a BehaviorEffect to the current behavior.
   * @param {BehaviorEffect} effect
   */
  addEffect(effect) {
    this._requireCurrent();
    this.current.effects.push(effect);
  }

  /**
   * Remove a BehaviorEffect by index.
   * @param {number} index
   */
  removeEffect(index) {
    this._requireCurrent();
    this.current.effects.splice(index, 1);
  }

  /**
   * Patch fields of a BehaviorEffect by index.
   * @param {number} index
   * @param {Partial<BehaviorEffect>} patch
   */
  updateEffect(index, patch) {
    this._requireCurrent();
    const eff = this.current.effects[index];
    if (eff) Object.assign(eff, patch);
  }

  // ---- Private ----

  _requireCurrent() {
    if (!this.current) throw new Error('No behavior loaded in BehaviorEditor');
  }
}
