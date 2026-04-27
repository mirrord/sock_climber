import type { PlayerStats } from "../entities/components/Stats.js";

/**
 * A platform candidate for reachability analysis.
 * Coordinates are in world tiles (integers).
 */
export interface PlatformCandidate {
  /** Leftmost tile X of the platform surface. */
  tx: number;
  /** Tile Y of the platform's top surface (player lands on this row − 1). */
  ty: number;
  /** Width in tiles. */
  width: number;
}

/**
 * Pre-computed jump arc bounds derived from `PlayerStats`.
 * All values are in tiles (1 tile = 1 m).
 */
export interface JumpArcBounds {
  /** Maximum horizontal reach in tiles from jump point to landing point. */
  maxDx: number;
  /** Maximum upward reach in tiles (positive = higher up; negative Y direction). */
  maxDyUp: number;
  /** Maximum downward drop that is still considered a reachable descent (tiles). */
  maxDyDown: number;
}

/**
 * Derive jump arc bounds from player stats.
 *
 * Uses projectile motion: vy = jumpVelocity, vy² = 2g·h  →  h = vy²/(2g).
 * Horizontal range: during time-of-flight, player travels vx * t.
 *
 * A 50 % margin is added to allow for variable-height jumps and air dashes.
 */
export function deriveJumpArcBounds(stats: PlayerStats): JumpArcBounds {
  const g = stats.gravity;
  const vy = Math.abs(stats.jumpVelocity);
  const vx = stats.maxSpeed;

  // Time to apex: t_up = vy / g
  const tUp = vy / g;
  // Maximum upward reach (tiles): h = vy² / (2g)
  const maxDyUp = Math.ceil((vy * vy) / (2 * g) * 1.5);

  // Total time for a full parabolic arc back to same height: t_total = 2 * t_up
  // Generous: also account for maxAirJumps bonus height
  const extraHeight = stats.maxAirJumps * (vy * vy) / (2 * g);
  const extraTime = stats.maxAirJumps * tUp * 2;
  const tTotal = tUp * 2 + extraTime;

  // Horizontal range: vx * t_total (air dash extends further)
  const dashBonus = stats.maxAirDashes > 0 ? stats.dashDistance * 1.5 : 0;
  const maxDx = Math.ceil((vx * tTotal + dashBonus) * 1.5);

  // Maximum downward drop: allow falling from apex, plus a generous drop
  const maxDyDown = Math.ceil(maxDyUp + extraHeight + 4);

  return { maxDx, maxDyUp, maxDyDown };
}

/**
 * Returns `true` if `target` is reachable from `source` given the arc bounds.
 *
 * The player can jump from any tile of `source` to any tile of `target`,
 * so we use the closest horizontal distance between the two platform spans.
 */
export function isReachable(
  source: PlatformCandidate,
  target: PlatformCandidate,
  bounds: JumpArcBounds,
): boolean {
  // Horizontal: closest tile distance between the two spans.
  const srcRight = source.tx + source.width - 1;
  const tgtRight = target.tx + target.width - 1;

  let dx: number;
  if (target.tx > srcRight) {
    dx = target.tx - srcRight;
  } else if (source.tx > tgtRight) {
    dx = source.tx - tgtRight;
  } else {
    // Overlapping spans — horizontal reachability is free.
    dx = 0;
  }

  if (dx > bounds.maxDx) return false;

  // Vertical: dy = source.ty - target.ty (positive means target is above source).
  const dy = source.ty - target.ty;

  if (dy > 0) {
    // Target is above source — needs upward jump.
    return dy <= bounds.maxDyUp;
  } else {
    // Target is below source — pure drop / downward arc.
    return Math.abs(dy) <= bounds.maxDyDown;
  }
}

/**
 * Given a list of already-placed platforms and the jump arc bounds, returns
 * `true` if at least one existing platform can reach `candidate`.
 */
export function hasReachablePredecessor(
  candidate: PlatformCandidate,
  existing: readonly PlatformCandidate[],
  bounds: JumpArcBounds,
): boolean {
  return existing.some((p) => isReachable(p, candidate, bounds));
}
