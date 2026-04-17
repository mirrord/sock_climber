import { Level } from './Level.js';

/**
 * In-memory level store. Saves/loads levels by name.
 * Acts as the backing store for level select.
 */
export class LevelStore {
  constructor() {
    /** @type {Map<string, object>} — serialized level data keyed by name */
    this._levels = new Map();
  }

  /** @returns {string[]} sorted list of saved level names */
  list() {
    return Array.from(this._levels.keys());
  }

  /**
   * Save a level under the given name (overwrites if exists).
   * @param {string} name
   * @param {Level} level
   */
  save(name, level) {
    this._levels.set(name, level.toJSON());
  }

  /**
   * Load a level by name. Returns a new Level instance or null.
   * @param {string} name
   * @returns {Level|null}
   */
  load(name) {
    const data = this._levels.get(name);
    if (!data) return null;
    return Level.fromJSON(data);
  }

  /** Delete a level by name. */
  delete(name) {
    this._levels.delete(name);
  }
}
