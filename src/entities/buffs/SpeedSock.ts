import { Buff } from "./Buff.js";

/** Duration of the speed effect in seconds. */
const DURATION = 6;

/**
 * SpeedSock — increases horizontal max speed for `DURATION` seconds.
 */
export class SpeedSock extends Buff {
  /** Additive maxSpeed delta in m/s. */
  static readonly SPEED_DELTA = 4;

  static readonly DURATION = DURATION;

  constructor(position: { x: number; y: number }) {
    super({
      position,
      duration: DURATION,
      modKey: "SpeedSock",
      statMod: { maxSpeed: SpeedSock.SPEED_DELTA },
    });
  }
}
