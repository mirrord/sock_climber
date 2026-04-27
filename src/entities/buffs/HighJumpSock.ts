import { Buff } from "./Buff.js";
import { DEFAULT_PLAYER_STATS } from "../components/Stats.js";

/** Duration of the high-jump effect in seconds. */
const DURATION = 7;

/**
 * HighJumpSock — increases jump height for `DURATION` seconds.
 *
 * `jumpVelocity` is negative (upward), so a negative delta increases the
 * magnitude, giving a higher jump.
 */
export class HighJumpSock extends Buff {
  /** Additive jumpVelocity delta in m/s (negative = higher jump). */
  static readonly JUMP_DELTA = DEFAULT_PLAYER_STATS.jumpVelocity * 0.4; // ≈ −6 m/s

  static readonly DURATION = DURATION;

  constructor(position: { x: number; y: number }) {
    super({
      position,
      duration: DURATION,
      modKey: "HighJumpSock",
      statMod: { jumpVelocity: HighJumpSock.JUMP_DELTA },
    });
  }
}
