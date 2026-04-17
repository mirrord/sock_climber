import { ASSET_CATEGORY } from './AssetManifest.js';
import { Level } from '../level/Level.js';
import { GameObject } from '../objects/GameObject.js';

/**
 * Loads assets on demand for editors and at level start for gameplay.
 *
 * - Editor catalogues: lightweight lists loaded from the manifest.
 * - Level start: loads the level + all objects it references + their media.
 */
export class AssetLoader {
  /**
   * @param {import('./AssetStore.js').AssetStore} store
   * @param {import('./AssetManifest.js').AssetManifest} manifest
   */
  constructor(store, manifest) {
    this._store = store;
    this._manifest = manifest;
  }

  // ---- Editor catalogues (on-demand) ----

  /**
   * List available objects for the object editor.
   * @returns {Array<{id: string, name: string, source: string}>}
   */
  listObjects() {
    return this._manifest.list(ASSET_CATEGORY.OBJECTS).map(e => ({
      id: e.id,
      name: e.name,
      source: e.source,
    }));
  }

  /**
   * List available levels for the level select / level editor.
   * @returns {Array<{id: string, name: string, source: string}>}
   */
  listLevels() {
    return this._manifest.list(ASSET_CATEGORY.LEVELS).map(e => ({
      id: e.id,
      name: e.name,
      source: e.source,
    }));
  }

  /**
   * Load a single object definition for editing.
   * @param {string} id
   * @returns {Promise<GameObject|null>}
   */
  async loadObject(id) {
    const data = await this._store.load(ASSET_CATEGORY.OBJECTS, id);
    if (!data) return null;
    return GameObject.fromJSON(data);
  }

  /**
   * Load a single level definition for editing.
   * @param {string} id
   * @returns {Promise<Level|null>}
   */
  async loadLevel(id) {
    const data = await this._store.load(ASSET_CATEGORY.LEVELS, id);
    if (!data) return null;
    return Level.fromJSON(data);
  }

  // ---- Level start (load all required assets) ----

  /**
   * Load everything needed to play a level: the level data, all referenced
   * objects, and paths to their sprites/sounds/music.
   *
   * @param {string} levelId
   * @returns {Promise<LevelBundle|null>}
   *
   * @typedef {object} LevelBundle
   * @property {Level} level
   * @property {Map<string, GameObject>} objects — id → GameObject
   * @property {string[]} spritePaths
   * @property {string[]} soundPaths
   * @property {string[]} musicPaths
   */
  async loadLevelBundle(levelId) {
    const levelData = await this._store.load(ASSET_CATEGORY.LEVELS, levelId);
    if (!levelData) return null;

    const level = Level.fromJSON(levelData);
    const deps = this._manifest.resolveLevelAssets(levelId);

    // Load all referenced objects in parallel
    const objectEntries = await Promise.all(
      deps.objects.map(async (objId) => {
        const objData = await this._store.load(ASSET_CATEGORY.OBJECTS, objId);
        if (!objData) return null;
        return [objId, GameObject.fromJSON(objData)];
      })
    );

    const objects = new Map();
    for (const entry of objectEntries) {
      if (entry) objects.set(entry[0], entry[1]);
    }

    // Resolve media paths
    const spritePaths = deps.sprites.map(id => this._resolveMediaPath(ASSET_CATEGORY.SPRITES, id));
    const soundPaths = deps.sounds.map(id => this._resolveMediaPath(ASSET_CATEGORY.SOUNDS, id));
    const musicPaths = deps.music.map(id => this._resolveMediaPath(ASSET_CATEGORY.MUSIC, id));

    return { level, objects, spritePaths, soundPaths, musicPaths };
  }

  /**
   * Resolve the URL path for a media asset.
   * @param {string} category
   * @param {string} id
   * @returns {string}
   */
  _resolveMediaPath(category, id) {
    const entry = this._manifest.get(category, id);
    if (entry?.path) return entry.path;
    // Default convention: /assets/<category>/<id>
    return `/assets/${category}/${id}`;
  }
}
