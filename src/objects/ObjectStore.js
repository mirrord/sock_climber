import { ASSET_CATEGORY } from '../assets/AssetManifest.js';
import { GameObject } from './GameObject.js';

/**
 * Persistent object library backed by AssetStore.
 * Falls back to in-memory storage when no AssetStore is provided.
 *
 * Mirrors the pattern established by LevelStore.
 */
export class ObjectStore {
  /**
   * @param {import('../assets/AssetStore.js').AssetStore} [assetStore]
   */
  constructor(assetStore = null) {
    this._assetStore = assetStore;
    /** @type {Map<string, object>} — in-memory fallback: id → raw JSON data */
    this._objects = new Map();
  }

  /**
   * List all saved objects as {id, name} descriptors.
   * @returns {Array<{id: string, name: string}>}
   */
  list() {
    if (this._assetStore) {
      return this._assetStore.list(ASSET_CATEGORY.OBJECTS).map(e => ({ id: e.id, name: e.name }));
    }
    return Array.from(this._objects.entries()).map(([id, data]) => ({ id, name: data.name ?? id }));
  }

  /**
   * Persist a GameObject. Overwrites any existing entry with the same id.
   * @param {GameObject} gameObject
   */
  save(gameObject) {
    const data = gameObject.toJSON();
    if (this._assetStore) {
      this._assetStore.save(ASSET_CATEGORY.OBJECTS, gameObject.id, gameObject.name, data);
    }
    this._objects.set(gameObject.id, data);
  }

  /**
   * Load a GameObject by id. Returns null if not found.
   * @param {string} id
   * @returns {GameObject|null}
   */
  load(id) {
    // In-memory cache first
    const cached = this._objects.get(id);
    if (cached) return GameObject.fromJSON(cached);

    // Synchronous localStorage path via AssetStore
    if (this._assetStore) {
      const data = this._assetStore.loadSync(ASSET_CATEGORY.OBJECTS, id);
      if (data) {
        this._objects.set(id, data);
        return GameObject.fromJSON(data);
      }
    }

    return null;
  }

  /**
   * Load all saved GameObjects in one call.
   * @returns {GameObject[]}
   */
  loadAll() {
    return this.list()
      .map(({ id }) => this.load(id))
      .filter(Boolean);
  }

  /**
   * Delete a saved object by id.
   * @param {string} id
   */
  delete(id) {
    this._objects.delete(id);
    if (this._assetStore) {
      this._assetStore.delete(ASSET_CATEGORY.OBJECTS, id);
    }
  }
}
