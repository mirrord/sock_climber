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

  /**
   * Set the animation linked to a specific behavior.
   * @param {string} behaviorId
   * @param {string|null} animationName
   */
  setBehaviorAnimation(behaviorId, animationName) {
    this._requireCurrent();
    const b = this.current.behaviors.find((bh) => bh.id === behaviorId);
    if (b) b.animation = animationName;
  }

  /**
   * Rename a behavior.
   * @param {string} behaviorId
   * @param {string} name
   */
  setBehaviorName(behaviorId, name) {
    this._requireCurrent();
    const b = this.current.behaviors.find((bh) => bh.id === behaviorId);
    if (b) b.name = name;
  }

  /**
   * Set a param key on a behavior.
   * @param {string} behaviorId
   * @param {string} key
   * @param {*} value
   */
  setBehaviorParam(behaviorId, key, value) {
    this._requireCurrent();
    const b = this.current.behaviors.find((bh) => bh.id === behaviorId);
    if (b) b.params[key] = value;
  }

  /**
   * Remove a param key from a behavior.
   * @param {string} behaviorId
   * @param {string} key
   */
  removeBehaviorParam(behaviorId, key) {
    this._requireCurrent();
    const b = this.current.behaviors.find((bh) => bh.id === behaviorId);
    if (b) delete b.params[key];
  }

  /**
   * Append an effect to a specific behavior.
   * @param {string} behaviorId
   * @param {import('./BehaviorEffect.js').BehaviorEffect} effect
   */
  addEffectToBehavior(behaviorId, effect) {
    this._requireCurrent();
    const b = this.current.behaviors.find((bh) => bh.id === behaviorId);
    if (b) b.effects.push(effect);
  }

  /**
   * Remove an effect from a behavior by index.
   * @param {string} behaviorId
   * @param {number} index
   */
  removeEffectFromBehavior(behaviorId, index) {
    this._requireCurrent();
    const b = this.current.behaviors.find((bh) => bh.id === behaviorId);
    if (b) b.effects.splice(index, 1);
  }

  /**
   * Patch fields of an existing effect on a behavior.
   * @param {string} behaviorId
   * @param {number} index
   * @param {object} patch
   */
  updateEffectOnBehavior(behaviorId, index, patch) {
    this._requireCurrent();
    const b = this.current.behaviors.find((bh) => bh.id === behaviorId);
    if (b && b.effects[index]) Object.assign(b.effects[index], patch);
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

  // ---- Animations ----

  /** Add a sprite animation definition to the current object. */
  addAnimation(anim) {
    this._requireCurrent();
    this.current.animations.push({ ...anim });
  }

  /** Remove a sprite animation by id. */
  removeAnimation(animId) {
    this._requireCurrent();
    const idx = this.current.animations.findIndex((a) => a.id === animId);
    if (idx !== -1) this.current.animations.splice(idx, 1);
  }

  /** Overwrite fields of an existing animation by id. */
  updateAnimation(animId, patch) {
    this._requireCurrent();
    const anim = this.current.animations.find((a) => a.id === animId);
    if (anim) Object.assign(anim, patch);
  }

  // ---- Private ----

  _requireCurrent() {
    if (!this.current) throw new Error('No object loaded in ObjectEditor');
  }
}
