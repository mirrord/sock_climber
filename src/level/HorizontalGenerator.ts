/**
 * Procedural generator for level 2 ("The Sock Drawer") — a long horizontal
 * corridor that the player climbs rightward (+X). Mirrors the public API
 * of {@link createGenerator} (`advance` + `chunks`) so callers can swap
 * implementations purely on the configured climb direction.
 *
 * The level is conceptually a 12-tile-tall horizontal tunnel: the floor at
 * world y = 2 and the ceiling at y = WORLD_Y_MIN are always solid (placed
 * by `seedWorldBoundary` in `main.ts`), and the generator produces chunks
 * that fill the interior with vertical pillars (anchored to floor or
 * ceiling) and short horizontal standable platforms at varying heights.
 * Reachability between successive platforms is checked using the same
 * jump-arc bounds as level 1.
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
import { poissonSample } from "./Sampler.js";
import type { PlayerStats } from "../entities/components/Stats.js";
import { DEFAULT_PLAYER_STATS } from "../entities/components/Stats.js";
import type {
  AdvanceResult,
  GeneratedChunk,
  GeneratorOptions,
  PlacedTile,
  SpawnedEntity,
  Generator,
} from "./Generator.js";

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

/**
 * Synthetic chunk profile used for horizontal chunks. The level-1
 * `GeneratedChunk.profile` field is read by some downstream consumers
 * (e.g. SpawnSystem segment-cross telemetry); a placeholder lets us
 * satisfy the type without inventing a new chunk-data system.
 */
