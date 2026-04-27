import type { RNG } from "../core/RNG.js";
import { createRNG } from "../core/RNG.js";
import { TileWorld } from "../physics/TileWorld.js";
import type { Enemy } from "../entities/enemies/Enemy.js";
import type { Obstacle } from "../entities/obstacles/Obstacle.js";
import type { Buff } from "../entities/buffs/Buff.js";
import {
  ENEMY_REGISTRY,
  type EnemyTag,
} from "../entities/enemies/EnemyRegistry.js";
import {
  OBSTACLE_REGISTRY,
  type ObstacleTag,
} from "../entities/obstacles/ObstacleRegistry.js";
import {
  BUFF_REGISTRY,
  type BuffTag,
} from "../entities/buffs/BuffRegistry.js";
import type { ChunkProfile, EntityTag } from "./Chunks.js";
import { OPEN_PROFILES, TIGHT_PROFILES } from "./Chunks.js";
import {
  deriveJumpArcBounds,
  hasReachablePredecessor,
  type PlatformCandidate,
} from "./Reachability.js";
import { poissonSample } from "./Sampler.js";
import type { PlayerStats } from "../entities/components/Stats.js";
import { DEFAULT_PLAYER_STATS } from "../entities/components/Stats.js";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/** A single placed tile in world space. */
export interface PlacedTile {
  /** World tile X. */
  tx: number;
  /** World tile Y. */
  ty: number;
  solid: boolean;
}

/** A single spawned entity (enemy, obstacle, or buff). */
export interface SpawnedEntity {
  kind: "enemy" | "obstacle" | "buff";
  tag: EntityTag;
  /** World-space spawn position (tile centre). */
  position: { x: number; y: number };
  /** Live entity object, already constructed. */
  entity: Enemy | Obstacle | Buff;
}

/** Output of one `advance()` call. */
export interface AdvanceResult {
  /** Tiles placed this call (wall and platform tiles). */
  newTiles: readonly PlacedTile[];
  /** Entities spawned this call. */
  newEntities: readonly SpawnedEntity[];
  /** IDs of entities that were despawned and should be removed from the world. */
  despawnedEntityIds: readonly number[];
  /** Whether a segment boundary was crossed in this call. */
  segmentCrossed: boolean;
}

/** Represents an already-generated chunk tracked in the generator's queue. */
export interface GeneratedChunk {
  profile: ChunkProfile;
  /** World-tile Y of the top row of this chunk (smaller = higher in world). */
  originY: number;
  /** World-tile X of the left edge. */
  originX: number;
  /** All entities spawned into this chunk. */
  entities: SpawnedEntity[];
  /** Whether the segment-cross event has fired for this chunk. */
  segmentCrossedFired: boolean;
}

/** Registries passed to `createGenerator`. */
export interface GeneratorRegistries {
  enemyRegistry?: typeof ENEMY_REGISTRY;
  obstacleRegistry?: typeof OBSTACLE_REGISTRY;
  buffRegistry?: typeof BUFF_REGISTRY;
}

/** Options for `createGenerator`. */
export interface GeneratorOptions {
  /** Seed for all procedural choices. */
  seed: number;
  /**
   * World-tile Y that the camera is currently showing (centre row).
   * Advances as the player climbs. Decreases (more negative) over time.
   */
  cameraY: number;
  /** How many tile-rows ahead of the camera to keep generated. Defaults to 80. */
  lookahead?: number;
  /**
   * World-tile Y of the death plane.
   * Chunks whose bottom edge is above (less than) `deathPlaneY − graceRows` are despawned.
   * Defaults to Infinity (no despawn unless explicitly updated).
   */
  deathPlaneY?: number;
  /** Extra rows below the death plane before a chunk is despawned. Defaults to 8. */
  graceRows?: number;
  /** Player stats used for jump-arc reachability. Defaults to DEFAULT_PLAYER_STATS. */
  playerStats?: Partial<PlayerStats>;
  /** Proportion of open:tight chunks. 0 = all tight, 1 = all open. Defaults to 0.6. */
  openBias?: number;
  /** Width of the world in tiles. Chunks are centred within this. Defaults to 12. */
  worldWidth?: number;
  /**
   * Inclusive rectangular region (in world tile coords) where the generator must
   * not place any solid tiles or entity spawns. Used to keep the player's spawn
   * area clear so the player cannot start inside a platform or wall protrusion.
   * If omitted, no region is reserved.
   */
  spawnSafeZone?: {
    minTx: number;
    maxTx: number;
    minTy: number;
    maxTy: number;
  };
  /** Registries override (for testing). */
  registries?: GeneratorRegistries;
}

