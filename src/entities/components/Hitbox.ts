/** A rectangular hitbox relative to an entity's center. Used for attack/hurt-box queries. */
export interface Hitbox {
  /** Horizontal offset from entity center; positive = right. */
  offsetX: number;
  /** Vertical offset from entity center; positive = down. */
  offsetY: number;
  halfW: number;
  halfH: number;
  /** Whether this hitbox is currently active for collision queries. */
  active: boolean;
  /** Damage dealt on contact. */
  damage: number;
  /** Knockback X velocity applied to the target on hit. */
  knockbackX: number;
  /** Knockback Y velocity applied to the target on hit (negative = upward). */
  knockbackY: number;
}

/**
 * Creates a Hitbox with the given geometry.
 */
export function createHitbox(
  offsetX: number,
  offsetY: number,
  halfW: number,
  halfH: number,
  damage = 1,
  knockbackX = 0,
  knockbackY = 0,
): Hitbox {
  return { offsetX, offsetY, halfW, halfH, active: false, damage, knockbackX, knockbackY };
}
