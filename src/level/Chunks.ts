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

/** Wide open shaft — every 3-row band gets a wall bump that alternates
 *  side and depth so no row is completely bare on both sides. */
const OPEN_WIDE: ChunkProfile = {
  id: "open_wide_a",
  kind: "open",
  size: { length: 16, width: 12 },
  wallProfile: (t) => {
    const row = Math.floor(t * 16);
    const band = Math.floor(row / 3);
    // Depth alternates 2 / 3 tiles; side alternates left / right.
    const depth = 2 + (band % 2);
    if (band % 2 === 0) {
      return { left: depth, right: 11 };
    } else {
      return { left: 1, right: 12 - depth };
    }
  },
  platformDensity: 0.65,
  entityBudget: { enemies: 3, obstacles: 2, buffs: 1 },
  allowedTags: ["Keys", "Phone", "Gum", "SpeedSock", "HighJumpSock"],
};

/** Wavy walls — sinusoidal left/right walls at opposite phase so both
 *  sides are always textured and the corridor width undulates gently. */
const OPEN_WAVY: ChunkProfile = {
  id: "open_wavy_c",
  kind: "open",
  size: { length: 18, width: 12 },
  wallProfile: (t) => {
    // 1.5 full sine cycles over the chunk length; opposite phase per side.
    const angle = t * Math.PI * 3;
    const leftDepth = 1 + Math.round(1.5 + 1.5 * Math.sin(angle));
    const rightDepth = 1 + Math.round(1.5 + 1.5 * Math.sin(angle + Math.PI));
    return {
      left: Math.min(leftDepth, 4),
      right: 12 - Math.min(rightDepth, 4),
    };
  },
  platformDensity: 0.62,
  entityBudget: { enemies: 2, obstacles: 2, buffs: 1 },
  allowedTags: ["Wallet", "Keys", "Gum", "LowGravitySock", "SpeedSock"],
};

/** Narrowing corridor — bumps every 2 rows (both sides always active)
 *  with a gentle overall squeeze toward the middle of the chunk. */
const OPEN_NARROWING: ChunkProfile = {
  id: "open_narrowing_b",
  kind: "open",
  size: { length: 16, width: 12 },
  wallProfile: (t) => {
    const squeeze = Math.floor(t * 2); // 0 at top, 1 near bottom
    const row = Math.floor(t * 16);
    // Both sides always have at least 1 tile; bump depth alternates 1/2.
    const bump = row % 2 === 0 ? 2 : 1;
    const flip = Math.floor(row / 2) % 2;
    const left = squeeze + (flip === 0 ? bump : 1);
    const right = 12 - squeeze - (flip === 1 ? bump : 1);
    return { left, right };
  },
  platformDensity: 0.65,
  entityBudget: { enemies: 3, obstacles: 2, buffs: 1 },
  allowedTags: ["Wallet", "Lipstick", "DustBunny", "LowGravitySock", "PowerSock"],
};

/** Tight zigzag — both walls are always active: one side has a deep
 *  bulge while the opposite side has a shallow jab, alternating each row. */
const TIGHT_ZIGZAG: ChunkProfile = {
  id: "tight_zigzag_a",
  kind: "tight",
  size: { length: 12, width: 10 },
  wallProfile: (t) => {
    const row = Math.floor(t * 12);
    // Alternate: even rows = big left bulge + small right jab; odd = inverse.
    const mainBulge = row % 2 === 0 ? 4 : 1;
    const counterJab = row % 2 === 0 ? 1 : 3;
    return { left: 1 + mainBulge, right: 9 - counterJab };
  },
  platformDensity: 0.60,
  entityBudget: { enemies: 3, obstacles: 2, buffs: 0 },
  allowedTags: ["Headphones", "Keys", "Wallet", "Lighter", "Pen"],
};

/** Tight pillared — banded staircase: wall depth steps 2→3→2 every
 *  3 rows so the corridor has visible texture rather than flat sides. */
const TIGHT_PILLARED: ChunkProfile = {
  id: "tight_pillared_b",
  kind: "tight",
  size: { length: 12, width: 10 },
  wallProfile: (t) => {
    const row = Math.floor(t * 12);
    const band = Math.floor(row / 3) % 3; // 0, 1, 2
    const extra = band === 1 ? 1 : 0;
    return { left: 2 + extra, right: 8 - extra };
  },
  platformDensity: 0.65,
  entityBudget: { enemies: 3, obstacles: 3, buffs: 1 },
  allowedTags: ["Phone", "Lipstick", "Headphones", "Gum", "SlowFloodSock", "RapidStrikeSock"],
};

/** Tight stepped — left wall advances in two distinct strides then
 *  retreats; right wall throws small periodic jabs from the other side. */
const TIGHT_STEPPED: ChunkProfile = {
  id: "tight_stepped_c",
  kind: "tight",
  size: { length: 14, width: 10 },
  wallProfile: (t) => {
    const row = Math.floor(t * 14);
    const leftStep = row < 5 ? 2 : row < 10 ? 4 : 2;
    const rightJab = row % 3 === 1 ? 2 : 0;
    return { left: leftStep, right: 9 - rightJab };
  },
  platformDensity: 0.62,
  entityBudget: { enemies: 3, obstacles: 2, buffs: 1 },
  allowedTags: ["Keys", "Wallet", "Pen", "Lighter", "HighJumpSock", "RapidStrikeSock"],
};

/** All built-in profiles exported for use by the generator. */
export const CHUNK_PROFILES: readonly ChunkProfile[] = [
  OPEN_WIDE,
  OPEN_WAVY,
  OPEN_NARROWING,
  TIGHT_ZIGZAG,
  TIGHT_PILLARED,
  TIGHT_STEPPED,
];

/** Profiles by kind for easy filtering. */
export const OPEN_PROFILES = CHUNK_PROFILES.filter((p) => p.kind === "open");
export const TIGHT_PROFILES = CHUNK_PROFILES.filter((p) => p.kind === "tight");
