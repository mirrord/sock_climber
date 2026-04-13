import { TILE } from '../level/Level.js';

/** Tile color palette — index matches TILE constants */
export const TILE_COLORS = {
  [TILE.EMPTY]:  0x1a1a2e,
  [TILE.SOLID]:  0x6b705c,
  [TILE.SPAWN]:  0x48bfe3,
  [TILE.HAZARD]: 0xe63946,
  [TILE.GOAL]:   0xf4a261,
};

/** Grid line color */
export const GRID_COLOR = 0x333355;

/** Tile size in world units */
export const TILE_SIZE = 1;

/** Camera defaults */
export const CAMERA_SPEED = 10;
export const ZOOM_SPEED = 0.5;
export const MIN_ZOOM = 2;
export const MAX_ZOOM = 40;
