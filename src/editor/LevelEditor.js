import { Level, TILE } from '../level/Level.js';

export class LevelEditor {
  /**
   * @param {number} width  — grid columns
   * @param {number} height — grid rows
   */
  constructor(width, height) {
    this.level = new Level(width, height);
    this.selectedTile = TILE.SOLID;
    this.mode = 'edit'; // 'edit' | 'play'
    /** @type {Array<{x: number, y: number, prev: number, cur: number}>} */
    this._undoStack = [];
  }

  /** Select the tile type to paint with. */
  selectTile(type) {
    this.selectedTile = type;
  }

  /** Paint the selected tile at (x, y). Records undo. */
  paint(x, y) {
    const prev = this.level.getTile(x, y);
    if (!this.level.inBounds(x, y)) return;

    // Enforce single spawn: clear previous spawn if placing a new one
    if (this.selectedTile === TILE.SPAWN) {
      this._clearAllOfType(TILE.SPAWN);
    }

    this.level.setTile(x, y, this.selectedTile);
    this._undoStack.push({ x, y, prev, cur: this.selectedTile });
  }

  /** Erase tile at (x, y) back to EMPTY. Records undo. */
  erase(x, y) {
    const prev = this.level.getTile(x, y);
    if (!this.level.inBounds(x, y)) return;
    this.level.setTile(x, y, TILE.EMPTY);
    this._undoStack.push({ x, y, prev, cur: TILE.EMPTY });
  }

  /** Undo the last paint/erase operation. */
  undo() {
    const entry = this._undoStack.pop();
    if (!entry) return;
    this.level.setTile(entry.x, entry.y, entry.prev);
  }

  /** Toggle between edit and play modes. */
  toggleMode() {
    this.mode = this.mode === 'edit' ? 'play' : 'edit';
  }

  /** Clear all tiles. */
  clearLevel() {
    this.level.clear();
    this._undoStack.length = 0;
  }

  /** Export level as JSON string. */
  exportJSON() {
    return JSON.stringify(this.level.toJSON());
  }

  /** Import level from JSON string. */
  importJSON(jsonStr) {
    const data = JSON.parse(jsonStr);
    this.level = Level.fromJSON(data);
    this._undoStack.length = 0;
  }

  /** Remove all tiles of a given type. */
  _clearAllOfType(type) {
    for (let y = 0; y < this.level.height; y++) {
      for (let x = 0; x < this.level.width; x++) {
        if (this.level.getTile(x, y) === type) {
          this.level.setTile(x, y, TILE.EMPTY);
        }
      }
    }
  }
}
