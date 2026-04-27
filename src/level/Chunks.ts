import type { EnemyTag } from "../entities/enemies/EnemyRegistry.js";
import type { ObstacleTag } from "../entities/obstacles/ObstacleRegistry.js";
import type { BuffTag } from "../entities/buffs/BuffRegistry.js";

/** All entity tags that can appear in a chunk. */
export type EntityTag = EnemyTag | ObstacleTag | BuffTag;

/**
 * Budget of how many of each entity type may spawn per chunk.
 * A value of 0 means that category is disabled for this profile.
 */
export interface EntityBudget {
  enemies: number;
  obstacles: number;
  buffs: number;
}

/**
 * Corridor cross-section at a given normalised position along the chunk.
 * `left` and `right` are tile offsets from the left edge of the chunk.
 * The open corridor is between left and right (exclusive).
 */
export interface WallSlice {
  left: number;
  right: number;
}

/**
 * Profile that controls the shape and density of a procedurally generated chunk.
 *
 * All tile coordinates within a chunk are relative to the chunk origin.
 * X grows rightward (horizontal), Y grows downward (vertical; +Y = toward death plane).
 * The open direction the player is climbing is -Y (upward).
 *
 * length — number of tile rows (in Y).
 * width  — total tile columns (in X).
 */
export interface ChunkProfile {
  /** Unique identifier. */
  id: string;
  /** Broad category used by the generator to vary pacing. */
  kind: "open" | "tight";
  /** Chunk size in tiles. */
  size: { length: number; width: number };
  /**
   * Returns the wall cross-section at normalised position t ∈ [0, 1].
   * left/right are zero-based tile columns; the corridor is [left, right).
   */
  wallProfile: (t: number) => WallSlice;
  /** 0–1 probability that a given platform candidate is accepted. */
  platformDensity: number;
  /** Maximum number of each entity category that may be placed. */
  entityBudget: EntityBudget;
  /** Which entity tags are eligible for placement in this profile. */
  allowedTags: readonly EntityTag[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Built-in profiles
// ─────────────────────────────────────────────────────────────────────────────

/** Wide open shaft — few platforms, gentle walls, sparse enemies. */
const OPEN_WIDE: ChunkProfile = {
  id: "open_wide_a",
  kind: "open",
  size: { length: 16, width: 12 },
  wallProfile: (_t) => ({ left: 1, right: 11 }),
  platformDensity: 0.35,
  entityBudget: { enemies: 2, obstacles: 1, buffs: 1 },
  allowedTags: ["Keys", "Phone", "Gum", "SpeedSock", "HighJumpSock"],
};

/** Slightly narrowing corridor variant. */
const OPEN_NARROWING: ChunkProfile = {
  id: "open_narrowing_b",
  kind: "open",
  size: { length: 16, width: 12 },
  wallProfile: (t) => {
    const squeeze = Math.floor(t * 1.5);
    return { left: squeeze, right: 12 - squeeze };
  },
  platformDensity: 0.4,
  entityBudget: { enemies: 2, obstacles: 2, buffs: 1 },
  allowedTags: ["Wallet", "Lipstick", "DustBunny", "LowGravitySock", "PowerSock"],
};

/** Tight zigzag — alternating wall protrusions, dense platforms, heavy enemies. */
const TIGHT_ZIGZAG: ChunkProfile = {
  id: "tight_zigzag_a",
  kind: "tight",
  size: { length: 12, width: 10 },
  wallProfile: (t) => {
    const row = Math.floor(t * 12);
    const bulge = row % 2 === 0 ? 3 : 0;
    return { left: 1 + bulge, right: 9 - (2 - bulge) };
  },
  platformDensity: 0.55,
  entityBudget: { enemies: 3, obstacles: 2, buffs: 0 },
  allowedTags: ["Headphones", "Keys", "Wallet", "Lighter", "Pen"],
};

/** Tight pillared — central pillar gaps the player must navigate. */
const TIGHT_PILLARED: ChunkProfile = {
  id: "tight_pillared_b",
  kind: "tight",
  size: { length: 12, width: 10 },
  wallProfile: (_t) => ({ left: 2, right: 8 }),
  platformDensity: 0.6,
  entityBudget: { enemies: 3, obstacles: 3, buffs: 1 },
  allowedTags: ["Phone", "Lipstick", "Headphones", "Gum", "SlowFloodSock", "RapidStrikeSock"],
};

/** All built-in profiles exported for use by the generator. */
export const CHUNK_PROFILES: readonly ChunkProfile[] = [
  OPEN_WIDE,
  OPEN_NARROWING,
  TIGHT_ZIGZAG,
  TIGHT_PILLARED,
];

/** Profiles by kind for easy filtering. */
export const OPEN_PROFILES = CHUNK_PROFILES.filter((p) => p.kind === "open");
export const TIGHT_PROFILES = CHUNK_PROFILES.filter((p) => p.kind === "tight");
