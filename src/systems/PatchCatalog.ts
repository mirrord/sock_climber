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
  /** Path to the patch icon sprite (relative to the site root). */
  icon: string;
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
 * Full patch catalog — 6 permanent upgrade options.
 * Sampled by `UpgradeSystem` when the upgrade gauge fills.
 */
export const PATCH_CATALOG: readonly PatchEntry[] = [
  {
    id: "AirJump",
    name: "Air Jump",
    description: "Gain one extra mid-air jump.",
    icon: "assets/sprites/jump patch.png",
    statMod: { maxAirJumps: 1 },
    isEligible(player) {
      if (player.emptyContainers < 1) return false;
      const s = player.effectiveStats;
      return s.maxAirJumps + s.maxAirDashes < 2;
    },
  },
  {
    id: "AirDash",
    name: "Air Dash",
    description: "Gain one extra mid-air dash.",
    icon: "assets/sprites/dash patch.png",
    statMod: { maxAirDashes: 1 },
    isEligible(player) {
      if (player.emptyContainers < 1) return false;
      const s = player.effectiveStats;
      return s.maxAirJumps + s.maxAirDashes < 2;
    },
  },
  {
    id: "ExtraHP",
    name: "Extra HP",
    description: "Gain one extra HP container (full).",
    icon: "assets/sprites/hp patch.png",
    statMod: {},
    isEligible(_player, appliedPatchIds) {
      return !appliedPatchIds.has("ExtraHP");
    },
  },
  {
    id: "Speed",
    name: "Speed Boost",
    description: "Increase maximum run speed.",
    icon: "assets/sprites/speed patch.png",
    statMod: { maxSpeed: 2 },
    isEligible: (player) => player.emptyContainers >= 1,
  },
  {
    id: "Damage",
    name: "Power Up",
    description: "Deal more damage per hit.",
    icon: "assets/sprites/power patch.png",
    statMod: { damageMultiplier: 0.25 },
    isEligible: (player) => player.emptyContainers >= 1,
  },
  {
    id: "AttackSpeed",
    name: "Quick Strikes",
    description: "Attack animations play faster.",
    icon: "assets/sprites/attack spatch.png",
    statMod: { attackSpeedMultiplier: 0.25 },
    isEligible: (player) => player.emptyContainers >= 1,
  },
] as const;
