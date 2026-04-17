import { ASSET_CATEGORY, ASSET_SOURCE } from './AssetManifest.js';

/**
 * Persistent asset data store.
 * Bundled assets are fetched from public/assets/.
 * User-created assets are persisted in localStorage.
 */
export class AssetStore {
  /**
   * @param {import('./AssetManifest.js').AssetManifest} manifest
   * @param {string} storagePrefix — localStorage key prefix for asset data
   */
  constructor(manifest, storagePrefix = 'sock_climber_data') {
    this._manifest = manifest;
    this._prefix = storagePrefix;
    /** @type {Map<string, object>} — in-memory cache: "category:id" → data */
    this._cache = new Map();
  }

  /**
   * Save asset data (user-created). Persists to localStorage and updates manifest.
   * @param {string} category — ASSET_CATEGORY value
   * @param {string} id
   * @param {string} name — display name
   * @param {object} data — JSON-serializable asset data
   * @param {object} [deps] — optional dependency lists
   * @param {string[]} [deps.objects]
   * @param {string[]} [deps.sprites]
   * @param {string[]} [deps.sounds]
   * @param {string[]} [deps.music]
   */
  save(category, id, name, data, deps = {}) {
    const key = this._key(category, id);
    this._cache.set(key, data);
    localStorage.setItem(`${this._prefix}:${key}`, JSON.stringify(data));

    this._manifest.set(category, {
      id,
      name,
      source: ASSET_SOURCE.LOCAL,
      objects: deps.objects || [],
      sprites: deps.sprites || [],
      sounds: deps.sounds || [],
      music: deps.music || [],
    });
  }

  /**
   * Load asset data by category and id.
   * Returns from cache, then localStorage, then fetches from bundled path.
   * @param {string} category
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async load(category, id) {
    const key = this._key(category, id);

    // 1. In-memory cache
    if (this._cache.has(key)) {
      return this._cache.get(key);
    }

    // 2. localStorage (local assets)
    const stored = localStorage.getItem(`${this._prefix}:${key}`);
    if (stored) {
      try {
        const data = JSON.parse(stored);
        this._cache.set(key, data);
        return data;
      } catch (_) {
        // Fall through
      }
    }

    // 3. Bundled asset (fetch from public/assets/)
    const entry = this._manifest.get(category, id);
    if (entry?.source === ASSET_SOURCE.BUNDLED && entry.path) {
      try {
        const res = await fetch(entry.path);
        if (res.ok) {
          const data = await res.json();
          this._cache.set(key, data);
          return data;
        }
      } catch (_) {
        // Fall through
      }
    }

    return null;
  }

  /**
   * Load asset data synchronously from cache/localStorage only.
   * Returns null if the asset must be fetched from network.
   * @param {string} category
   * @param {string} id
   * @returns {object|null}
   */
  loadSync(category, id) {
    const key = this._key(category, id);

    if (this._cache.has(key)) {
      return this._cache.get(key);
    }

    const stored = localStorage.getItem(`${this._prefix}:${key}`);
    if (stored) {
      try {
        const data = JSON.parse(stored);
        this._cache.set(key, data);
        return data;
      } catch (_) {
        return null;
      }
    }

    return null;
  }

  /**
   * Delete a user-created asset. Bundled assets cannot be deleted.
   * @param {string} category
   * @param {string} id
   * @returns {boolean}
   */
  delete(category, id) {
    const entry = this._manifest.get(category, id);
    if (!entry || entry.source === ASSET_SOURCE.BUNDLED) return false;

    const key = this._key(category, id);
    this._cache.delete(key);
    localStorage.removeItem(`${this._prefix}:${key}`);
    this._manifest.remove(category, id);
    return true;
  }

  /**
   * List all entries in a category (delegates to manifest).
   * @param {string} category
   * @returns {import('./AssetManifest.js').ManifestEntry[]}
   */
  list(category) {
    return this._manifest.list(category);
  }

  /** Clear the in-memory cache. */
  clearCache() {
    this._cache.clear();
  }

  /** @returns {string} */
  _key(category, id) {
    return `${category}:${id}`;
  }
}
