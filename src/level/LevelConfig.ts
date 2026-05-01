import type { LevelId } from "../ui/LevelSelect.js";
import {
  CLIMB_DIR_HORIZONTAL,
  CLIMB_DIR_NONE,
  CLIMB_DIR_PATH,
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
  worldWidthTiles: 22,
  worldHeightTiles: 4000,
  // Player spawns at y=0 and climbs toward negative Y; reserve a small
  // buffer below the floor row for underflow.
  worldYMin: -(4000 - 8),
  // Spawn 3 tiles above the floor; `seedWorldBoundary` places a small
  // platform under this position so the player isn't standing directly
  // on the rumbling laundry pile at the start of the run.
  spawn: { x: 11, y: -3 },
  corridorLateralExtent: 22,
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

/**
 * Level 3 — "The Snaking Corridor". Climbs along a procedurally
 * generated piecewise-linear path through 2-D world space (see
 * `docs/LEVEL_3_PLAN.md`). The TileWorld is large enough to contain
 * any plausible snake path; the corridor itself is narrow.
 */
const LEVEL_3: LevelConfig = {
  id: 3,
  climbDir: CLIMB_DIR_PATH,
  // Path stays within ±1000 tiles of origin in practice; 2000-square
  // envelope leaves headroom and keeps the Uint8Array under 4 MB.
  worldWidthTiles: 2000,
  worldHeightTiles: 2000,
  worldYMin: -1000,
  // Spawn is centred in the addressable tile range so the corridor's
  // lateral walls (at spawn.x ± (CORRIDOR_HALF_WIDTH + 1) ≈ ±10 tiles)
  // stay in bounds — `TileWorld._inBounds` rejects any tx < 0 and would
  // silently drop the entire left wall + left half of the seeded floor
  // cap if spawn.x were near 0.
  //
  // spawn.y is lifted above the seeded back-cap floor (top face at y=1)
  // so `seedWorldBoundary` can place a small starter platform under the
  // player; matches the level-1 layout for visual consistency.
  spawn: { x: 1000, y: -4 },
  // Corridor interior spans CORRIDOR_HALF_WIDTH * 2 + 1 = 19 tiles, with
  // a single-tile wall band on each side, so wall-edge to wall-edge is
  // 21 m. The death-plane graphic must span the full wall-to-wall width
  // or a visible sliver of the corridor stays uncovered.
  corridorLateralExtent: 21,
  // Death plane begins 3 m behind the spawn in path-`s` units.
  deathPlaneStart: -3,
  deathPlaneActivationDistance: 20,
};

/**
 * Level 4 — "Boss Battle Arena". A closed circular room ~40 m in diameter
 * with a stair-stepped tile circle as the playable area. The player does
 * not climb; the death plane is disabled. The win condition is defeating
 * the boss (see `BossLaundry`).
 */
const LEVEL_4_ARENA: LevelConfig = {
  id: 4,
  climbDir: CLIMB_DIR_NONE,
  // 48-tile-square world: 40-tile-diameter playable circle plus a 4-tile
  // border on every side so the wall geometry never touches the world
  // bounds (and a small buffer for the 1-tile world-edge guard).
  worldWidthTiles: 48,
  worldHeightTiles: 48,
  worldYMin: -32,
  // Spawn at the bottom centre of the arena, just above the curved floor.
  // Note: y = 11 (not 12) — the floor's central dimple at row 12 is only
  // one tile wide, so a 1 m wide player AABB centred at (24, 12) clips into
  // the solid tiles at (23, 12) / (25, 12). Spawning one tile higher lets
  // gravity settle the player cleanly on top of the ring.
  spawn: { x: 24, y: 11 },
  corridorLateralExtent: 40,
  // Death plane is disabled for axis="none" (guarded in main.ts), so
  // these values are placeholders.
  deathPlaneStart: 0,
  deathPlaneActivationDistance: 0,
};

/** All level configurations, keyed by `LevelId`. */
export const LEVEL_CONFIGS: Record<LevelId, LevelConfig> = {
  1: LEVEL_1,
  2: LEVEL_2,
  3: LEVEL_3,
  4: LEVEL_4_ARENA,
};
