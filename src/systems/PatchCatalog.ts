import type { Player } from "../entities/Player.js";
import type { PlayerStats } from "../entities/components/Stats.js";

/** A single patch entry in the upgrade catalog. */
export interface PatchEntry {
  /** Unique identifier (used as the stat-mod key). */
  id: string;
  /** Short display name. */
  name: string;
  /** Brief description shown in the patch picker. */
  description: string;
  /**
   * Additive stat deltas applied to the player on selection.
   * Empty for `ExtraHP` — that patch calls `player.gainContainer()` instead.
   */
  statMod: Partial<PlayerStats>;
  /**
   * Returns `true` if this patch may currently be offered.
   *
   * @param player         - The current player state.
   * @param appliedPatchIds - IDs of patches already applied this run.
   */
  isEligible(player: Player, appliedPatchIds: ReadonlySet<string>): boolean;
}

/**
 * Full patch catalog — 7 permanent upgrade options.
 * Sampled by `UpgradeSystem` when the upgrade gauge fills.
 */
export const PATCH_CATALOG: readonly PatchEntry[] = [
  {
    id: "AirJump",
    name: "Air Jump",
    description: "Gain one extra mid-air jump.",
    statMod: { maxAirJumps: 1 },
    isEligible(player) {
      const s = player.effectiveStats;
      return s.maxAirJumps + s.maxAirDashes < 2;
    },
  },
  {
    id: "AirDash",
    name: "Air Dash",
    description: "Gain one extra mid-air dash.",
    statMod: { maxAirDashes: 1 },
    isEligible(player) {
      const s = player.effectiveStats;
      return s.maxAirJumps + s.maxAirDashes < 2;
    },
  },
  {
    id: "ExtraHP",
    name: "Extra HP",
    description: "Gain one extra HP container (full).",
    statMod: {},
    isEligible(_player, appliedPatchIds) {
      return !appliedPatchIds.has("ExtraHP");
    },
  },
  {
    id: "Speed",
    name: "Speed Boost",
    description: "Increase maximum run speed.",
    statMod: { maxSpeed: 2 },
    isEligible: () => true,
  },
  {
    id: "Damage",
    name: "Power Up",
    description: "Deal more damage per hit.",
    statMod: { damageMultiplier: 0.25 },
    isEligible: () => true,
  },
  {
    id: "AttackSpeed",
    name: "Quick Strikes",
    description: "Attack animations play faster.",
    statMod: { attackSpeedMultiplier: 0.25 },
    isEligible: () => true,
  },
  {
    id: "SlowFlood",
    name: "Slow the Flood",
    description: "Reduce the death plane ascent speed.",
    statMod: { deathPlaneSpeedMultiplier: -0.2 },
    isEligible: () => true,
  },
] as const;
