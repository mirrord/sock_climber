/** Tile type constants — use integers for fast typed-array storage */
export const TILE = {
  EMPTY:  0,
  SOLID:  1,
  SPAWN:  2,
  HAZARD: 3,
  GOAL:   4,
};

/** Names keyed by value for UI display */
export const TILE_NAMES = {
  [TILE.EMPTY]:  'Empty',
  [TILE.SOLID]:  'Solid',
  [TILE.SPAWN]:  'Spawn',
  [TILE.HAZARD]: 'Hazard',
  [TILE.GOAL]:   'Goal',
};

export class Level {
  /**
   * @param {number} width  — grid columns
   * @param {number} height — grid rows
   */
  constructor(width, height) {
    this.width = width;
    this.height = height;
    /** Flat Uint8Array: row-major [y * width + x] */
    this.tiles = new Uint8Array(width * height);
  }

  /** @returns {boolean} */
  inBounds(x, y) {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  /** Get tile at (x, y). Out-of-bounds returns SOLID (implicit walls). */
  getTile(x, y) {
    if (!this.inBounds(x, y)) return TILE.SOLID;
    return this.tiles[y * this.width + x];
  }

  /** Set tile at (x, y). Out-of-bounds is silently ignored. */
  setTile(x, y, type) {
    if (!this.inBounds(x, y)) return;
    this.tiles[y * this.width + x] = type;
  }

  /** Reset all tiles to EMPTY. */
  clear() {
    this.tiles.fill(TILE.EMPTY);
  }

  /** Resize grid, preserving tiles that fit in the new dimensions. */
  resize(newWidth, newHeight) {
    const newTiles = new Uint8Array(newWidth * newHeight);
    const copyW = Math.min(this.width, newWidth);
    const copyH = Math.min(this.height, newHeight);
    for (let y = 0; y < copyH; y++) {
      for (let x = 0; x < copyW; x++) {
        newTiles[y * newWidth + x] = this.tiles[y * this.width + x];
      }
    }
    this.width = newWidth;
    this.height = newHeight;
    this.tiles = newTiles;
  }

  /** Find first SPAWN tile. Returns {x, y} or {0, 0} if none. */
  findSpawn() {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.getTile(x, y) === TILE.SPAWN) return { x, y };
      }
    }
    return { x: 0, y: 0 };
  }

  /** Serialize to a plain object suitable for JSON.stringify. */
  toJSON() {
    return {
      width: this.width,
      height: this.height,
      tiles: Array.from(this.tiles),
    };
  }

  /** Deserialize from a plain object. */
  static fromJSON(data) {
    const level = new Level(data.width, data.height);
    level.tiles = new Uint8Array(data.tiles);
    return level;
  }
}
