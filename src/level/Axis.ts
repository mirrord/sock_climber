/**
 * Direction abstraction shared by every system that varies between
 * level 1 (vertical climb, progress = -Y) and level 2 (horizontal climb,
 * progress = +X). All systems read `ClimbDir.axis` to know which world
 * coordinate represents climb progress, and `ClimbDir.sign` to know which
 * direction along that axis is "forward" (the direction the player climbs
 * and the direction the death plane chases).
 */

export type ClimbAxis = "x" | "y";

/** Axis + sign describing the direction the player climbs. */
export interface ClimbDir {
  /** World axis representing climb progress. */
  axis: ClimbAxis;
  /**
   * Direction along `axis` that constitutes forward progress.
   * `-1` for level 1 (climbing UP = -Y); `+1` for level 2 (climbing right = +X).
   */
  sign: -1 | 1;
}

/** Level 1: climb upward along world -Y. */
export const CLIMB_DIR_VERTICAL: ClimbDir = { axis: "y", sign: -1 };

/** Level 2: climb rightward along world +X. */
export const CLIMB_DIR_HORIZONTAL: ClimbDir = { axis: "x", sign: 1 };

/** The world axis perpendicular to the climb axis. */
export function lateralAxis(dir: ClimbDir): ClimbAxis {
  return dir.axis === "y" ? "x" : "y";
}

/**
 * Signed climb progress: how far ahead of the spawn (along the climb
 * direction) the given world coordinate is. Always non-negative when the
 * player has moved forward.
 *
 *  - Level 1: progress = -y (player at y=-50 has progressed 50 m).
 *  - Level 2: progress = +x (player at x=50 has progressed 50 m).
 */
export function climbProgress(pos: { x: number; y: number }, dir: ClimbDir): number {
  return dir.sign * pos[dir.axis];
}
