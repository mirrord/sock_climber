import { GameObject } from './GameObject.js';
import { getTemplate } from './templates.js';

/**
 * Controller for creating, editing, loading, and saving game objects.
 * Operates on a single "current" object at a time with a persistent library.
 */
export class ObjectEditor {
  constructor() {
    /** @type {GameObject|null} */
    this.current = null;
    /** @type {Array<GameObject>} */
    this.library = [];
  }

  // ---- Create ----

  /** Create a new object from a registered template type. */
  createFromTemplate(type) {
    this.current = getTemplate(type);
  }

  /** Create a blank object with a custom type and name. */
  createBlank(type, name) {
    this.current = new GameObject({ type, name });
  }

  // ---- Load / Save ----

  /** Load an existing object (cloned so edits don't mutate the original). */
  load(gameObject) {
    this.current = gameObject.clone();
  }

  /** Return a cloned snapshot of the current object. */
  save() {
    this._requireCurrent();
    return this.current.clone();
  }

  /** Export current object as a JSON string. */
  exportJSON() {
    this._requireCurrent();
    return JSON.stringify(this.current.toJSON());
  }

  /** Import an object from a JSON string and set it as current. */
  importJSON(jsonStr) {
    const data = JSON.parse(jsonStr);
    this.current = GameObject.fromJSON(data);
  }

  // ---- Library ----

  /** Save a clone of the current object into the library. */
  saveToLibrary() {
    this._requireCurrent();
    this.library.push(this.current.clone());
  }

  /** Load an object from the library by index (cloned). */
  loadFromLibrary(index) {
    const obj = this.library[index];
    if (!obj) return;
    this.current = obj.clone();
  }

  /** Remove an object from the library by index. */
  removeFromLibrary(index) {
    this.library.splice(index, 1);
  }

  // ---- Edit current object ----

  setName(name) {
    this._requireCurrent();
    this.current.name = name;
  }

  setCollisionGroup(group) {
    this._requireCurrent();
    this.current.collisionGroup = group;
  }

  setCollisionMask(mask) {
    this._requireCurrent();
    this.current.collisionMask = mask;
  }

  addBehavior(behavior) {
    this._requireCurrent();
    this.current.addBehavior(behavior);
  }

  removeBehavior(behaviorId) {
    this._requireCurrent();
    this.current.removeBehavior(behaviorId);
  }

  addTrigger(trigger) {
    this._requireCurrent();
    this.current.addTrigger(trigger);
  }

  removeTrigger(index) {
    this._requireCurrent();
    this.current.removeTrigger(index);
  }

  setProperty(key, value) {
    this._requireCurrent();
    this.current.properties[key] = value;
  }

  // ---- Private ----

  _requireCurrent() {
    if (!this.current) throw new Error('No object loaded in ObjectEditor');
  }
}
