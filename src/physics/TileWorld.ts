/**
 * Static tile-based world.
 * Tile coordinate (tx, ty) maps to world AABB:
 *   min = (tx, ty), max = (tx+1, ty+1)
 *
 * Y increases downward to match physics (+Y = down gravity).
 *
 * The addressable Y range is `[yMin, yMin + height)`. `yMin` defaults to 0
 * for backward compatibility but can be set negative so the world extends
 * upward (for climbing-style levels where the player ascends into negative Y).
 */
export class TileWorld {
  private readonly _solid: Uint8Array;

  /** Width in tiles. */
  readonly width: number;
  /** Height in tiles. */
  readonly height: number;
  /** Inclusive lower bound of the addressable tile-Y range. */
  readonly yMin: number;

  constructor(width: number, height: number, yMin = 0) {
    this.width = width;
    this.height = height;
    this.yMin = yMin;
    this._solid = new Uint8Array(width * height);
  }

  private _idx(tx: number, ty: number): number {
    return (ty - this.yMin) * this.width + tx;
  }

  private _inBounds(tx: number, ty: number): boolean {
    return (
      tx >= 0 &&
      tx < this.width &&
      ty >= this.yMin &&
      ty < this.yMin + this.height
    );
  }

  /**
   * Returns true if the tile at integer coords (tx, ty) is solid.
   * Out-of-bounds tiles are treated as open (not solid).
   * World boundaries are handled by the death plane / level design.
   */
  solidAt(tx: number, ty: number): boolean {
    if (!this._inBounds(tx, ty)) return false;
    return this._solid[this._idx(tx, ty)] !== 0;
  }

  /** Set the solid state of a tile. */
  setTile(tx: number, ty: number, solid: boolean): void {
    if (!this._inBounds(tx, ty)) return;
    this._solid[this._idx(tx, ty)] = solid ? 1 : 0;
  }

  /** Fill a rectangular region with a solid/empty state. */
  fillRect(
    tx: number,
    ty: number,
    w: number,
    h: number,
    solid: boolean,
  ): void {
    for (let y = ty; y < ty + h; y++) {
      for (let x = tx; x < tx + w; x++) {
        this.setTile(x, y, solid);
      }
    }
  }

  /** Clear all tiles (set every cell to non-solid). */
  clear(): void {
    this._solid.fill(0);
  }
}
