/** All player state identifiers. */
export const STATE = Object.freeze({
  IDLE:       'idle',
  RUNNING:    'running',
  JUMPING:    'jumping',
  FALLING:    'falling',
  CROUCHING:  'crouching',
  WALL_SLIDE: 'wallSlide',
  MOVE_UP:    'moveUp',    // free upward movement when gravity is disabled
  MOVE_DOWN:  'moveDown',  // free downward movement when gravity is disabled
});

/**
 * Pure function: derive the logical player state from physical flags.
 *
 * @param {{
 *   grounded: boolean,
 *   crouching: boolean,
 *   vx: number,
 *   vy: number,
 *   touchingWallLeft: boolean,
 *   touchingWallRight: boolean,
 * }} flags
 * @returns {string} One of the STATE constants.
 */
export function deriveState({ grounded, crouching, vx, vy, touchingWallLeft, touchingWallRight }) {
  if (grounded) {
    if (crouching) return STATE.CROUCHING;
    if (vx !== 0)  return STATE.RUNNING;
    return STATE.IDLE;
  }
  if (touchingWallLeft || touchingWallRight) return STATE.WALL_SLIDE;
  if (vy > 0) return STATE.JUMPING;
  return STATE.FALLING;
}
