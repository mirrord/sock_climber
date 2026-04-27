/**
 * Swept AABB collision using the slab method.
 *
 * Tests a moving AABB (the "body") sweeping `(dx, dy)` meters against a
 * static AABB (the "tile") and returns the time-of-impact `t ∈ [0,1]`
 * and the outward contact normal.
 *
 * Returns `null` if there is no hit within `[0,1]`.
 */
export interface SweepHit {
  /** Time of first contact, in [0, 1] relative to the attempted displacement. */
  t: number;
  /** Outward normal of the hit surface: one component is ±1, the other is 0. */
  normalX: number;
  normalY: number;
}

/**
 * Swept AABB vs static AABB (slab / separating-axis method).
 *
 * @param bCx    Body center X
 * @param bCy    Body center Y
 * @param bHalfW Body half-width
 * @param bHalfH Body half-height
 * @param dx     Displacement X
 * @param dy     Displacement Y
 * @param sCx    Static obstacle center X
 * @param sCy    Static obstacle center Y
 * @param sHalfW Static obstacle half-width
 * @param sHalfH Static obstacle half-height
 */
export function sweepAABB(
  bCx: number,
  bCy: number,
  bHalfW: number,
  bHalfH: number,
  dx: number,
  dy: number,
  sCx: number,
  sCy: number,
  sHalfW: number,
  sHalfH: number,
): SweepHit | null {
  // Expand obstacle by body half-extents (Minkowski sum).
  const expandedHalfW = sHalfW + bHalfW;
  const expandedHalfH = sHalfH + bHalfH;

  // Relative position: body center relative to expanded obstacle center.
  const relX = bCx - sCx;
  const relY = bCy - sCy;

  // Compute entry/exit times per axis.
  // The body starts at relX and moves by (dx, dy).
  // Overlaps when |relX + dx*t| < expandedHalfW (and similarly Y).

  let tEntryX: number;
  let tExitX: number;
  let tEntryY: number;
  let tExitY: number;

  if (dx === 0) {
    if (Math.abs(relX) >= expandedHalfW) return null; // never overlaps X
    tEntryX = -Infinity;
    tExitX = Infinity;
  } else {
    const invDx = 1 / dx;
    const t1 = (-expandedHalfW - relX) * invDx;
    const t2 = (expandedHalfW - relX) * invDx;
    tEntryX = Math.min(t1, t2);
    tExitX = Math.max(t1, t2);
  }

  if (dy === 0) {
    if (Math.abs(relY) >= expandedHalfH) return null; // never overlaps Y
    tEntryY = -Infinity;
    tExitY = Infinity;
  } else {
    const invDy = 1 / dy;
    const t1 = (-expandedHalfH - relY) * invDy;
    const t2 = (expandedHalfH - relY) * invDy;
    tEntryY = Math.min(t1, t2);
    tExitY = Math.max(t1, t2);
  }

  const tEntry = Math.max(tEntryX, tEntryY);
  const tExit = Math.min(tExitX, tExitY);

  // No collision if exiting before entering or entry after end of sweep.
  if (tEntry > tExit || tEntry >= 1 || tExit <= 0) return null;

  const t = Math.max(0, tEntry);

  // Determine hit normal from the axis that entered last.
  let normalX = 0;
  let normalY = 0;

  if (tEntryX > tEntryY) {
    // X axis hit last — normal is X.
    normalX = dx > 0 ? -1 : 1;
  } else {
    // Y axis hit last — normal is Y.
    normalY = dy > 0 ? -1 : 1;
  }

  return { t, normalX, normalY };
}
