/**
 * Asset categories and their storage key prefixes.
 * @readonly
 */
export const ASSET_CATEGORY = {
  OBJECTS: 'objects',
  LEVELS: 'levels',
  SPRITES: 'sprites',
  SOUNDS: 'sounds',
  MUSIC: 'music',
};

/**
 * Where an asset originates from.
 * - bundled: shipped with the game in public/assets/
 * - local: user-created, persisted in localStorage
 */
export const ASSET_SOURCE = {
  BUNDLED: 'bundled',
  LOCAL: 'local',
};

/**
 * A single entry in the asset manifest.
 * @typedef {object} ManifestEntry
 * @property {string} id        — unique identifier within its category
 * @property {string} name      — display name
 * @property {string} source    — 'bundled' | 'local'
 * @property {string} [path]    — URL path for bundled assets
 * @property {string[]} [sprites]  — sprite IDs this asset depends on
 * @property {string[]} [sounds]   — sound IDs this asset depends on
 * @property {string[]} [music]    — music IDs this asset depends on
 * @property {string[]} [objects]  — object IDs this asset depends on (levels only)
 */

/**
 * Manages the combined manifest of bundled + user-created assets.
 * Bundled entries are loaded from public/assets/manifest.json.
 * Local entries are persisted in localStorage.
 */
export class AssetManifest {
  /**
   * @param {string} localStorageKey — localStorage key for the local manifest
   */
  constructor(localStorageKey = 'sock_climber_manifest') {
    this._storageKey = localStorageKey;
    /** @type {Record<string, Record<string, ManifestEntry>>} category → id → entry */
    this._entries = {
      [ASSET_CATEGORY.OBJECTS]: {},
      [ASSET_CATEGORY.LEVELS]: {},
      [ASSET_CATEGORY.SPRITES]: {},
      [ASSET_CATEGORY.SOUNDS]: {},
      [ASSET_CATEGORY.MUSIC]: {},
    };
    this._loaded = false;
  }

  /** Whether the manifest has been initialized. */
  get loaded() {
    return this._loaded;
  }

  /**
   * Initialize by loading the bundled manifest and merging with localStorage.
   * @param {string} bundledManifestUrl — URL of the bundled manifest JSON
   */
  async init(bundledManifestUrl = '/assets/manifest.json') {
    // Load bundled manifest
    const bundled = await this._fetchBundledManifest(bundledManifestUrl);
    this._mergeBundled(bundled);

    // Load local manifest from localStorage
    this._loadLocal();

    this._loaded = true;
  }

  /**
   * List all entries in a category.
   * @param {string} category — one of ASSET_CATEGORY values
   * @returns {ManifestEntry[]}
   */
  list(category) {
    const cat = this._entries[category];
    return cat ? Object.values(cat) : [];
  }

  /**
   * Get a single entry by category and id.
   * @param {string} category
   * @param {string} id
   * @returns {ManifestEntry|null}
   */
  get(category, id) {
    const cat = this._entries[category];
    return cat ? (cat[id] || null) : null;
  }

  /**
   * Add or update a local entry. Persists to localStorage.
   * @param {string} category
   * @param {ManifestEntry} entry
   */
  set(category, entry) {
    if (!this._entries[category]) return;
    entry.source = ASSET_SOURCE.LOCAL;
    this._entries[category][entry.id] = entry;
    this._saveLocal();
  }

  /**
   * Remove a local entry. Bundled entries cannot be removed.
   * @param {string} category
   * @param {string} id
   * @returns {boolean} true if removed
   */
  remove(category, id) {
    const cat = this._entries[category];
    if (!cat || !cat[id]) return false;
    if (cat[id].source === ASSET_SOURCE.BUNDLED) return false;
    delete cat[id];
    this._saveLocal();
    return true;
  }

  /**
   * Get all object IDs that a level depends on.
   * @param {string} levelId
   * @returns {string[]}
   */
  getLevelDependencies(levelId) {
    const entry = this.get(ASSET_CATEGORY.LEVELS, levelId);
    if (!entry) return [];
    return entry.objects || [];
  }

  /**
   * Collect all asset dependencies for a level (objects + their sprites/sounds).
   * @param {string} levelId
   * @returns {{ objects: string[], sprites: string[], sounds: string[], music: string[] }}
   */
  resolveLevelAssets(levelId) {
    const result = { objects: [], sprites: [], sounds: [], music: [] };
    const levelEntry = this.get(ASSET_CATEGORY.LEVELS, levelId);
    if (!levelEntry) return result;

    // Level's own media
    if (levelEntry.sprites) result.sprites.push(...levelEntry.sprites);
    if (levelEntry.sounds) result.sounds.push(...levelEntry.sounds);
    if (levelEntry.music) result.music.push(...levelEntry.music);

    // Objects used by the level
    const objectIds = levelEntry.objects || [];
    result.objects = [...objectIds];

    for (const objId of objectIds) {
      const objEntry = this.get(ASSET_CATEGORY.OBJECTS, objId);
      if (!objEntry) continue;
      if (objEntry.sprites) result.sprites.push(...objEntry.sprites);
      if (objEntry.sounds) result.sounds.push(...objEntry.sounds);
    }

    // Deduplicate
    result.sprites = [...new Set(result.sprites)];
    result.sounds = [...new Set(result.sounds)];
    result.music = [...new Set(result.music)];
    result.objects = [...new Set(result.objects)];

    return result;
  }

  // ---- Private ----

  async _fetchBundledManifest(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) return {};
      return await res.json();
    } catch (_) {
      return {};
    }
  }

  _mergeBundled(data) {
    for (const category of Object.values(ASSET_CATEGORY)) {
      const entries = data[category];
      if (!entries || typeof entries !== 'object') continue;
      for (const [id, entry] of Object.entries(entries)) {
        this._entries[category][id] = { ...entry, id, source: ASSET_SOURCE.BUNDLED };
      }
    }
  }

  _loadLocal() {
    try {
      const raw = localStorage.getItem(this._storageKey);
      if (!raw) return;
      const data = JSON.parse(raw);
      for (const category of Object.values(ASSET_CATEGORY)) {
        const entries = data[category];
        if (!entries || typeof entries !== 'object') continue;
        for (const [id, entry] of Object.entries(entries)) {
          // Local entries never overwrite bundled ones
          if (this._entries[category][id]?.source === ASSET_SOURCE.BUNDLED) continue;
          this._entries[category][id] = { ...entry, id, source: ASSET_SOURCE.LOCAL };
        }
      }
    } catch (_) {
      // Corrupted localStorage — start fresh
    }
  }

  _saveLocal() {
    const data = {};
    for (const category of Object.values(ASSET_CATEGORY)) {
      data[category] = {};
      for (const [id, entry] of Object.entries(this._entries[category])) {
        if (entry.source === ASSET_SOURCE.LOCAL) {
          data[category][id] = entry;
        }
      }
    }
    localStorage.setItem(this._storageKey, JSON.stringify(data));
  }
}
