import { Buff } from "./Buff.js";
import { DEFAULT_PLAYER_STATS } from "../components/Stats.js";

/** Duration of the low-gravity effect in seconds. */
const DURATION = 8;

/**
 * LowGravitySock — reduces player gravity for `DURATION` seconds.
 * Gravity is reduced by `GRAVITY_DELTA` (negative additive delta).
 */
export class LowGravitySock extends Buff {
  /** Gravity delta applied (m/s²). Negative = less gravity. */
  static readonly GRAVITY_DELTA = -(DEFAULT_PLAYER_STATS.gravity * 0.6); // −18 m/s²

  static readonly DURATION = DURATION;

  constructor(position: { x: number; y: number }) {
    super({
      position,
      duration: DURATION,
      modKey: "LowGravitySock",
      statMod: { gravity: LowGravitySock.GRAVITY_DELTA },
    });
  }
}
