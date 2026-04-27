/**
 * Mutable 2D vector. Used throughout the engine to avoid per-frame allocations.
 * Always obtain from `Vec2Pool` inside the game loop; never `new Vec2()` in hot paths.
 */
export class Vec2 {
  constructor(
    public x: number = 0,
    public y: number = 0,
  ) {}

  set(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }

  copyFrom(v: Readonly<Vec2>): this {
    this.x = v.x;
    this.y = v.y;
    return this;
  }

  add(v: Readonly<Vec2>): this {
    this.x += v.x;
    this.y += v.y;
    return this;
  }

  addScaled(v: Readonly<Vec2>, s: number): this {
    this.x += v.x * s;
    this.y += v.y * s;
    return this;
  }

  sub(v: Readonly<Vec2>): this {
    this.x -= v.x;
    this.y -= v.y;
    return this;
  }

  scale(s: number): this {
    this.x *= s;
    this.y *= s;
    return this;
  }

  lengthSq(): number {
    return this.x * this.x + this.y * this.y;
  }

  length(): number {
    return Math.sqrt(this.lengthSq());
  }

  dot(v: Readonly<Vec2>): number {
    return this.x * v.x + this.y * v.y;
  }

  zero(): this {
    this.x = 0;
    this.y = 0;
    return this;
  }

  clone(): Vec2 {
    return new Vec2(this.x, this.y);
  }
}

/**
 * Object pool for Vec2 instances.
 * Acquire before use, release when done — never hold across frames.
 *
 * @example
 * const pool = new Vec2Pool(32);
 * const v = pool.acquire().set(1, 2);
 * // ... use v ...
 * pool.release(v);
 */
export class Vec2Pool {
  private readonly _free: Vec2[] = [];
  private _totalAllocated = 0;

  constructor(initialCapacity = 16) {
    for (let i = 0; i < initialCapacity; i++) {
      this._free.push(new Vec2());
      this._totalAllocated++;
    }
  }

  /** Returns the number of Vec2 objects ever created by this pool. */
  get totalAllocated(): number {
    return this._totalAllocated;
  }

  /** Returns the number of Vec2 objects currently in the free list. */
  get freeCount(): number {
    return this._free.length;
  }

  /** Acquire a zeroed Vec2 from the pool (may allocate if empty). */
  acquire(): Vec2 {
    const v = this._free.pop();
    if (v !== undefined) {
      v.zero();
      return v;
    }
    this._totalAllocated++;
    return new Vec2();
  }

  /** Return a Vec2 to the pool. Do not use `v` after releasing. */
  release(v: Vec2): void {
    this._free.push(v);
  }
}

/** Shared global pool — use in gameplay code. */
export const vec2Pool = new Vec2Pool(32);
