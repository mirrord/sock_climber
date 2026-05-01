/** Tunable player parameters — the single source of truth for all feel values. */
export interface PlayerStats {
  /** Base gravity in m/s² (positive = downward). */
  gravity: number;
  /** Reduced gravity applied during wall slide in m/s². */
  wallSlideGravity: number;
  /** Terminal fall speed in m/s. */
  maxFallSpeed: number;
  /** Maximum horizontal run speed in m/s. */
  maxSpeed: number;
  /** Horizontal acceleration on the ground in m/s². */
  groundAccel: number;
  /** Horizontal acceleration in the air in m/s². */
  airAccel: number;
  /** Initial vertical velocity on jump (negative = upward) in m/s. */
  jumpVelocity: number;
  /** Multiplier applied to upward velocity when Jump is released early (variable height). */
  jumpCutMultiplier: number;
  /** Coyote-time window after leaving the ground in seconds (~6 frames at 60 fps). */
  coyoteTime: number;
  /** Jump buffer window for pre-landing jumps in seconds (~6 frames at 60 fps). */
  jumpBufferTime: number;
  /** Dash travel distance in meters. */
  dashDistance: number;
  /** Dash duration in seconds. */
  dashDuration: number;
  /** Cooldown before another dash in seconds. */
  dashCooldown: number;
  /** Whether dashing grants i-frames. */
  dashIFrames: boolean;
  /** Horizontal speed of wall kick in m/s (directed away from the wall). */
  wallKickVX: number;
  /** Vertical speed of wall kick in m/s (negative = upward). */
  wallKickVY: number;
  /** Duration of horizontal-input lockout after wall kick in seconds. */
  wallKickLockDuration: number;
  /** Spring-charge rate: charge-per-second on the 0–1 scale. */
  springChargeRate: number;
  /** Maximum impulse magnitude on spring release in m/s. */
  springMaxImpulse: number;
  /** Seconds of Crouch held before transitioning to "lay flat" state. */
  crouchHoldThreshold: number;
  /** Half-height of the body in standing posture in meters. */
  standHalfH: number;
  /** Half-height of the body in crouched posture in meters. */
  crouchHalfH: number;
  /** Half-width of the body in meters. */
  halfW: number;
  /** Mid-air jumps allowed per airborne phase (upgradeable). */
  maxAirJumps: number;
  /** Mid-air dashes allowed per airborne phase (upgradeable). */
  maxAirDashes: number;
  /** I-frame duration on taking a hit in seconds. */
  iFrameDuration: number;
  /** HP containers at spawn. */
  maxHealth: number;
  /** Multiplier for damage dealt (1.0 = normal). Read by CombatSystem. */
  damageMultiplier: number;
  /** Multiplier for attack speed (1.0 = normal; >1 = faster). Read by CombatSystem. */
  attackSpeedMultiplier: number;
  /** Multiplier for death-plane ascent speed (1.0 = normal; <1 = slower). Read by DeathPlaneSystem. */
  deathPlaneSpeedMultiplier: number;
}

/** Default tuned stats for the base player. */
export const DEFAULT_PLAYER_STATS: PlayerStats = {
  gravity: 30,
  wallSlideGravity: 5,
  maxFallSpeed: 30,
  maxSpeed: 8,
  // groundAccel * DT(1/120) = 1000/120 ≈ 8.33 ≥ maxSpeed → instant feel within one step.
  groundAccel: 1000,
  airAccel: 1000,
  jumpVelocity: -15,
  jumpCutMultiplier: 0.5,
  coyoteTime: 6 / 60, // ~6 frames at 60 fps
  jumpBufferTime: 6 / 60,
  dashDistance: 4,
  dashDuration: 0.15,
  dashCooldown: 0.5,
  dashIFrames: false,
  wallKickVX: 8,
  wallKickVY: -12,
  wallKickLockDuration: 6 / 60, // ~6 frames at 60 fps
  springChargeRate: 2.0,
  springMaxImpulse: 20,
  crouchHoldThreshold: 0.3,
  standHalfH: 0.625,
  crouchHalfH: 0.375,
  halfW: 0.5,
  maxAirJumps: 0,
  maxAirDashes: 0,
  iFrameDuration: 1,
  maxHealth: 3,
  damageMultiplier: 1,
  attackSpeedMultiplier: 1,
  deathPlaneSpeedMultiplier: 1,
};
