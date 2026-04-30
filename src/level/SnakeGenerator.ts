/**
 * Procedural generator for level 3 ("The Snaking Corridor").
 *
 * Conforms to the public `Generator` interface so the bootstrap in
 * `main.ts` can swap implementations purely on the configured
 * `ClimbDir`. The generator owns a `PathBuilder` (and thus a `Path`)
 * and emits wall + platform tiles around the corridor swept by that
 * path. Both arguments to `advance()` are interpreted as path-`s`
 * coordinates (= floored metres) since 1 tile = 1 m.
 *
 * Compared to the level-1 / level-2 generators this implementation is
 * intentionally simpler — see `docs/LEVEL_3_PLAN.md` for the full
 * design and the deferred features (curved bends, 8-direction
 * diagonals, occupancy-aware enemy patrols).
 */
import type { RNG } from "../core/RNG.js";
import { createRNG } from "../core/RNG.js";
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
import {
  deriveJumpArcBounds,
  hasReachablePredecessor,
  type PlatformCandidate,
} from "./Reachability.js";
import { PathBuilder } from "./PathBuilder.js";
import type { Path } from "./Path.js";
import type {
  AdvanceResult,
  GeneratedChunk,
  GeneratorOptions,
  PlacedTile,
  SpawnedEntity,
  Generator,
} from "./Generator.js";
import type { PlayerStats } from "../entities/components/Stats.js";
import { DEFAULT_PLAYER_STATS } from "../entities/components/Stats.js";

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

/** Fixed-cost ChunkProfile stand-in (no `wallProfile` is consulted). */
const SNAKE_PROFILE_TEMPLATE: Omit<ChunkProfile, "size"> = {
  id: "snake-corridor",
  kind: "open",
  platformDensity: 0.4,
  wallProfile: () => ({ left: 0, right: 0 }),
  allowedTags: [
    "Keys",
    "Wallet",
    "Phone",
    "Lipstick",
    "Headphones",
    "Gum",
    "DustBunny",
    "Lighter",
    "Pen",
    "LowGravitySock",
    "SpeedSock",
    "SlowFloodSock",
    "HighJumpSock",
    "PowerSock",
    "RapidStrikeSock",
  ],
  entityBudget: { enemies: 2, obstacles: 1, buffs: 1 },
};

/** Slice of path-`s` covered by a single emitted chunk. */
const CHUNK_S_LENGTH = 24;

/** Lateral half-width of the corridor in tiles (= metres). */
const CORRIDOR_HALF_WIDTH = 4;

/** Snake generator extends the public `Generator` shape with `path`. */
export interface SnakeGenerator extends Generator {
  /** Live path the generator extends as `advance()` runs. */
  readonly path: Path;
}

/**
 * Build a snaking-corridor generator. Public API is
 * `advance(playerS, deathPlaneS)` (both in metres / path-`s` units)
 * plus the standard `chunks` accessor; additionally exposes the live
 * `path` so the renderer can project the death plane to world space.
 */
