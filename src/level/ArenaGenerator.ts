/**
 * Arena generator (level 4 — the boss fight).
 *
 * Produces a single fixed level layout: a circular tile-room ~40 m
 * across with a stair-stepped boundary (open inside, solid outside),
 * a single `BossLaundry` enemy at the centre, a handful of
 * `SoftenerBuff` pickups distributed inside, and a small set of
 * fade-platforms whose solidity flips on a randomised timer.
 *
 * Implements the same `Generator` interface as the vertical and
 * horizontal generators so the run loop can dispatch on `climbDir`
 * without further branching. Because the arena is finite, every
 * call to `advance()` after the first emits only delta tiles
 * (fade-platform toggles) — the static walls + entities are placed
 * once.
 */
import type { RNG } from "../core/RNG.js";
import { createRNG } from "../core/RNG.js";
import { BossLaundry } from "../entities/enemies/BossLaundry.js";
import { SoftenerBuff } from "../entities/buffs/SoftenerBuff.js";
import type { ChunkProfile } from "./Chunks.js";
import type {
  AdvanceResult,
  GeneratedChunk,
  Generator,
  GeneratorOptions,
  PlacedTile,
  SpawnedEntity,
} from "./Generator.js";

/** Radius of the arena in tiles. ~40 m diameter. */
export const ARENA_RADIUS = 20;
/** Tile-X centre of the arena. */
export const ARENA_CENTRE_X = 24;
/** Tile-Y centre of the arena (Y+ = down). */
export const ARENA_CENTRE_Y = -8;
/** How many fade platforms to populate. */
const FADE_PLATFORM_COUNT = 6;
/** Width (tiles) of each fade platform. */
const FADE_PLATFORM_WIDTH = 3;
/** Visible-phase duration range in seconds. */
const VISIBLE_RANGE: readonly [number, number] = [1.8, 2.5];
/** Hidden-phase duration range in seconds. */
const HIDDEN_RANGE: readonly [number, number] = [1.8, 2.5];

interface FadePlatform {
  /** Leftmost tile-X of the platform. */
  tx: number;
  /** Tile-Y of the platform's solid row. */
  ty: number;
  /** True when the platform is currently solid. */
  visible: boolean;
  /** Seconds remaining in the current phase. */
  timer: number;
  /** Length of a visible phase, in seconds. */
  visibleDuration: number;
  /** Length of a hidden phase, in seconds. */
  hiddenDuration: number;
}

const ARENA_PROFILE: ChunkProfile = {
  id: "arena",
  size: { width: 48, length: 48 },
  kind: "open",
  platformDensity: 0,
  wallProfile: () => ({ left: 0, right: 0 }),
  allowedTags: ["BossLaundry", "SoftenerBuff"],
  entityBudget: { enemies: 1, obstacles: 0, buffs: 3 },
};

/**
 * Construct the arena generator. Most `GeneratorOptions` fields are
 * ignored — the arena is bespoke rather than chunk-driven — but
 * `seed`, `worldYMin`, and `spawn` are honoured so test code can
 * inject deterministic state.
 */
