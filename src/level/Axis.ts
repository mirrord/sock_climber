/**
 * Direction abstraction shared by every system that varies between
 * level 1 (vertical climb, progress = -Y) and level 2 (horizontal climb,
 * progress = +X). All systems read `ClimbDir.axis` to know which world
 * coordinate represents climb progress, and `ClimbDir.sign` to know which
 * direction along that axis is "forward" (the direction the player climbs
 * and the direction the death plane chases).
 */

export type ClimbAxis = "x" | "y" | "path" | "none";

/** Axis + sign describing the direction the player climbs. */
export interface ClimbDir {
  /** World axis representing climb progress. */
  axis: ClimbAxis;
  /**
   * Direction along `axis` that constitutes forward progress.
   * `-1` for level 1 (climbing UP = -Y); `+1` for level 2 (climbing right = +X);
   * always `+1` for the path axis (level 3 — `s` is always increasing);
   * always `+1` for the `"none"` axis (level 4 — no climb progress at all).
   */
  sign: -1 | 1;
}

/** Level 1: climb upward along world -Y. */
export const CLIMB_DIR_VERTICAL: ClimbDir = { axis: "y", sign: -1 };

/** Level 2: climb rightward along world +X. */
export const CLIMB_DIR_HORIZONTAL: ClimbDir = { axis: "x", sign: 1 };

/**
 * Level 3: climb along a piecewise-linear path through 2-D world space.
 * Progress is measured in path-space arc length `s` rather than along a
 * fixed world axis. Callsites that need to convert a world position to
 * `s` must do so via the live `Path` (see `src/level/Path.ts`); the
 * helpers here treat the value as opaque and pass it through.
 */
export const CLIMB_DIR_PATH: ClimbDir = { axis: "path", sign: 1 };

/**
 * Level 4: arena/boss-fight mode. The player does not climb — there is no
 * progress axis at all. Systems that would normally chase the player
 * along an axis (death plane, score distance, climb-based gauge fill)
 * should be disabled or guarded out when this direction is active.
 */
export const CLIMB_DIR_NONE: ClimbDir = { axis: "none", sign: 1 };

/**
 * The world axis perpendicular to the climb axis. For path-mode levels
 * (level 3) there is no single perpendicular axis — the lateral
 * direction varies along the path. Callers in path mode should not rely
 * on this helper; we return `"x"` as a defensive default. The same
 * fallback is used for `"none"` (no axis at all).
 */
export function lateralAxis(dir: ClimbDir): ClimbAxis {
  if (dir.axis === "path" || dir.axis === "none") return "x";
  return dir.axis === "y" ? "x" : "y";
}

/**
 * Signed climb progress: how far ahead of the spawn (along the climb
 * direction) the given world coordinate is. Always non-negative when the
 * player has moved forward.
 *
 *  - Level 1: progress = -y (player at y=-50 has progressed 50 m).
 *  - Level 2: progress = +x (player at x=50 has progressed 50 m).
 *  - Level 3 (path axis): the world position is opaque to this helper;
 *    callers must precompute path-`s` and pass it as `pathProgress`.
 *    Returns `0` if `pathProgress` is omitted in path mode.
 */
export function climbProgress(
  pos: { x: number; y: number },
  dir: ClimbDir,
  pathProgress?: number,
): number {
  if (dir.axis === "path") return pathProgress ?? 0;
  if (dir.axis === "none") return 0;
  return dir.sign * pos[dir.axis];
}
