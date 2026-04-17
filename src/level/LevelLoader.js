import { Level } from './Level.js';
import { GameObject } from '../objects/GameObject.js';

/**
 * Loads a level and its required objects from an AssetLoader.
 * Used when starting gameplay — loads everything the level needs.
 */
export class LevelLoader {
  /**
   * @param {import('../assets/AssetLoader.js').AssetLoader} assetLoader
   */
  constructor(assetLoader) {
    this._assetLoader = assetLoader;
  }

  /**
   * Load a level and all its dependencies for gameplay.
   * @param {string} levelId
   * @returns {Promise<import('../assets/AssetLoader.js').LevelBundle|null>}
   */
  async load(levelId) {
    return this._assetLoader.loadLevelBundle(levelId);
  }

  /**
   * Load only the level data (no objects or media).
   * @param {string} levelId
   * @returns {Promise<Level|null>}
   */
  async loadLevel(levelId) {
    return this._assetLoader.loadLevel(levelId);
  }

  /**
   * Load a single object definition.
   * @param {string} objectId
   * @returns {Promise<GameObject|null>}
   */
  async loadObject(objectId) {
    return this._assetLoader.loadObject(objectId);
  }
}
