# Physics

## Goals
- Deterministic, fixed-step simulation.
- Cheap broadphase against a tile world.
- Swept AABB resolution that yields contact normals (drives ground/wall flags for the player controller).

## Step
- `dt = 1/120` s. Loop accumulates real elapsed time and runs N integer steps before render.
- Render uses an interpolation factor `alpha = accumulator / dt` for visual smoothing only.

## Bodies
- AABB only (no rotated colliders for MVP).
- Components: `position`, `halfExtents`, `velocity`, `gravity`, `drag`, `flags { onGround, onWallL, onWallR, onCeiling }`.

## Static world
- Tile grid, 1 tile = 1 m, axis-aligned.
- Spatial hash keyed by integer cell for O(1) broadphase lookup.

## Collision pipeline
1. Integrate velocity (gravity, drag).
2. Sweep proposed motion through tile AABBs using slab method.
3. Resolve at first hit; project remaining motion along contact tangent ("slide along walls").
4. Repeat up to a small iteration cap (e.g. 4) to handle corners.
5. Update body flags from collected contact normals.

## Edge cases to test
- Drop straight onto floor: lands cleanly, `onGround = true`, no jitter.
- Run into vertical wall: stops, `onWallR/L = true`, vertical motion unaffected.
- Diagonal motion into corner: simultaneous X+Y contact, both flags set, no clipping.
- High-speed tunnelling: swept catches the wall regardless of `dt * v`.
- Ceiling bonk: vertical velocity zeroed, `onCeiling = true`.

## Debug rendering
- `?debug=1` URL flag toggles AABB outlines, contact normals, velocity vectors.

## Out of scope (MVP)
Continuous physics for moving platforms (handled as kinematic later), rotational dynamics, joints, soft bodies.
