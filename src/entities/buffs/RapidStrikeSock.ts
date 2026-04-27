import { Buff } from "./Buff.js";

/** Duration of the rapid-strike effect in seconds. */
const DURATION = 5;

/**
 * RapidStrikeSock — increases attack speed for `DURATION` seconds.
 *
 * Applies a positive delta to `attackSpeedMultiplier`.
 * `CombatSystem` (Phase 7+) will divide frame durations by `effectiveStats.attackSpeedMultiplier`.
 */
export class RapidStrikeSock extends Buff {
  /** Additive delta on attackSpeedMultiplier. */
  static readonly SPEED_MULT_DELTA = 0.5; // 50 % faster attacks (1.0 + 0.5 = 1.5×)

  static readonly DURATION = DURATION;

  constructor(position: { x: number; y: number }) {
    super({
      position,
      duration: DURATION,
      modKey: "RapidStrikeSock",
      statMod: { attackSpeedMultiplier: RapidStrikeSock.SPEED_MULT_DELTA },
    });
  }
}