export function createSnakeGenerator(opts: GeneratorOptions): SnakeGenerator {
  const LOOKAHEAD = opts.lookahead ?? 80;
  const GRACE_TILES = opts.graceRows ?? 8;
  const SPAWN_SAFE_ZONE = opts.spawnSafeZone;
  const ENEMY_SPAWN_MIN_DISTANCE = opts.enemySpawnMinHeight ?? 30;

  function inSpawnSafeZone(tx: number, ty: number): boolean {
    const z = SPAWN_SAFE_ZONE;
    if (!z) return false;
    return tx >= z.minTx && tx <= z.maxTx && ty >= z.minTy && ty <= z.maxTy;
  }

  // Track every solid + every interior-corridor tile placed so far.
  const placedSolid = new Set<string>();
  const interior = new Set<string>();
  const tileKey = (tx: number, ty: number): string => `${tx},${ty}`;
  const isSolid = (tx: number, ty: number): boolean =>
    placedSolid.has(tileKey(tx, ty));

  function placeSolidUnchecked(
    tx: number,
    ty: number,
    out: PlacedTile[],
  ): void {
    if (inSpawnSafeZone(tx, ty)) return;
    // Don't carve a wall through a corridor interior tile — the
    // corridor must stay traversable.
    if (interior.has(tileKey(tx, ty))) return;
    const k = tileKey(tx, ty);
    if (placedSolid.has(k)) return;
    placedSolid.add(k);
    out.push({ tx, ty, solid: true });
  }

  function getEntityHalfExtents(
    entity: Enemy | Obstacle | Buff,
  ): { x: number; y: number } {
    if ("body" in entity) {
      return {
        x: entity.body.halfExtents.x,
        y: entity.body.halfExtents.y,
      };
    }
    return { x: entity.halfW, y: entity.halfH };
  }

  function setEntityPosition(
    entity: Enemy | Obstacle | Buff,
    x: number,
    y: number,
  ): void {
    if ("body" in entity) {
      entity.body.position.x = x;
      entity.body.position.y = y;
    } else {
      entity.position.x = x;
      entity.position.y = y;
    }
  }

  function aabbOverlapsSolid(
    cx: number,
    cy: number,
    halfW: number,
    halfH: number,
  ): boolean {
    const EPS = 1e-3;
    const minTx = Math.floor(cx - halfW + EPS);
    const maxTx = Math.floor(cx + halfW - EPS);
    const minTy = Math.floor(cy - halfH + EPS);
    const maxTy = Math.floor(cy + halfH - EPS);
    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        if (isSolid(tx, ty)) return true;
      }
    }
    return false;
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

  const rng: RNG = createRNG(opts.seed);

  // The path's origin is the player spawn position. `TileWorld` only
  // addresses tx ≥ 0, so spawning near world origin would clip the
  // left wall — Level 3's config centres the spawn inside the
  // addressable range and we anchor the path here.
  const spawn = opts.spawn ?? { x: 0, y: 0 };
  const builder = new PathBuilder({
    rng,
    start: { x: spawn.x, y: spawn.y },
    minSegmentLength: 30,
    maxSegmentLength: 60,
    corridorHalfWidth: CORRIDOR_HALF_WIDTH,
  });
  const path = builder.path;

  const chunks: GeneratedChunk[] = [];

  /** Path-`s` at which the next chunk will start. */
  let nextChunkS = 0;

  // Reachability seed: a virtual platform at the spawn so the first
  // chunk's platforms can be tested against it. Anchored to spawn so
  // the seed sits under the actual seeded floor cap rather than at
  // world origin.
  const spawnTx = Math.floor(spawn.x);
  const spawnTy = Math.floor(spawn.y);
  let lastPlatforms: PlatformCandidate[] = [
    {
      tx: spawnTx - CORRIDOR_HALF_WIDTH,
      ty: spawnTy + 1,
      width: CORRIDOR_HALF_WIDTH * 2,
    },
  ];

  /**
   * Carve the interior of the corridor at every integer-`s` step in
   * `[s0, s1]` so wall placement can refuse to overwrite traversable
   * cells. Adds tiles to the `interior` set in-place.
   */
  function carveInterior(s0: number, s1: number): void {
    const step = 0.5;
    for (let s = s0; s <= s1; s += step) {
      const { position, tangent } = path.projectS(s, 0);
      const px = -tangent.y;
      const py = tangent.x;
      // Inclusive of the centreline ± half-width.
      for (let n = -CORRIDOR_HALF_WIDTH; n <= CORRIDOR_HALF_WIDTH; n++) {
        const wx = position.x + px * n;
        const wy = position.y + py * n;
        interior.add(tileKey(Math.floor(wx), Math.floor(wy)));
      }
    }
  }

  function generateChunk(): {
    chunk: GeneratedChunk;
    tiles: PlacedTile[];
    entities: SpawnedEntity[];
  } {
    const sStart = nextChunkS;
    const sEnd = sStart + CHUNK_S_LENGTH;
    nextChunkS = sEnd;

    // Make sure the path covers this whole chunk.
    builder.extendTo(sEnd + CORRIDOR_HALF_WIDTH * 2);

    // Pre-carve interior so wall pass can avoid clobbering it.
    carveInterior(sStart, sEnd);

    const chunkRng = rng.clone();
    rng.next();

    const tiles: PlacedTile[] = [];

    // ── Walls ────────────────────────────────────────────────────────
    // Place solid tiles in a 1-tile-thick band just outside the
    // corridor's lateral half-width on both sides. The band needs to
    // be sampled finely enough that diagonals (future work) don't
    // leave gaps; for cardinals 0.25-`s` is plenty.
    const wallOffset = CORRIDOR_HALF_WIDTH + 1;
    for (let s = sStart; s <= sEnd; s += 0.25) {
      const { position, tangent } = path.projectS(s, 0);
      const px = -tangent.y;
      const py = tangent.x;
      for (const sign of [-1, 1]) {
        const wx = position.x + px * wallOffset * sign;
        const wy = position.y + py * wallOffset * sign;
        placeSolidUnchecked(Math.floor(wx), Math.floor(wy), tiles);
      }
    }

    // ── Platforms ────────────────────────────────────────────────────
    // Sample candidate (s_local, n) pairs and project to world. We use
    // the existing Poisson sampler in (s_local, n) space and treat the
    // n axis as integer offsets in `[0, 2*CORRIDOR_HALF_WIDTH]`.
    const platformCandidates: PlatformCandidate[] = [];
    const interiorN = CORRIDOR_HALF_WIDTH * 2 - 1; // exclude the wall row
    const placedKeys = new Set<string>();

    // Cheap manual sampling — Poisson in path-space wouldn't add value
    // for an MVP since the corridor is narrow.
    const SAMPLES = Math.floor(CHUNK_S_LENGTH * SNAKE_PROFILE_TEMPLATE.platformDensity);
    for (let i = 0; i < SAMPLES; i++) {
      const sLocal = chunkRng.int(2, CHUNK_S_LENGTH - 2);
      const nLocal = chunkRng.int(1, interiorN - 1);
      const n = nLocal - CORRIDOR_HALF_WIDTH; // map [1..2W-1] → roughly [-W+1..W-1]
      const s = sStart + sLocal;
      const { position } = path.projectS(s, n);
      const tx = Math.floor(position.x);
      const ty = Math.floor(position.y);
      const platformW = chunkRng.int(2, 3);

      const candidate: PlatformCandidate = { tx, ty, width: platformW };

      // Reject if any tile of the platform is outside the carved
      // interior, in the safe zone, already solid, or fails reachability.
      let blocked = false;
      for (let dx = 0; dx < platformW; dx++) {
        const ttx = tx + dx;
        const key = tileKey(ttx, ty);
        if (
          inSpawnSafeZone(ttx, ty) ||
          isSolid(ttx, ty) ||
          !interior.has(key) ||
          placedKeys.has(key)
        ) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;

      if (!hasReachablePredecessor(candidate, lastPlatforms, arcBounds)) {
        continue;
      }

      platformCandidates.push(candidate);
      for (let dx = 0; dx < platformW; dx++) {
        const ttx = tx + dx;
        placedKeys.add(tileKey(ttx, ty));
        // Platforms are solid stand-on tiles. Use the unchecked placer
        // since carveInterior already protected the corridor's free
        // cells — but a platform deliberately *is* a solid inside the
        // corridor, so temporarily lift the interior guard for it.
        if (!inSpawnSafeZone(ttx, ty) && !placedSolid.has(tileKey(ttx, ty))) {
          placedSolid.add(tileKey(ttx, ty));
          tiles.push({ tx: ttx, ty, solid: true });
        }
      }
    }

    if (platformCandidates.length > 0) {
      lastPlatforms = platformCandidates;
    }

    // ── Entities ─────────────────────────────────────────────────────
    const entities: SpawnedEntity[] = [];
    const budget = { ...SNAKE_PROFILE_TEMPLATE.entityBudget };
    const eligibleTags = SNAKE_PROFILE_TEMPLATE.allowedTags.slice();
    for (let i = eligibleTags.length - 1; i > 0; i--) {
      const j = chunkRng.int(0, i);
      const tmp = eligibleTags[i]!;
      eligibleTags[i] = eligibleTags[j]!;
      eligibleTags[j] = tmp;
    }
    const usedSpawnCells = new Set<string>();
    const SPAWN_PICK_ATTEMPTS = 8;

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

      let placed: SpawnedEntity | null = null;
      for (let attempt = 0; attempt < SPAWN_PICK_ATTEMPTS; attempt++) {
        const platform = chunkRng.pick(platformCandidates);
        const tx = platform.tx + chunkRng.int(0, platform.width - 1);
        const ty = platform.ty - 1;
        const key = `${tx},${ty}`;
        if (usedSpawnCells.has(key)) continue;
        if (inSpawnSafeZone(tx, ty)) continue;
        if (isSolid(tx, ty)) continue;
        // Entity must spawn inside the corridor interior.
        if (!interior.has(key)) continue;

        const tentativePos = { x: tx + 0.5, y: ty + 0.5 };
        let entity: Enemy | Obstacle | Buff | null = null;
        if (category === "enemy" && isEnemyTag(tag)) {
          entity = enemyRegistry[tag].factory(tentativePos);
        } else if (category === "obstacle" && isObstacleTag(tag)) {
          entity = obstacleRegistry[tag].factory(tentativePos);
        } else if (category === "buff" && isBuffTag(tag)) {
          entity = buffRegistry[tag].factory(tentativePos);
        }
        if (!entity) continue;

        const half = getEntityHalfExtents(entity);
        const finalX = tx + 0.5;
        const finalY = platform.ty - half.y;

        // Enemies only after a path-`s` distance threshold.
        if (category === "enemy" && sStart < ENEMY_SPAWN_MIN_DISTANCE) continue;

        if (aabbOverlapsSolid(finalX, finalY, half.x, half.y)) continue;

        setEntityPosition(entity, finalX, finalY);
        usedSpawnCells.add(key);
        if (category === "enemy") {
          (entity as Enemy).revealed = false;
        }
        placed = {
          kind: category,
          tag,
          position: { x: finalX, y: finalY },
          entity,
        };
        break;
      }

      if (!placed) continue;

      if (placed.kind === "enemy") budget.enemies--;
      else if (placed.kind === "obstacle") budget.obstacles--;
      else budget.buffs--;

      entities.push(placed);
    }

    const chunk: GeneratedChunk = {
      profile: {
        ...SNAKE_PROFILE_TEMPLATE,
        size: { width: CHUNK_S_LENGTH, length: CHUNK_S_LENGTH },
      },
      // For path chunks `originY` stores `sStart` and `originX` is
      // unused — the SnakeGenerator owns its own despawn pass keyed on
      // `originY`.
      originY: sStart,
      originX: 0,
      entities,
      segmentCrossedFired: false,
    };

    return { chunk, tiles, entities };
  }

  function advance(playerS: number, deathPlaneS: number): AdvanceResult {
    const newTiles: PlacedTile[] = [];
    const newEntities: SpawnedEntity[] = [];
    const despawnedEntityIds: number[] = [];
    let segmentCrossed = false;

    while (nextChunkS < playerS + LOOKAHEAD) {
      const { chunk, tiles, entities } = generateChunk();
      chunks.push(chunk);
      newTiles.push(...tiles);
      newEntities.push(...entities);
      chunk.segmentCrossedFired = true;
      segmentCrossed = true;
    }

    // Despawn chunks the death plane has fully passed.
    const despawnThreshold = deathPlaneS - GRACE_TILES;
    let i = 0;
    while (i < chunks.length) {
      const chunk = chunks[i]!;
      const chunkEndS = chunk.originY + CHUNK_S_LENGTH;
      if (chunkEndS < despawnThreshold) {
        for (const se of chunk.entities) {
          despawnedEntityIds.push(se.entity.id);
        }
        chunks.splice(i, 1);
      } else {
        i++;
      }
    }

    return { newTiles, newEntities, despawnedEntityIds, segmentCrossed };
  }

  return {
    advance,
    get chunks() {
      return chunks;
    },
    path,
  };
}
