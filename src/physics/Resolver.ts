import type { Body } from "./Body.js";
import { integrateBody } from "./Body.js";
import type { TileWorld } from "./TileWorld.js";
import { querySolidTiles } from "./SpatialHash.js";
import { sweepAABB } from "./Sweep.js";

/** Maximum iterations per step to resolve contacts. */
const MAX_ITERATIONS = 4;

/** Skin width to avoid exact-touching sinking. */
const SKIN = 1e-4;

/**
 * Contact set returned after a full physics step.
 * Flags are also written back to `body.flags`.
 */
export interface ContactSet {
  onGround: boolean;
  onCeiling: boolean;
  onWallL: boolean;
  onWallR: boolean;
}

// Reusable broadphase output array — avoids per-step allocation.
const _tiles: Array<{ tx: number; ty: number }> = [];

/**
 * Runs one fixed physics step for a body against a tile world.
 *
 * Pipeline:
 *  1. Integrate (gravity + drag).
 *  2. Compute proposed displacement = velocity * dt.
 *  3. Sweep against all overlapping solid tiles; resolve at first hit.
 *  4. Slide remaining motion along the contact tangent.
 *  5. Repeat up to MAX_ITERATIONS.
 *  6. Write contact flags back to body.
 *
 * @param body  - The body to step (mutated in place).
 * @param world - The tile world to collide against.
 * @param dt    - Step size in seconds (should equal 1/120).
 * @returns     - The contacts resolved this step.
 */
export function step(body: Body, world: TileWorld, dt: number): ContactSet {
  integrateBody(body, dt);

  let dx = body.velocity.x * dt;
  let dy = body.velocity.y * dt;

  const contacts: ContactSet = {
    onGround: false,
    onCeiling: false,
    onWallL: false,
    onWallR: false,
  };

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) break;

    // Broadphase: find solid tiles the swept AABB could touch.
    const sweepCx = body.position.x + dx * 0.5;
    const sweepCy = body.position.y + dy * 0.5;
    const sweepHalfW = body.halfExtents.x + Math.abs(dx) * 0.5;
    const sweepHalfH = body.halfExtents.y + Math.abs(dy) * 0.5;
    querySolidTiles(world, sweepCx, sweepCy, sweepHalfW, sweepHalfH, _tiles);

    // Find the earliest hit.
    let bestT = 1;
    let bestNX = 0;
    let bestNY = 0;

    for (const { tx, ty } of _tiles) {
      // Tile AABB: center = (tx + 0.5, ty + 0.5), halfExtents = (0.5, 0.5).
      const hit = sweepAABB(
        body.position.x,
        body.position.y,
        body.halfExtents.x,
        body.halfExtents.y,
        dx,
        dy,
        tx + 0.5,
        ty + 0.5,
        0.5,
        0.5,
      );

      if (hit !== null && hit.t < bestT) {
        bestT = hit.t;
        bestNX = hit.normalX;
        bestNY = hit.normalY;
      }
    }

    if (bestT < 1) {
      // Move body to the contact point (exact), then back off by SKIN along normal.
      body.position.x += dx * bestT + bestNX * SKIN;
      body.position.y += dy * bestT + bestNY * SKIN;

      // Record contact normal.
      if (bestNY < 0) contacts.onGround = true;
      if (bestNY > 0) contacts.onCeiling = true;
      if (bestNX > 0) contacts.onWallL = true;
      if (bestNX < 0) contacts.onWallR = true;

      // Cancel velocity along the hit normal.
      const vDotN = body.velocity.x * bestNX + body.velocity.y * bestNY;
      if (vDotN < 0) {
        body.velocity.x -= vDotN * bestNX;
        body.velocity.y -= vDotN * bestNY;
      }

      // Slide remaining displacement along the tangent.
      const remaining = 1 - bestT;
      const rDotN = dx * bestNX + dy * bestNY;
      dx = (dx - rDotN * bestNX) * remaining;
      dy = (dy - rDotN * bestNY) * remaining;
    } else {
      // No hit — apply full remaining displacement.
      body.position.x += dx;
      body.position.y += dy;
      break;
    }
  }

  // Adjacency probe: detect resting contact even when velocity is zero.
  // Each probe queries a 1-pixel-wide band outside the body's face.
  const PROBE = SKIN * 4;
  const px = body.position.x;
  const py = body.position.y;
  const hw = body.halfExtents.x;
  const hh = body.halfExtents.y;
  const narrow = 0.01; // inset to avoid corner tiles triggering wrong flags

  // Ground probe: strip below the body
  querySolidTiles(world, px, py + hh + PROBE, hw - narrow, PROBE, _tiles);
  if (_tiles.length > 0) contacts.onGround = true;

  // Ceiling probe: strip above the body
  querySolidTiles(world, px, py - hh - PROBE, hw - narrow, PROBE, _tiles);
  if (_tiles.length > 0) contacts.onCeiling = true;

  // Right wall probe
  querySolidTiles(world, px + hw + PROBE, py, PROBE, hh - narrow, _tiles);
  if (_tiles.length > 0) contacts.onWallR = true;

  // Left wall probe
  querySolidTiles(world, px - hw - PROBE, py, PROBE, hh - narrow, _tiles);
  if (_tiles.length > 0) contacts.onWallL = true;

  // Write back flags.
  body.flags.onGround = contacts.onGround;
  body.flags.onCeiling = contacts.onCeiling;
  body.flags.onWallL = contacts.onWallL;
  body.flags.onWallR = contacts.onWallR;

  return contacts;
}