const HORIZONTAL_PROFILE_TEMPLATE: Omit<ChunkProfile, "size"> = {
  id: "horizontal-corridor",
  kind: "open",
  platformDensity: 0.4,
  // Horizontal chunks emit no wall-profile slices; this stub never runs.
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

/**
 * Build a horizontal-climb generator. Public API identical to
 * {@link createGenerator}: `advance(cameraX, deathPlaneX)` returns the
 * tiles/entities placed since the last call (interpreting both arguments
 * as world-tile X coordinates) and despawns chunks the death wall has
 * passed.
 */
export function createHorizontalGenerator(opts: GeneratorOptions): Generator {
  const LOOKAHEAD = opts.lookahead ?? 80;
  const GRACE_TILES = opts.graceRows ?? 8;
  const SPAWN_SAFE_ZONE = opts.spawnSafeZone;
  const ENEMY_SPAWN_MIN_DISTANCE = opts.enemySpawnMinHeight ?? 30;
  // Vertical bounds of the corridor in world tile coords.
  // The floor row sits at FLOOR_Y; the ceiling row at CEILING_Y; the
  // open interior is the inclusive range [CEILING_Y + 1, FLOOR_Y - 1].
  const FLOOR_Y = 2;
  const CEILING_Y = (opts.worldYMin ?? -9) + 1; // +1 leaves the WORLD_Y_MIN row as buffer
  const INTERIOR_TOP = CEILING_Y + 1;
  const INTERIOR_BOTTOM = FLOOR_Y - 1;
  const INTERIOR_HEIGHT = INTERIOR_BOTTOM - INTERIOR_TOP + 1;

  function inSpawnSafeZone(tx: number, ty: number): boolean {
    const z = SPAWN_SAFE_ZONE;
    if (!z) return false;
    return tx >= z.minTx && tx <= z.maxTx && ty >= z.minTy && ty <= z.maxTy;
  }

  const placedSolid = new Set<string>();
  const tileKey = (tx: number, ty: number): string => `${tx},${ty}`;
  const isSolid = (tx: number, ty: number): boolean =>
    placedSolid.has(tileKey(tx, ty));

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

  function tryPlaceSolid(tx: number, ty: number, out: PlacedTile[]): boolean {
    if (inSpawnSafeZone(tx, ty)) return false;
    const k = tileKey(tx, ty);
    if (placedSolid.has(k)) return true;
    if (wouldCreatePinch(tx, ty)) return false;
    placedSolid.add(k);
    out.push({ tx, ty, solid: true });
    return true;
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

  const chunks: GeneratedChunk[] = [];

  /**
   * World tile-X of the leading edge of the most recently placed chunk.
   * The next chunk will start exactly here. Begins a few tiles right of
   * the spawn so the spawn safe zone stays empty.
   */
  let nextChunkLeadingX = 8;

  // Reachability seed: the floor row is one giant standable platform.
  // Width spans the spawn area on the floor.
  let lastPlatforms: PlatformCandidate[] = [
    { tx: 0, ty: FLOOR_Y, width: nextChunkLeadingX },
  ];

  function generateChunk(): {
    chunk: GeneratedChunk;
    tiles: PlacedTile[];
    entities: SpawnedEntity[];
  } {
    // Each chunk covers a random horizontal span. Mirrors level-1's
    // 16–28-row chunks but along world X.
    const chunkLen = rng.int(16, 28);
    const chunkOriginX = nextChunkLeadingX;
    nextChunkLeadingX = chunkOriginX + chunkLen;

    const chunkRng = rng.clone();
    rng.next();

    const tiles: PlacedTile[] = [];

    // ── Pillars ────────────────────────────────────────────────────────────
    // Random vertical solid columns anchored to floor or ceiling. They
    // partially obstruct the corridor without sealing it (heights capped
    // so the player can always jump over and dash under).
    const pillarCount = chunkRng.int(1, Math.max(1, Math.floor(chunkLen / 6)));
    const usedColumns = new Set<number>();
    for (let p = 0; p < pillarCount; p++) {
      const localX = chunkRng.int(2, chunkLen - 3);
      if (usedColumns.has(localX)) continue;
      usedColumns.add(localX);
      const worldX = chunkOriginX + localX;

      const fromFloor = chunkRng.next() < 0.6;
      // Cap so pillars never seal the corridor (max ~half its height).
      const maxH = Math.max(2, Math.floor(INTERIOR_HEIGHT / 2));
      const h = chunkRng.int(1, maxH);

      if (fromFloor) {
        // Solid column extending upward from just above the floor.
        for (let i = 0; i < h; i++) {
          tryPlaceSolid(worldX, FLOOR_Y - 1 - i, tiles);
        }
      } else {
        // Stalactite extending downward from just below the ceiling.
        for (let i = 0; i < h; i++) {
          tryPlaceSolid(worldX, CEILING_Y + 1 + i, tiles);
        }
      }
    }

    // ── Floor mounds & ceiling drops ────────────────────────────────────
    // Multi-tile-wide bumps anchored to the floor (and inverted lumps
    // hanging from the ceiling) that give the corridor real terrain
    // variation rather than a flat tunnel with sparse pillars.
    //
    // Mounds are short stepped rectangles: a base row spanning `mw`
    // tiles, plus optional narrower rows stacked on top. Heights are
    // capped well below the corridor mid-line so the player can always
    // jump over them, and a min-spacing rule prevents adjacent mounds
    // from forming a wall.
    //
    // Each mound also appends its top row as a `PlatformCandidate` so
    // the next chunk's reachability seed includes them and platforms
    // can be placed over the mound.
    const MAX_TERRAIN_H = Math.max(2, Math.floor(INTERIOR_HEIGHT / 2) - 1);
    const moundCount = chunkRng.int(1, Math.max(1, Math.floor(chunkLen / 5)));
    const usedFloorRanges: Array<[number, number]> = [];
    const usedCeilRanges: Array<[number, number]> = [];

    function rangesOverlap(
      ranges: Array<[number, number]>,
      lo: number,
      hi: number,
      pad: number,
    ): boolean {
      for (const [a, b] of ranges) {
        if (hi + pad >= a && lo - pad <= b) return true;
      }
      return false;
    }

    const moundCandidates: PlatformCandidate[] = [];

    for (let m = 0; m < moundCount; m++) {
      const fromFloor = chunkRng.next() < 0.65;
      const mw = chunkRng.int(2, 5);
      const localX = chunkRng.int(0, Math.max(0, chunkLen - mw));
      const worldXStart = chunkOriginX + localX;
      const worldXEnd = worldXStart + mw - 1;

      const ranges = fromFloor ? usedFloorRanges : usedCeilRanges;
      // Require ≥2 empty tiles between mounds on the same surface so
      // the player can run between them.
      if (rangesOverlap(ranges, worldXStart, worldXEnd, 2)) continue;

      const baseH = chunkRng.int(1, MAX_TERRAIN_H);
      // Stepped profile: each row above the base shrinks by 0..2 tiles
      // (left + right). Stops once the row would have <1 tile.
      let leftEdge = worldXStart;
      let rightEdge = worldXEnd;
      let topRowY = fromFloor ? FLOOR_Y - 1 : CEILING_Y + 1;

      for (let row = 0; row < baseH; row++) {
        const rowY = fromFloor ? FLOOR_Y - 1 - row : CEILING_Y + 1 + row;
        for (let x = leftEdge; x <= rightEdge; x++) {
          tryPlaceSolid(x, rowY, tiles);
        }
        topRowY = rowY;
        if (row + 1 < baseH) {
          const shrinkL = chunkRng.int(0, 1);
          const shrinkR = chunkRng.int(0, 1);
          leftEdge += shrinkL;
          rightEdge -= shrinkR;
          if (rightEdge < leftEdge) break;
        }
      }

      ranges.push([worldXStart, worldXEnd]);

      if (fromFloor && rightEdge >= leftEdge) {
        // Top of the mound is standable — register it as a platform
        // candidate so reachability and entity placement can use it.
        moundCandidates.push({
          tx: leftEdge,
          ty: topRowY,
          width: rightEdge - leftEdge + 1,
        });
      }
    }

    // ── Standable platforms ─────────────────────────────────────────────────
    // Sample candidate (lx, ly) in chunk-local space and place 2–3 tile
    // wide horizontal platforms that pass the reachability check.
    const platformCandidates: PlatformCandidate[] = [];
    const platformSamples = poissonSample(chunkRng, {
      width: chunkLen,
      height: INTERIOR_HEIGHT,
      minDist: 4,
      density: HORIZONTAL_PROFILE_TEMPLATE.platformDensity,
    });

    const usedRowsAtX = new Set<string>();

    for (const sample of platformSamples) {
      const localX = sample.tx;
      const localY = sample.ty;
      const worldTy = INTERIOR_TOP + localY;
      const platformW = chunkRng.int(2, 3);
      const worldTx = chunkOriginX + localX;
      if (worldTx + platformW > chunkOriginX + chunkLen) continue;

      // De-duplicate by (worldTy, leftmost worldTx) so we don't stack
      // multiple proposed platforms on the same row at the same start.
      const dedupeKey = `${worldTy}@${worldTx}`;
      if (usedRowsAtX.has(dedupeKey)) continue;

      const candidate: PlatformCandidate = {
        tx: worldTx,
        ty: worldTy,
        width: platformW,
      };

      // Mound tops in the current chunk count as predecessors too —
      // a tall mound can be a stepping stone to a higher platform.
      const predecessors =
        moundCandidates.length > 0
          ? [...lastPlatforms, ...moundCandidates]
          : lastPlatforms;
      if (!hasReachablePredecessor(candidate, predecessors, arcBounds)) {
        continue;
      }

      // Reject the entire platform if any of its tiles would land in the
      // spawn safe zone or pinch against an existing solid.
      let blocked = false;
      for (let x = 0; x < platformW; x++) {
        const ttx = worldTx + x;
        if (inSpawnSafeZone(ttx, worldTy) || wouldCreatePinch(ttx, worldTy)) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;

      usedRowsAtX.add(dedupeKey);
      platformCandidates.push(candidate);

      for (let x = 0; x < platformW; x++) {
        tryPlaceSolid(worldTx + x, worldTy, tiles);
      }
    }

    // Force at least one stepping stone in the middle of the chunk if
    // nothing else placed, so the reachability seed for the next chunk is
    // never lost.
    if (platformCandidates.length === 0) {
      const localX = Math.floor(chunkLen / 2);
      const worldTy = INTERIOR_TOP + Math.floor(INTERIOR_HEIGHT / 2);
      const worldTx = chunkOriginX + localX;
      const platformW = 2;
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

    if (platformCandidates.length > 0) {
      lastPlatforms = platformCandidates;
    } else if (moundCandidates.length > 0) {
      // Mound tops are standable too — fall back to them as the
      // reachability seed if no thin platforms got placed.
      lastPlatforms = moundCandidates;
    }

    // ── Entities ────────────────────────────────────────────────────────────
    const entities: SpawnedEntity[] = [];

    const budget = { ...HORIZONTAL_PROFILE_TEMPLATE.entityBudget };
    const eligibleTags = HORIZONTAL_PROFILE_TEMPLATE.allowedTags.slice();

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

        // Enemy-spawn min distance: enemies may only spawn after the
        // player has climbed at least this far rightward.
        if (category === "enemy" && finalX < ENEMY_SPAWN_MIN_DISTANCE) continue;

        // Reject if entity AABB pokes outside this chunk's X span — the
        // next chunk's content isn't yet placed and might overlap.
        const EPS = 1e-3;
        const aabbMaxTx = Math.floor(finalX + half.x - EPS);
        if (aabbMaxTx >= chunkOriginX + chunkLen) continue;

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
        ...HORIZONTAL_PROFILE_TEMPLATE,
        size: { width: chunkLen, length: chunkLen },
      },
      // For horizontal chunks `originY` is unused (corridor spans the whole
      // vertical extent every chunk). `originX` is the leftmost world tile-X.
      originY: INTERIOR_TOP,
      originX: chunkOriginX,
      entities,
      segmentCrossedFired: false,
    };

    return { chunk, tiles, entities };
  }

  function advance(cameraX: number, deathPlaneX: number): AdvanceResult {
    const newTiles: PlacedTile[] = [];
    const newEntities: SpawnedEntity[] = [];
    const despawnedEntityIds: number[] = [];
    let segmentCrossed = false;

    // Generate ahead of the camera (rightward).
    while (nextChunkLeadingX < cameraX + LOOKAHEAD) {
      const { chunk, tiles, entities } = generateChunk();
      chunks.push(chunk);
      newTiles.push(...tiles);
      newEntities.push(...entities);
      chunk.segmentCrossedFired = true;
      segmentCrossed = true;
    }

    // Despawn chunks the death wall has passed (on its left). A chunk is
    // gone once its rightmost tile is at least GRACE_TILES behind the
    // wall.
    const despawnThreshold = deathPlaneX - GRACE_TILES;
    let i = 0;
    while (i < chunks.length) {
      const chunk = chunks[i]!;
      const chunkRightX = chunk.originX + chunk.profile.size.length;
      if (chunkRightX < despawnThreshold) {
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

  return { advance, chunks };
}
