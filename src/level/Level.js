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
    /** @type {Array<{url: string, parallax: number}>} */
    this.backgroundLayers = [];
    /**
     * Placed object instances. Each entry describes a game object positioned
     * in the level grid.
     * @type {Array<{id: string, type: string, x: number, y: number, properties: object}>}
     */
    this.objects = [];
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

  /**
   * Place an object instance at a grid position.
   * @param {{id?: string, type: string, x: number, y: number, properties?: object}} objectData
   * @returns {string} The id of the placed object.
   */
  placeObject({ id = null, type, x, y, properties = {} }) {
    const resolvedId = id ?? `placed_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    this.objects.push({ id: resolvedId, type, x, y, properties: { ...properties } });
    return resolvedId;
  }

  /**
   * Remove a placed object by its id.
   * @param {string} id
   */
  removeObject(id) {
    const idx = this.objects.findIndex((o) => o.id === id);
    if (idx !== -1) this.objects.splice(idx, 1);
  }

  /**
   * Find the first placed object of a given template type.
   * @param {string} type
   * @returns {{id: string, type: string, x: number, y: number, properties: object}|null}
   */
  findObjectByType(type) {
    return this.objects.find((o) => o.type === type) ?? null;
  }

  /**
   * Return the spawn position derived from the placed player object.
   * Returns null when no player object has been placed.
   * @returns {{x: number, y: number}|null}
   */
  findPlayerSpawn() {
    const player = this.findObjectByType('player');
    return player ? { x: player.x, y: player.y } : null;
  }

  /**
   * Validate level rules.
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate() {
    const errors = [];
    const players = this.objects.filter((o) => o.type === 'player');
    if (players.length === 0) {
      errors.push('Level must contain exactly 1 player object (0 found).');
    } else if (players.length > 1) {
      errors.push(`Level must contain exactly 1 player object (${players.length} found).`);
    }
    return { valid: errors.length === 0, errors };
  }

  /** Serialize to a plain object suitable for JSON.stringify. */
  toJSON() {
    return {
      width: this.width,
      height: this.height,
      tiles: Array.from(this.tiles),
      backgroundLayers: this.backgroundLayers.map(l => ({ ...l })),
      objects: this.objects.map((o) => ({ ...o, properties: { ...o.properties } })),
    };
  }

  /** Deserialize from a plain object. */
  static fromJSON(data) {
    const level = new Level(data.width, data.height);
    level.tiles = new Uint8Array(data.tiles);
    level.backgroundLayers = (data.backgroundLayers || []).map(l => ({ ...l }));
    level.objects = (data.objects || []).map((o) => ({ ...o, properties: { ...(o.properties || {}) } }));
    return level;
  }
}
