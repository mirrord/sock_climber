import { Buff } from "./Buff.js";

/** Duration of the Softener charge in seconds. */
const DURATION = 8;

/**
 * SoftenerBuff — "dryer sheet" pickup. Grants the player a one-shot
 * dryer-sheet projectile fired by their next melee attack.
 *
 * The pickup uses an empty `statMod` because the effect isn't a stat
 * modifier — it's a flag. The main loop checks
 * `player.hasStatMod("Softener")` (via the public `_statMods` API on
 * Player) when an attack starts; if set, it spawns a `DryerSheet`
 * projectile and removes the mod so the charge is consumed.
 *
 * If the player never attacks, the timer expires and the charge is
 * lost like any other temporary buff.
 */
export class SoftenerBuff extends Buff {
  static readonly DURATION = DURATION;

  constructor(position: { x: number; y: number }) {
    super({
      position,
      duration: DURATION,
      modKey: "Softener",
      // No stat delta; the Softener charge is a presence flag.
      statMod: {},
    });
  }
}
