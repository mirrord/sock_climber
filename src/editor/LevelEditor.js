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
