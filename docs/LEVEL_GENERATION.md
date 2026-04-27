# Level Generation

## Concepts
- The world extends in the **open direction** (away from the encroaching death plane).
- The world is partitioned into **chunks**. Each chunk has a **profile**: `Open` or `Tight`.
- Inside a chunk, tiles (walls, platforms, entities) are placed procedurally with a seeded RNG.

## Chunk profile schema
```
ChunkProfile {
  id: string                      // e.g. 'open_wide_a', 'tight_zigzag_b'
  kind: 'open' | 'tight'
  size: { length: int, width: int }   // in tiles
  wallProfile: fn(t: 0..1) -> { left: int, right: int }  // corridor shape
  platformDensity: 0..1
  entityBudget: { enemies: int, obstacles: int, buffs: int }
  allowedTags: string[]           // which entities may spawn here
}
```

## Generation algorithm
1. Maintain a queue of placed chunks; head = closest to death plane, tail = furthest into the open direction.
2. While the tail is within `LOOKAHEAD` of the camera, pick a `ChunkProfile` whose `kind` follows the segment plan, seed-driven.
3. For the chunk, walk tiles and place:
   - Wall tiles per `wallProfile`.
   - Platform tiles using a Poisson-like sampler bounded by `platformDensity`, constrained to be **reachable** from the previous platform given the player's max jump arc.
   - Entities sampled from `allowedTags` until budgets are spent.
4. Despawn chunks the death plane has passed (with a small grace margin).

## Reachability heuristic
- Player jump arc parameters fed in from `PlayerStats`.
- For each candidate platform, verify there exists a prior platform within `(maxJumpDx, maxJumpDy)`.
- If no candidate passes, force-place a stepping-stone platform.

## Segment boundary
- Crossing from one chunk into the next emits `onSegmentCross(prev, next)`.
- `DeathPlaneSystem` listens and bumps its base speed by a small delta.

## Determinism
- A single `seed` parameterises both chunk selection and intra-chunk placement.
- Snapshot tests assert that `(seed)` -> identical tile + entity layout.

## Out of scope
Hand-authored set-piece chunks (could be added later as a third profile `set_piece`).