/**
 * The generator instance returned by `createGenerator`.
 */
export interface Generator {
  /**
   * Advance generation to cover the current camera position plus lookahead.
   * Call once per frame (or whenever camera Y changes).
   *
   * @param cameraY - Current world-tile Y of the camera. Should be ≤ 0 and decreasing.
   * @param deathPlaneY - Current world-tile Y of the death plane (positive = below start).
   */
  advance(cameraY: number, deathPlaneY: number): AdvanceResult;

  /** All chunks currently alive in the world. */
  readonly chunks: readonly GeneratedChunk[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const ENEMY_TAGS: readonly EnemyTag[] = [
  "Keys",
  "Wallet",
  "Phone",
  "Lipstick",
  "Headphones",
];
const OBSTACLE_TAGS: readonly ObstacleTag[] = [
  "Gum",
  "DustBunny",
  "Lighter",
  "Pen",
];
const BUFF_TAGS: readonly BuffTag[] = [
  "LowGravitySock",
  "SpeedSock",
  "SlowFloodSock",
  "HighJumpSock",
  "PowerSock",
  "RapidStrikeSock",
];

function isEnemyTag(tag: EntityTag): tag is EnemyTag {
  return (ENEMY_TAGS as readonly EntityTag[]).includes(tag);
}
function isObstacleTag(tag: EntityTag): tag is ObstacleTag {
  return (OBSTACLE_TAGS as readonly EntityTag[]).includes(tag);
}
function isBuffTag(tag: EntityTag): tag is BuffTag {
  return (BUFF_TAGS as readonly EntityTag[]).includes(tag);
}

// ─────────────────────────────────────────────────────────────────────────────
// Core factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a stateful level generator.
 *
 * The generator maintains an internal queue of `GeneratedChunk` objects.
 * Each call to `advance()` grows the tail as the camera moves up, and
 * prunes the head once chunks are behind the death plane.
 */
export function createGenerator(opts: GeneratorOptions): Generator {
  const LOOKAHEAD = opts.lookahead ?? 80;
  const GRACE_ROWS = opts.graceRows ?? 8;
  const OPEN_BIAS = opts.openBias ?? 0.6;
  const WORLD_WIDTH = opts.worldWidth ?? 12;
  const SPAWN_SAFE_ZONE = opts.spawnSafeZone;

  /** True if (tx, ty) lies inside the configured spawn safe zone. */
  function inSpawnSafeZone(tx: number, ty: number): boolean {
    const z = SPAWN_SAFE_ZONE;
    if (!z) return false;
    return tx >= z.minTx && tx <= z.maxTx && ty >= z.minTy && ty <= z.maxTy;
  }

  // Track every solid tile placed by the generator across all chunks. Used to
  // detect diagonal "corner-adjacent" pinches that the player cannot pass
  // through. Keyed by `${tx},${ty}`.
  const placedSolid = new Set<string>();
  const tileKey = (tx: number, ty: number): string => `${tx},${ty}`;
  const isSolid = (tx: number, ty: number): boolean =>
    placedSolid.has(tileKey(tx, ty));

  /**
   * Returns true if placing a solid at (tx, ty) would create a diagonal
   * pinch with an existing solid — i.e. an existing solid sits diagonally
   * adjacent and both cardinal cells between them are open. Such a
   * configuration blocks the player from passing through the gap.
   */
  function wouldCreatePinch(tx: number, ty: number): boolean {
    const diagonals: ReadonlyArray<readonly [number, number]> = [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ];
    for (const [dx, dy] of diagonals) {
      if (
        isSolid(tx + dx, ty + dy) &&
        !isSolid(tx + dx, ty) &&
        !isSolid(tx, ty + dy)
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Unconditionally record a solid tile (used for world-boundary walls which
   * must always be present). Skips re-emitting an already-placed tile.
   */
  function placeSolidUnchecked(tx: number, ty: number, out: PlacedTile[]): void {
    if (inSpawnSafeZone(tx, ty)) return;
    const k = tileKey(tx, ty);
    if (placedSolid.has(k)) return;
    placedSolid.add(k);
    out.push({ tx, ty, solid: true });
  }

  /**
   * Attempt to record a solid tile, refusing the placement if it would land
   * inside the spawn safe zone or create a diagonal pinch with an existing
   * solid. Returns true on success.
   */
  function tryPlaceSolid(tx: number, ty: number, out: PlacedTile[]): boolean {
    if (inSpawnSafeZone(tx, ty)) return false;
    const k = tileKey(tx, ty);
    if (placedSolid.has(k)) return true;
    if (wouldCreatePinch(tx, ty)) return false;
    placedSolid.add(k);
    out.push({ tx, ty, solid: true });
    return true;
  }

  const playerStats: PlayerStats = {
    ...DEFAULT_PLAYER_STATS,
    ...opts.playerStats,
  };
  const arcBounds = deriveJumpArcBounds(playerStats);

  const enemyRegistry = opts.registries?.enemyRegistry ?? ENEMY_REGISTRY;
  const obstacleRegistry =
    opts.registries?.obstacleRegistry ?? OBSTACLE_REGISTRY;
  const buffRegistry = opts.registries?.buffRegistry ?? BUFF_REGISTRY;

  // Top-level RNG — drives chunk selection and intra-chunk sub-RNGs.
  const rng: RNG = createRNG(opts.seed);

  // Generated chunk queue; ordered bottom→top (increasing originY = deeper = later despawn).
  const chunks: GeneratedChunk[] = [];

  /**
   * World Y of the top edge of the next chunk to be placed.
   * Decreases as we build upward (negative is higher).
   * Start at tile row 0 (ground level) and grow upward.
   */
  let nextChunkTopY = 0;

  // Track the last placed platform across chunk boundaries for reachability.
  let lastPlatforms: PlatformCandidate[] = [
    // Seed with a wide floor platform at origin.
    { tx: 0, ty: 0, width: WORLD_WIDTH },
  ];

  // ───────────────────────────────────────────────────────────────────────────
  // Internal: generate a single chunk
  // ───────────────────────────────────────────────────────────────────────────

  function generateChunk(): {
    chunk: GeneratedChunk;
    tiles: PlacedTile[];
    entities: SpawnedEntity[];
  } {
    // Pick a profile.
    const useOpen = rng.next() < OPEN_BIAS;
    const profiles = useOpen ? OPEN_PROFILES : TIGHT_PROFILES;
    const profile = rng.pick(profiles);

    // Centre the chunk horizontally inside the world.
    const chunkOriginX = Math.max(
      0,
      Math.floor((WORLD_WIDTH - profile.size.width) / 2),
    );
    const chunkOriginY = nextChunkTopY - profile.size.length; // going upward

    // Advance the next chunk origin.
    nextChunkTopY = chunkOriginY;

    // Sub-RNG seeded from current top-level state (deterministic snapshot).
    const chunkRng = rng.clone();
    // Consume one call on the parent rng so subsequent clones differ.
    rng.next();

    const { length: chunkLen, width: chunkW } = profile.size;

    // ── Wall tiles ──────────────────────────────────────────────────────────
    const tiles: PlacedTile[] = [];

    for (let row = 0; row < chunkLen; row++) {
      const t = row / Math.max(chunkLen - 1, 1);
      const slice = profile.wallProfile(t);
      const worldTy = chunkOriginY + row;

      // Always place solid tiles at the world boundaries so the player can
      // never escape sideways, regardless of how narrow/wide the profile
      // corridor is or whether the chunk is narrower than the world.
      // World-boundary walls are vertically continuous, so they never form
      // diagonal pinches with themselves; place unconditionally.
      placeSolidUnchecked(0, worldTy, tiles);
      placeSolidUnchecked(WORLD_WIDTH - 1, worldTy, tiles);

      // Profile-defined interior wall tiles. Skip placements that would
      // create a diagonal corner pinch with an existing solid tile (which
      // would block the player from progressing).
      for (let x = 0; x < slice.left; x++) {
        tryPlaceSolid(chunkOriginX + x, worldTy, tiles);
      }
      for (let x = slice.right; x < chunkW; x++) {
        tryPlaceSolid(chunkOriginX + x, worldTy, tiles);
      }
    }

    // ── Platform tiles ───────────────────────────────────────────────────────
    const platformCandidates: PlatformCandidate[] = [];

    // Sample positions inside the corridor.
    const interiorW = Math.max(
      1,
      profile.size.width - 2, // rough corridor inner width
    );
    const platformSamples = poissonSample(chunkRng, {
      width: interiorW,
      height: chunkLen,
      minDist: 3,
      density: profile.platformDensity,
    });

    // We want horizontal platform strips; for each sampled Y, place a 2-3 tile wide platform.
    const usedRows = new Set<number>();

    for (const sample of platformSamples) {
      const platformRow = sample.ty;
      if (usedRows.has(platformRow)) continue;

      const t = platformRow / Math.max(chunkLen - 1, 1);
      const slice = profile.wallProfile(t);
      const corridorLeft = slice.left;
      const corridorRight = Math.min(slice.right, chunkW);
      const corridorW = corridorRight - corridorLeft;
      if (corridorW < 2) continue;

      const platformW = chunkRng.int(2, Math.min(4, corridorW));
      const maxStartX = corridorLeft + corridorW - platformW;
      const startX = chunkRng.int(corridorLeft, maxStartX);

      const worldTy = chunkOriginY + platformRow;
      const worldTx = chunkOriginX + startX;

      const candidate: PlatformCandidate = {
        tx: worldTx,
        ty: worldTy,
        width: platformW,
      };

      // Only place if reachable from an existing platform.
      const reachable = hasReachablePredecessor(
        candidate,
        lastPlatforms,
        arcBounds,
      );
      if (!reachable) {
        // Force a stepping stone if no candidates placed yet (guarantee entry).
        if (platformCandidates.length === 0 && platformSamples.indexOf(sample) > platformSamples.length / 2) {
          // Place halfway through as a forced stepping stone.
        } else {
          continue;
        }
      }

      // Reject the entire platform if any of its tiles would land in the
      // spawn safe zone or create a diagonal pinch — partial platforms are
      // not useful to the reachability tracker.
      let blocked = false;
      for (let x = 0; x < platformW; x++) {
        const ttx = worldTx + x;
        if (inSpawnSafeZone(ttx, worldTy) || wouldCreatePinch(ttx, worldTy)) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;

      usedRows.add(platformRow);
      platformCandidates.push(candidate);

      for (let x = 0; x < platformW; x++) {
        tryPlaceSolid(worldTx + x, worldTy, tiles);
      }
    }

    // Force a stepping stone if no platforms placed.
    if (platformCandidates.length === 0) {
      const t = 0.5;
      const slice = profile.wallProfile(t);
      const corridorLeft = slice.left;
      const corridorRight = Math.min(slice.right, chunkW);
      const corridorW = corridorRight - corridorLeft;
      if (corridorW >= 2) {
        const platformW = Math.min(3, corridorW);
        const startX = corridorLeft + Math.floor((corridorW - platformW) / 2);
        const worldTy = chunkOriginY + Math.floor(chunkLen / 2);
        const worldTx = chunkOriginX + startX;
        // Only force the stepping stone if it doesn't conflict with the spawn
        // safe zone or create a pinch.
        let blocked = false;
        for (let x = 0; x < platformW; x++) {
          const ttx = worldTx + x;
          if (inSpawnSafeZone(ttx, worldTy) || wouldCreatePinch(ttx, worldTy)) {
            blocked = true;
            break;
          }
        }
        if (!blocked) {
          const forced: PlatformCandidate = {
            tx: worldTx,
            ty: worldTy,
            width: platformW,
          };
          platformCandidates.push(forced);
          for (let x = 0; x < platformW; x++) {
            tryPlaceSolid(worldTx + x, worldTy, tiles);
          }
        }
      }
    }

    // Update lastPlatforms for next chunk's reachability check.
    if (platformCandidates.length > 0) {
      lastPlatforms = platformCandidates;
    }

    // ── Entities ─────────────────────────────────────────────────────────────
    const entities: SpawnedEntity[] = [];

    const budget = { ...profile.entityBudget };
    const eligibleTags = profile.allowedTags.slice();

    // Shuffle eligible tags.
    for (let i = eligibleTags.length - 1; i > 0; i--) {
      const j = chunkRng.int(0, i);
      const tmp = eligibleTags[i]!;
      eligibleTags[i] = eligibleTags[j]!;
      eligibleTags[j] = tmp;
    }

    // Track which (tx, ty) spawn cells are already occupied within this chunk
    // so two entities never spawn on top of one another.
    const usedSpawnCells = new Set<string>();
    const SPAWN_PICK_ATTEMPTS = 8;

    // For each eligible tag, try to place on a platform.
    for (const tag of eligibleTags) {
      if (budget.enemies <= 0 && budget.obstacles <= 0 && budget.buffs <= 0)
        break;
      if (platformCandidates.length === 0) break;

      let category: "enemy" | "obstacle" | "buff";
      if (isEnemyTag(tag)) {
        if (budget.enemies <= 0) continue;
        category = "enemy";
      } else if (isObstacleTag(tag)) {
        if (budget.obstacles <= 0) continue;
        category = "obstacle";
      } else if (isBuffTag(tag)) {
        if (budget.buffs <= 0) continue;
        category = "buff";
      } else {
        continue;
      }

      // Pick a platform + tile-x, retrying a few times if the chosen cell is
      // already occupied or falls in the spawn safe zone.
      let spawnTx = 0;
      let spawnTy = 0;
      let spawnKey = "";
      let foundCell = false;
      for (let attempt = 0; attempt < SPAWN_PICK_ATTEMPTS; attempt++) {
        const platform = chunkRng.pick(platformCandidates);
        const tx = platform.tx + chunkRng.int(0, platform.width - 1);
        const ty = platform.ty - 1;
        const key = `${tx},${ty}`;
        if (usedSpawnCells.has(key)) continue;
        if (inSpawnSafeZone(tx, ty)) continue;
        // Reject cells that overlap a solid tile (e.g. a wall column that
        // narrows directly above this platform tile). Spawning inside a
        // wall traps the entity and can softlock combat / collection.
        if (isSolid(tx, ty)) continue;
        spawnTx = tx;
        spawnTy = ty;
        spawnKey = key;
        foundCell = true;
        break;
      }
      if (!foundCell) continue;
      usedSpawnCells.add(spawnKey);

      const position = {
        x: spawnTx + 0.5,
        y: spawnTy + 0.5,
      };

      let entity: Enemy | Obstacle | Buff | null = null;

      if (category === "enemy" && isEnemyTag(tag)) {
        entity = enemyRegistry[tag].factory(position);
        budget.enemies--;
      } else if (category === "obstacle" && isObstacleTag(tag)) {
        entity = obstacleRegistry[tag].factory(position);
        budget.obstacles--;
      } else if (category === "buff" && isBuffTag(tag)) {
        entity = buffRegistry[tag].factory(position);
        budget.buffs--;
      }

      if (entity) {
        entities.push({ kind: category, tag, position, entity });
      }
    }

    const chunk: GeneratedChunk = {
      profile,
      originY: chunkOriginY,
      originX: chunkOriginX,
      entities,
      segmentCrossedFired: false,
    };

    return { chunk, tiles, entities };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Public: advance
  // ───────────────────────────────────────────────────────────────────────────

  function advance(cameraY: number, deathPlaneY: number): AdvanceResult {
    const newTiles: PlacedTile[] = [];
    const newEntities: SpawnedEntity[] = [];
    const despawnedEntityIds: number[] = [];
    let segmentCrossed = false;

    // Generate ahead of the camera.
    while (nextChunkTopY > cameraY - LOOKAHEAD) {
      const { chunk, tiles, entities } = generateChunk();
      chunks.push(chunk);
      newTiles.push(...tiles);
      newEntities.push(...entities);
      // Fire segment cross for this new chunk.
      chunk.segmentCrossedFired = true;
      segmentCrossed = true;
    }

    // Despawn chunks that have been passed by the death plane.
    // World Y: 0 = spawn height, negative = upward (where player climbs).
    // The death plane starts at large positive Y (far below) and rises (Y decreases).
    // A chunk is passed when its bottom edge (largest Y in the chunk) is ABOVE the
    // death plane, i.e. chunkBottomY < deathPlaneY. Add a grace margin so the chunk
    // is kept for a few extra rows after the plane passes.
    // Despawn when: chunkBottomY < deathPlaneY - GRACE_ROWS
    //   → chunk bottom is safely above the death plane by at least GRACE_ROWS.
    const despawnThreshold = deathPlaneY - GRACE_ROWS;
    let i = 0;
    while (i < chunks.length) {
      const chunk = chunks[i]!;
      const chunkBottomY = chunk.originY + chunk.profile.size.length;
      // chunkBottomY is negative for upward chunks; deathPlaneY starts positive.
      // Despawn only when death plane has risen ABOVE (smaller Y than) chunk bottom.
      if (chunkBottomY > despawnThreshold) {
        // Collect entity IDs to despawn.
        for (const se of chunk.entities) {
          despawnedEntityIds.push(se.entity.id);
        }
        chunks.splice(i, 1);
        // Don't increment i; the next chunk shifted into position i.
      } else {
        i++;
      }
    }

    return { newTiles, newEntities, despawnedEntityIds, segmentCrossed };
  }

  return { advance, chunks };
}

/**
 * Convenience helper: apply a `PlacedTile[]` list to a `TileWorld`.
 */
export function applyTilesToWorld(
  tiles: readonly PlacedTile[],
  world: TileWorld,
): void {
  for (const t of tiles) {
    world.setTile(t.tx, t.ty, t.solid);
  }
}
