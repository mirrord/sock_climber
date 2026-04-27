import type { TileWorld } from "./TileWorld.js";

/**
 * Returns all solid tile coordinates whose AABB overlaps the query AABB.
 *
 * The broadphase iterates over the integer tile cells that the AABB
 * footprint spans — O(tiles covered), typically 1–6 for normal bodies.
 *
 * @param world        - The tile world to query.
 * @param cx           - Center X of the query AABB.
 * @param cy           - Center Y of the query AABB.
 * @param halfW        - Half-width of the query AABB.
 * @param halfH        - Half-height of the query AABB.
 * @param out          - Output array to fill with {tx, ty} pairs (cleared first).
 */
export function querySolidTiles(
  world: TileWorld,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
  out: Array<{ tx: number; ty: number }>,
): void {
  out.length = 0;

  const minX = Math.floor(cx - halfW);
  const maxX = Math.floor(cx + halfW);
  const minY = Math.floor(cy - halfH);
  const maxY = Math.floor(cy + halfH);

  for (let ty = minY; ty <= maxY; ty++) {
    for (let tx = minX; tx <= maxX; tx++) {
      if (world.solidAt(tx, ty)) {
        out.push({ tx, ty });
      }
    }
  }
}
