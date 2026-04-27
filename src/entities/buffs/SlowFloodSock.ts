import { Buff } from "./Buff.js";

/** Duration of the slow-flood effect in seconds. */
const DURATION = 10;

/**
 * SlowFloodSock — temporarily slows the death-plane ascent speed.
 *
 * Applies a negative delta to `deathPlaneSpeedMultiplier` so the flood
 * rises more slowly, giving the player extra time.
 */
export class SlowFloodSock extends Buff {
  /** Additive delta on deathPlaneSpeedMultiplier (negative = slower flood). */
  static readonly FLOOD_DELTA = -0.4;

  static readonly DURATION = DURATION;

  constructor(position: { x: number; y: number }) {
    super({
      position,
      duration: DURATION,
      modKey: "SlowFloodSock",
      statMod: { deathPlaneSpeedMultiplier: SlowFloodSock.FLOOD_DELTA },
    });
  }
}