export function createArenaGenerator(opts: GeneratorOptions): Generator {
  const rng: RNG = createRNG(opts.seed);
  const cx = ARENA_CENTRE_X;
  const cy = ARENA_CENTRE_Y;
  const r = ARENA_RADIUS;
  const worldYMin = opts.worldYMin ?? -32;
  const worldYMax = worldYMin + 48; // exclusive
  const worldW = 48;

  // Arena chunk record. Single chunk for the whole fight; never
  // despawned (player can't get behind the death plane in arena mode).
  const chunk: GeneratedChunk = {
    profile: ARENA_PROFILE,
    originY: worldYMin,
    originX: 0,
    entities: [],
    segmentCrossedFired: true,
  };
  const chunks: GeneratedChunk[] = [chunk];

  const platforms: FadePlatform[] = [];
  let firstAdvance = true;

  /**
   * Range helper — uniform float in `[min, max)` from the supplied RNG.
   */
  function rangeFloat(min: number, max: number): number {
    return min + rng.next() * (max - min);
  }

  /**
   * Build the static walls of the arena: every world tile outside the
   * inscribed circle becomes solid, every tile inside stays open.
   * Returns a flat list of placed tiles (only the solids — empties are
   * implicit).
   */
  function buildWalls(out: PlacedTile[]): void {
    const r2 = r * r;
    for (let ty = worldYMin; ty < worldYMax; ty++) {
      for (let tx = 0; tx < worldW; tx++) {
        const dx = tx - cx;
        const dy = ty - cy;
        if (dx * dx + dy * dy > r2) {
          out.push({ tx, ty, solid: true });
        }
      }
    }
  }

  /**
   * Initialise the fade-platforms. They sit on horizontal chords inside
   * the lower half of the circle so the player can use them as
   * stepping stones above the curved floor. Each platform gets a
   * randomised initial phase + duration so they never all toggle at
   * the same time.
   */
  function buildPlatforms(out: PlacedTile[]): void {
    const slots: ReadonlyArray<{ ty: number; offsetX: number }> = [
      { ty: cy + 4, offsetX: -10 },
      { ty: cy + 4, offsetX: 8 },
      { ty: cy + 8, offsetX: -6 },
      { ty: cy + 8, offsetX: 4 },
      { ty: cy - 2, offsetX: -8 },
      { ty: cy - 2, offsetX: 6 },
    ];
    for (let i = 0; i < FADE_PLATFORM_COUNT; i++) {
      const slot = slots[i % slots.length]!;
      const visibleDuration = rangeFloat(VISIBLE_RANGE[0], VISIBLE_RANGE[1]);
      const hiddenDuration = rangeFloat(HIDDEN_RANGE[0], HIDDEN_RANGE[1]);
      const startVisible = rng.next() < 0.5;
      const platform: FadePlatform = {
        tx: cx + slot.offsetX,
        ty: slot.ty,
        visible: startVisible,
        timer: startVisible ? visibleDuration : hiddenDuration,
        visibleDuration,
        hiddenDuration,
      };
      platforms.push(platform);
      // Emit initial tiles only if visible; hidden platforms are
      // implicitly empty (no tile delta needed for the empty state).
      if (platform.visible) {
        for (let dx = 0; dx < FADE_PLATFORM_WIDTH; dx++) {
          out.push({ tx: platform.tx + dx, ty: platform.ty, solid: true });
        }
      }
    }
  }

  /** Spawn the boss and Softener pickups. */
  function buildEntities(): SpawnedEntity[] {
    const entities: SpawnedEntity[] = [];

    // Boss — placed near the upper half of the room so the player has
    // distance to react before engaging.
    const bossPos = { x: cx, y: cy - 4 };
    const boss = new BossLaundry(bossPos);
    boss.setArenaCentre(cx, cy);
    boss.setRng(createRNG(opts.seed ^ 0xb055));
    entities.push({
      kind: "enemy",
      tag: "BossLaundry",
      position: bossPos,
      entity: boss,
    });

    // Softener pickups: three around the lower half so the player has
    // a starting charge near the floor.
    const buffSpots: ReadonlyArray<{ x: number; y: number }> = [
      { x: cx - 12, y: cy + 6 },
      { x: cx + 12, y: cy + 6 },
      { x: cx, y: cy + 10 },
    ];
    for (const pos of buffSpots) {
      const buff = new SoftenerBuff(pos);
      entities.push({
        kind: "buff",
        tag: "SoftenerBuff",
        position: { ...pos },
        entity: buff,
      });
    }

    chunk.entities = entities.slice();
    return entities;
  }

  /**
   * Advance the fade-platform timers by `dt` seconds. Returns the
   * delta tiles that should be applied to the tile world this frame.
   * Each toggle emits exactly `FADE_PLATFORM_WIDTH` tile updates.
   *
   * `dt` is encoded in the difference between successive `cameraY`
   * values. Since the arena ignores the actual camera, we instead
   * track wall-clock-ish time externally; here we accept a
   * fixed-timestep nominal `dt` of 1/120 s per call so behaviour
   * stays deterministic relative to the run loop's fixed step.
   */
  function tickPlatforms(dt: number, out: PlacedTile[]): void {
    for (const p of platforms) {
      p.timer -= dt;
      if (p.timer > 0) continue;
      p.visible = !p.visible;
      p.timer = p.visible ? p.visibleDuration : p.hiddenDuration;
      for (let dx = 0; dx < FADE_PLATFORM_WIDTH; dx++) {
        out.push({ tx: p.tx + dx, ty: p.ty, solid: p.visible });
      }
    }
  }

  /**
   * Standard `Generator.advance` shape. The first call seeds the
   * static layout + entities; subsequent calls only emit fade-platform
   * tile deltas. The arena is finite, so `cameraY`/`deathPlaneY`
   * arguments are ignored and `segmentCrossed` stays `false` after the
   * initial seed.
   */
  function advance(_cameraY: number, _deathPlaneY: number): AdvanceResult {
    void _cameraY;
    void _deathPlaneY;
    const newTiles: PlacedTile[] = [];
    const newEntities: SpawnedEntity[] = [];
    const despawnedEntityIds: number[] = [];
    let segmentCrossed = false;

    if (firstAdvance) {
      firstAdvance = false;
      buildWalls(newTiles);
      buildPlatforms(newTiles);
      newEntities.push(...buildEntities());
      segmentCrossed = true;
    } else {
      // Fixed-timestep tick: the run loop calls `advance` once per
      // simulation step (1/120 s).
      tickPlatforms(1 / 120, newTiles);
    }

    return { newTiles, newEntities, despawnedEntityIds, segmentCrossed };
  }

  return { advance, chunks };
}
