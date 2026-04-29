import type { LevelId } from "../ui/LevelSelect.js";
import {
  CLIMB_DIR_HORIZONTAL,
  CLIMB_DIR_VERTICAL,
  type ClimbDir,
} from "./Axis.js";

/**
 * Per-level configuration consumed by the bootstrap in `main.ts`. Captures
 * everything that varies between levels (climb direction, world
 * dimensions, spawn position, death-plane parameters). Adding a new level
 * = adding a new entry here + enabling the level in `LevelSelect.ts`.
 */
export interface LevelConfig {
  id: LevelId;
  climbDir: ClimbDir;
  /** TileWorld width in tiles (X span). */
  worldWidthTiles: number;
  /** TileWorld height in tiles (Y span). */
  worldHeightTiles: number;
  /** Lower bound of addressable tile-Y in the world. */
  worldYMin: number;
  /** Player spawn position in world units. */
  spawn: { x: number; y: number };
  /**
   * Lateral extent of the procedural corridor in tiles. For level 1 this
   * equals `worldWidthTiles` (corridor spans the whole world width). For
   * level 2 the corridor is the full vertical span (= 12 tiles tall) while
   * the world is much wider along the climb axis.
   */
  corridorLateralExtent: number;
  /** Initial death-plane position along the climb axis (world units). */
  deathPlaneStart: number;
  /**
   * How far the player must travel along the climb direction (in metres)
   * before the death plane starts chasing them.
   */
  deathPlaneActivationDistance: number;
}

/** Level 1 — vertical climb, the original "Laundry Pile". */
const LEVEL_1: LevelConfig = {
  id: 1,
  climbDir: CLIMB_DIR_VERTICAL,
  worldWidthTiles: 12,
  worldHeightTiles: 4000,
  // Player spawns at y=0 and climbs toward negative Y; reserve a small
  // buffer below the floor row for underflow.
  worldYMin: -(4000 - 8),
  spawn: { x: 6, y: 0 },
  corridorLateralExtent: 12,
  deathPlaneStart: 3,
  deathPlaneActivationDistance: 20,
};

/** Level 2 — horizontal climb, the "Sock Drawer". */
const LEVEL_2: LevelConfig = {
  id: 2,
  climbDir: CLIMB_DIR_HORIZONTAL,
  // World is a long horizontal corridor.
  worldWidthTiles: 4000,
  worldHeightTiles: 12,
  // Vertical span: floor at y=2 (mirroring level 1's floor row), corridor
  // open above to y = -(12-3) = -9 with a small buffer.
  worldYMin: -9,
  // Spawn at the left of the corridor, on the floor.
  spawn: { x: 6, y: 0 },
  // Lateral = vertical span available to the corridor (player + ceiling).
  corridorLateralExtent: 12,
  // Death wall starts at the left world edge.
  deathPlaneStart: 3,
  deathPlaneActivationDistance: 20,
};

/** All level configurations, keyed by `LevelId`. Levels 3 & 4 are placeholders. */
export const LEVEL_CONFIGS: Record<LevelId, LevelConfig> = {
  1: LEVEL_1,
  2: LEVEL_2,
  // Placeholders so the type stays exhaustive — UI gates them as disabled.
  3: LEVEL_1,
  4: LEVEL_1,
};
