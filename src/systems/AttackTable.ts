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
  /** Aerial crouch — hitbox extends below; damps descent during active frames. */
  AerialCrouch: {
    startup: 1 / 60,
    active: 5 / 60,
    recovery: 6 / 60,
    offsetX: 0,
    offsetY: 0.5, // below player
    halfW: 0.4,
    halfH: 0.5,
    damage: 1,
    knockbackX: 0,
    knockbackY: 2, // downward knockback on target
    aerialCrouchDamp: 0.1, // reduce descent speed to 10% during active frames
  },
} as const;
