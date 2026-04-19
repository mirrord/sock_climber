import { Level } from '../level/Level.js';

export class LevelEditor {
  /**
   * @param {number} width  — grid columns
   * @param {number} height — grid rows
   */
  constructor(width, height) {
    this.level = new Level(width, height);
    this.mode = 'edit'; // 'edit' | 'play'
  }

  /** Resize the level, preserving existing tiles that fit. */
  resize(newWidth, newHeight) {
    this.level.resize(newWidth, newHeight);
  }

  // ---- Background layers ----

  /**
   * Add a background image layer.
   * @param {string} url
   * @param {number} parallax — 0 (fixed) to 1 (moves with camera)
   */
  addBackgroundLayer(url, parallax) {
    this.level.backgroundLayers.push({ url, parallax: Math.max(0, Math.min(1, parallax)) });
  }

  /** Remove a background layer by index. */
  removeBackgroundLayer(index) {
    this.level.backgroundLayers.splice(index, 1);
  }

  /**
   * Update an existing background layer.
   * @param {number} index
   * @param {string} url
   * @param {number} parallax
   */
  updateBackgroundLayer(index, url, parallax) {
    const layer = this.level.backgroundLayers[index];
    if (!layer) return;
    layer.url = url;
    layer.parallax = Math.max(0, Math.min(1, parallax));
  }

  // ---- Mode ----

  /** Toggle between edit and play modes. */
  toggleMode() {
    this.mode = this.mode === 'edit' ? 'play' : 'edit';
  }

  // ---- Level data ----

  /** Clear all tiles. */
  clearLevel() {
    this.level.clear();
  }

  // ---- Object placement ----

  /**
   * Unique object types — only one instance of each is allowed per level.
   * Placing a second removes the first automatically.
   */
  static get UNIQUE_TYPES() {
    return ['player'];
  }

  /**
   * Place an object instance at a grid position.
   * For types in UNIQUE_TYPES, any existing object of that type is removed first.
   * @param {string} type        — template type (e.g. 'player', 'enemy')
   * @param {number} gridX       — tile column
   * @param {number} gridY       — tile row
   * @param {object} [properties] — optional instance property overrides
   * @returns {string} The id of the placed object.
   */
  placeObject(type, gridX, gridY, properties = {}) {
    if (LevelEditor.UNIQUE_TYPES.includes(type)) {
      const existing = this.level.findObjectByType(type);
      if (existing) this.level.removeObject(existing.id);
    }
    return this.level.placeObject({ type, x: gridX, y: gridY, properties });
  }

  /**
   * Remove a placed object by its id.
   * @param {string} id
   */
  removeObject(id) {
    this.level.removeObject(id);
  }

  /**
   * Return a shallow copy of the current placed objects array.
   * @returns {Array}
   */
  getObjects() {
    return [...this.level.objects];
  }

  /**
   * Return the topmost placed object at exact grid coordinates, or null.
   * @param {number} gridX
   * @param {number} gridY
   * @returns {{id: string, type: string, x: number, y: number, properties: object}|null}
   */
  getObjectAt(gridX, gridY) {
    // Search from end so the most recently placed object at a position wins
    for (let i = this.level.objects.length - 1; i >= 0; i--) {
      const o = this.level.objects[i];
      if (o.x === gridX && o.y === gridY) return o;
    }
    return null;
  }

  /**
   * Validate level rules (e.g. exactly 1 player object).
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validateLevel() {
    return this.level.validate();
  }

  /** Export level as JSON string. */
  exportJSON() {
    return JSON.stringify(this.level.toJSON());
  }

  /** Import level from JSON string. */
  importJSON(jsonStr) {
    const data = JSON.parse(jsonStr);
    this.level = Level.fromJSON(data);
  }
}
