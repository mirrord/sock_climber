/** Frame data for one attack type. All durations in seconds. */
export interface AttackData {
  /** Delay before the hitbox becomes active. */
  startup: number;
  /** Duration the hitbox is active. */
  active: number;
  /** Time after active before the player can act again. */
  recovery: number;
  /** Hitbox horizontal offset from entity center (multiplied by facing direction). */
  offsetX: number;
  /** Hitbox vertical offset from entity center (positive = down). */
  offsetY: number;
  halfW: number;
  halfH: number;
  /** Damage applied per hit. */
  damage: number;
  /** Knockback X velocity (signed; applied as `facing * knockbackX`). */
  knockbackX: number;
  /** Knockback Y velocity applied to the target (negative = upward). */
  knockbackY: number;
  /**
   * During active frames, multiply the player's downward velocity by this factor.
   * Only set for aerial-crouch attacks; `undefined` = no damp.
   */
  aerialCrouchDamp?: number;
  /**
   * When `true`, the hitbox damages targets on both sides of the player and
   * the horizontal knockback is applied per-target away from the player
   * (sign of `target.x - player.x`) instead of in the facing direction.
   * The player's reactive horizontal recoil is also suppressed since the
   * attack has no single direction.
   */
  bothSides?: boolean;
}

/** Total duration of an attack in seconds. */
export function attackDuration(data: AttackData): number {
  return data.startup + data.active + data.recovery;
}

/**
 * Attack frame-data catalogue.
 * Keys match the `attackId` strings used by `CombatSystem`.
 */
export const ATTACK_TABLE: Readonly<Record<string, AttackData>> = {
  /** Standard grounded or aerial punch/kick. */
  Normal: {
    startup: 1 / 60, //  ~1 frame  at 60 fps
    active: 5 / 60, //  ~5 frames at 60 fps
    recovery: 6 / 60, //  ~6 frames at 60 fps
    offsetX: 0.5,
    offsetY: 0,
    halfW: 0.5,
    halfH: 0.4,
    damage: 1,
    knockbackX: 4,
    knockbackY: -2,
  },
  /** Aerial crouch — wide horizontal sweep that hits enemies on both sides; damps descent during active frames. */
  AerialCrouch: {
    startup: 1 / 60,
    active: 5 / 60,
    recovery: 6 / 60,
    offsetX: 0,
    offsetY: 0.1,
    // Sprite is 80×33 px (≈1.25 × 0.5 world units). Hitbox roughly matches
    // the visible sweep so enemies flanking the player on either side are
    // caught by a single AABB test.
    halfW: 0.625,
    halfH: 0.4,
    damage: 1,
    knockbackX: 3,
    knockbackY: -1,
    aerialCrouchDamp: 0.1, // reduce descent speed to 10% during active frames
    bothSides: true,
  },
} as const;
