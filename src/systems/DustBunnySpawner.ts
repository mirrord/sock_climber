import type { RNG } from "../core/RNG.js";
import type { Generator } from "../level/Generator.js";
import { DustBunny } from "../entities/obstacles/DustBunny.js";
import type { Player } from "../entities/Player.js";
import type { SpawnSystem } from "./SpawnSystem.js";

/**
 * DustBunnySpawner — periodically drops a `DustBunny` onto a wall overhang
 * ahead of the player. Used by level 1, where the vertical generator
 * produces overhangs that would otherwise sit empty.
 *
 * Each tick the spawner advances its timer; when the next interval elapses
 * it picks a random overhang within a vertical band ahead of the player and
 * spawns a stationary bunny resting on top. Per-overhang cooldowns prevent
 * stacking multiple bunnies on the same ledge.
 */
export class DustBunnySpawner {
  /** Min seconds between spawn rolls. */
  static readonly MIN_INTERVAL = 5;
  /** Max seconds between spawn rolls. */
  static readonly MAX_INTERVAL = 9;
  /** Per-overhang cooldown after a successful spawn, in seconds. */
  static readonly OVERHANG_COOLDOWN = 12;
  /** How far above the player (in tiles) overhangs become eligible. */
  static readonly MIN_LEAD_TILES = 4;
  /** How far above the player (in tiles) overhangs stop being eligible. */
  static readonly MAX_LEAD_TILES = 35;

  private _gen: Generator;
  private readonly _spawnSystem: SpawnSystem;
  private readonly _player: Player;
  private readonly _rng: RNG;
  private _timer = 0;
  private _nextInterval: number;
  /** Map of `${tx},${ty}` overhang key → seconds of cooldown remaining. */
  private readonly _cooldowns = new Map<string, number>();

  constructor(
    gen: Generator,
    spawnSystem: SpawnSystem,
    player: Player,
    rng: RNG,
  ) {
    this._gen = gen;
    this._spawnSystem = spawnSystem;
    this._player = player;
    this._rng = rng;
    this._nextInterval = this._rollInterval();
  }

  /** Swap in a new generator (called on level reset). */
  reset(gen: Generator): void {
    this._gen = gen;
    this._timer = 0;
    this._cooldowns.clear();
    this._nextInterval = this._rollInterval();
  }

  /** Advance the spawn timer; spawn at most one bunny per call. */
  tick(dt: number): void {
    // Decay cooldowns.
    for (const [key, remaining] of this._cooldowns) {
      const next = remaining - dt;
      if (next <= 0) this._cooldowns.delete(key);
      else this._cooldowns.set(key, next);
    }

    this._timer += dt;
    if (this._timer < this._nextInterval) return;
    this._timer = 0;
    this._nextInterval = this._rollInterval();

    const candidate = this._pickCandidate();
    if (candidate === null) return;
    this._spawn(candidate);
  }

  private _rollInterval(): number {
    const span = DustBunnySpawner.MAX_INTERVAL - DustBunnySpawner.MIN_INTERVAL;
    return DustBunnySpawner.MIN_INTERVAL + this._rng.next() * span;
  }

  private _pickCandidate():
    | { tx: number; ty: number; length: number }
    | null {
    // World Y+ = down; player climbs into smaller (more negative) Y. An
    // overhang "ahead of" the player therefore has a smaller worldTy.
    const py = this._player.body.position.y;
    const maxTy = py - DustBunnySpawner.MIN_LEAD_TILES;
    const minTy = py - DustBunnySpawner.MAX_LEAD_TILES;

    const eligible: Array<{ tx: number; ty: number; length: number }> = [];
    for (const chunk of this._gen.chunks) {
      const overhangs = chunk.overhangs;
      if (!overhangs || overhangs.length === 0) continue;
      for (const o of overhangs) {
        if (o.ty < minTy || o.ty > maxTy) continue;
        if (this._cooldowns.has(this._key(o.tx, o.ty))) continue;
        eligible.push({ tx: o.tx, ty: o.ty, length: o.length });
      }
    }
    if (eligible.length === 0) return null;
    return this._rng.pick(eligible);
  }

  private _spawn(o: { tx: number; ty: number; length: number }): void {
    // Pick a tile within the overhang span, biasing away from the boundary
    // anchor tile so the bunny isn't half-buried in the wall column.
    const offset =
      o.length <= 1 ? 0 : this._rng.int(1, o.length - 1);
    const tileX = o.tx + offset;
    const x = tileX + 0.5;
    const y = o.ty - 0.5; // bunny halfH = 0.5 → bottom edge rests on ty.

    const bunny = new DustBunny({ x, y });
    this._spawnSystem.addEntity({
      kind: "obstacle",
      tag: "DustBunny",
      position: { x, y },
      entity: bunny,
    });

    this._cooldowns.set(
      this._key(o.tx, o.ty),
      DustBunnySpawner.OVERHANG_COOLDOWN,
    );
  }

  private _key(tx: number, ty: number): string {
    return `${tx},${ty}`;
  }
}
