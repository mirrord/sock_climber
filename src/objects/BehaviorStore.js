import { ASSET_CATEGORY } from '../assets/AssetManifest.js';
import { Behavior } from './Behavior.js';

const BEHAVIOR_CATEGORY = ASSET_CATEGORY.BEHAVIORS;

/**
 * Persistent custom-behavior library backed by an optional AssetStore.
 * Falls back to in-memory storage when no AssetStore is provided.
 *
 * Note: This store only holds user-created custom behaviors.
 * Standard built-in behaviors (STANDARD_BEHAVIORS) are not persisted here.
 *
 * Mirrors the pattern established by ObjectStore.
 */
export class BehaviorStore {
  /**
   * @param {import('../assets/AssetStore.js').AssetStore} [assetStore]
   */
  constructor(assetStore = null) {
    this._assetStore = assetStore;
    /** @type {Map<string, object>} — in-memory fallback: id → raw JSON data */
    this._behaviors = new Map();
  }

  /**
   * List all saved behaviors as {id, name} descriptors.
   * @returns {Array<{id: string, name: string}>}
   */
  list() {
    if (this._assetStore) {
      return this._assetStore
        .list(BEHAVIOR_CATEGORY)
        .map((e) => ({ id: e.id, name: e.name }));
    }
    return Array.from(this._behaviors.entries()).map(([id, data]) => ({
      id,
      name: data.name ?? id,
    }));
  }

  /**
   * Persist a Behavior. Overwrites any existing entry with the same id.
   * @param {Behavior} behavior
   */
  save(behavior) {
    const data = behavior.toJSON();
    if (this._assetStore) {
      this._assetStore.save(BEHAVIOR_CATEGORY, behavior.id, behavior.name, data);
    }
    this._behaviors.set(behavior.id, data);
  }

  /**
   * Load a Behavior by id. Returns null if not found.
   * @param {string} id
   * @returns {Behavior|null}
   */
  load(id) {
    const cached = this._behaviors.get(id);
    if (cached) return Behavior.fromJSON(cached);

    if (this._assetStore) {
      const data = this._assetStore.loadSync(BEHAVIOR_CATEGORY, id);
      if (data) {
        this._behaviors.set(id, data);
        return Behavior.fromJSON(data);
      }
    }

    return null;
  }

  /**
   * Load all saved Behaviors in one call.
   * @returns {Behavior[]}
   */
  loadAll() {
    return this.list()
      .map(({ id }) => this.load(id))
      .filter(Boolean);
  }

  /**
   * Delete a saved behavior by id.
   * @param {string} id
   */
  delete(id) {
    this._behaviors.delete(id);
    if (this._assetStore) {
      this._assetStore.delete?.(BEHAVIOR_CATEGORY, id);
    }
  }
}
