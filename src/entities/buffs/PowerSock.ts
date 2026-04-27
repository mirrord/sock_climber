import { Buff } from "./Buff.js";

/** Duration of the power effect in seconds. */
const DURATION = 6;

/**
 * PowerSock — increases damage dealt for `DURATION` seconds.
 *
 * Applies a positive delta to `damageMultiplier`.
 * `CombatSystem` (Phase 7+) will multiply hit damage by `effectiveStats.damageMultiplier`.
 */
export class PowerSock extends Buff {
  /** Additive delta on damageMultiplier. */
  static readonly DAMAGE_MULT_DELTA = 1; // doubles damage (1.0 base + 1.0 = 2×)

  static readonly DURATION = DURATION;

  constructor(position: { x: number; y: number }) {
    super({
      position,
      duration: DURATION,
      modKey: "PowerSock",
      statMod: { damageMultiplier: PowerSock.DAMAGE_MULT_DELTA },
    });
  }
}
