import { Level } from './Level.js';
import { ASSET_CATEGORY } from '../assets/AssetManifest.js';

/**
 * Level store backed by AssetStore for persistence.
 * Falls back to in-memory storage when no AssetStore is provided.
 */
export class LevelStore {
  /**
   * @param {import('../assets/AssetStore.js').AssetStore} [assetStore]
   */
  constructor(assetStore = null) {
    this._assetStore = assetStore;
    /** @type {Map<string, object>} — in-memory fallback */
    this._levels = new Map();
  }

  /**
   * @returns {string[]} sorted list of saved level names
   */
  list() {
    if (this._assetStore) {
      return this._assetStore.list(ASSET_CATEGORY.LEVELS).map(e => e.id);
    }
    return Array.from(this._levels.keys());
  }

  /**
   * Save a level under the given name (overwrites if exists).
   * @param {string} name
   * @param {Level} level
   * @param {object} [deps] — dependency lists for the manifest
   * @param {string[]} [deps.objects]
   * @param {string[]} [deps.sprites]
   * @param {string[]} [deps.sounds]
   * @param {string[]} [deps.music]
   */
  save(name, level, deps = {}) {
    const data = level.toJSON();
    if (this._assetStore) {
      this._assetStore.save(ASSET_CATEGORY.LEVELS, name, name, data, deps);
    }
    this._levels.set(name, data);
  }

  /**
   * Load a level by name. Returns a new Level instance or null.
   * @param {string} name
   * @returns {Level|null}
   */
  load(name) {
    // Try in-memory first
    const cached = this._levels.get(name);
    if (cached) return Level.fromJSON(cached);

    // Try AssetStore (sync path for localStorage data)
    if (this._assetStore) {
      const data = this._assetStore.loadSync(ASSET_CATEGORY.LEVELS, name);
      if (data) {
        this._levels.set(name, data);
        return Level.fromJSON(data);
      }
    }

    return null;
  }

  /**
   * Load a level asynchronously (supports bundled assets).
   * @param {string} name
   * @returns {Promise<Level|null>}
   */
  async loadAsync(name) {
    // Try sync first
    const sync = this.load(name);
    if (sync) return sync;

    if (this._assetStore) {
      const data = await this._assetStore.load(ASSET_CATEGORY.LEVELS, name);
      if (data) {
        this._levels.set(name, data);
        return Level.fromJSON(data);
      }
    }

    return null;
  }

  /**
   * Delete a level by name.
   * @param {string} name
   */
  delete(name) {
    this._levels.delete(name);
    if (this._assetStore) {
      this._assetStore.delete(ASSET_CATEGORY.LEVELS, name);
    }
  }
}
