// Game constants (physics, timing, limits)

/** Fixed physics timestep (seconds). */
export const FIXED_DT = 1 / 120;

/** Gravity acceleration (m/s²). Negative = downward. */
export const GRAVITY = -30;

/** Base horizontal move speed (m/s). */
export const MOVE_SPEED = 7;

/** Initial upward velocity on jump (m/s). */
export const JUMP_VELOCITY = 12;

/** Player hitbox dimensions in world units (tiles). */
export const PLAYER_W = 0.8;
export const PLAYER_H = 0.8;

// ── Tunable behaviour defaults ────────────────────────────────────────────────

/** Crouch: hitbox height multiplier. */
export const CROUCH_HEIGHT_SCALE = 0.5;

/** Wall slide: gravity scale factor while clinging to a wall. */
export const WALL_SLIDE_GRAVITY_SCALE = 0.5;

/** Wall kick: horizontal speed away from the wall (m/s). */
export const WALL_KICK_VX = 6;

/** Wall kick: upward speed on kick (m/s). Matches JUMP_VELOCITY by default. */
export const WALL_KICK_VY = 12;

/** Dash jump: horizontal speed multiplier while airborne after a dash-jump. */
export const DASH_JUMP_SPEED_SCALE = 2.0;
