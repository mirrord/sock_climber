/**
 * Pure utilities for per-object sprite animation during play/test mode.
 */

/**
 * Resolve the animation definition linked to the idle behavior of a GameObject.
 * Matches the idle behavior's `animation` string against `animation.name` fields.
 *
 * @param {import('../objects/GameObject.js').GameObject} gameObject
 * @returns {object|null} animation definition or null if not configured
 */
export function resolveIdleAnimDef(gameObject) {
  return resolveBehaviorAnimDef(gameObject, 'idle');
}

/**
 * Resolve the animation definition linked to a specific behavior of a GameObject.
 * Matches the named behavior's `animation` string against `animation.name` fields.
 *
 * @param {{ behaviors: Array<{id: string, animation: string|null}>, animations: object[] }} gameObject
 * @param {string} behaviorId
 * @returns {object|null} animation definition or null if not configured
 */
export function resolveBehaviorAnimDef(gameObject, behaviorId) {
  const beh = gameObject.behaviors.find((b) => b.id === behaviorId);
  if (!beh || !beh.animation) return null;
  return gameObject.animations.find((a) => a.name === beh.animation) ?? null;
}

/**
 * Advance a sprite animation state by `dt` seconds.
 * Returns a new `{ frame, timeAcc }` without mutating the input.
 *
 * @param {{ frame: number, timeAcc: number, animDef: { fps: number, frameCount: number, loop: boolean } }} state
 * @param {number} dt — elapsed seconds
 * @returns {{ frame: number, timeAcc: number }}
 */
export function advanceAnimFrame(state, dt) {
  const { frame, timeAcc, animDef } = state;
  if (animDef.fps <= 0 || animDef.frameCount <= 1) {
    return { frame, timeAcc };
  }
  const frameInterval = 1 / animDef.fps;
  const newTimeAcc = timeAcc + dt;
  const elapsed = Math.floor(newTimeAcc / frameInterval);
  if (elapsed === 0) return { frame, timeAcc: newTimeAcc };
  const totalFrames = animDef.frameCount;
  const newFrame = animDef.loop
    ? (frame + elapsed) % totalFrames
    : Math.min(frame + elapsed, totalFrames - 1);
  return { frame: newFrame, timeAcc: newTimeAcc - elapsed * frameInterval };
}
