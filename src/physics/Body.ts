/** Contact flags set after a physics step. */
export interface BodyFlags {
  onGround: boolean;
  onCeiling: boolean;
  onWallL: boolean;
  onWallR: boolean;
}

/**
 * AABB physics body.
 * `position` is the center of the AABB.
 * `halfExtents` is the half-width and half-height.
 */
export interface Body {
  /** Center position in world units (meters). */
  position: { x: number; y: number };
  /** Half-extents of the AABB in meters. */
  halfExtents: { x: number; y: number };
  /** Velocity in m/s. */
  velocity: { x: number; y: number };
  /** Gravitational acceleration in m/s². Positive = down (+Y). */
  gravity: number;
  /** Linear drag coefficient (0 = no drag, 1 = instant stop). Applied per step. */
  drag: number;
  /** Contact flags, updated by the resolver after each step. */
  flags: BodyFlags;
}

/** Creates a Body with sensible defaults. */
export function createBody(options: Partial<Body> & { position: { x: number; y: number } }): Body {
  return {
    position: { x: options.position.x, y: options.position.y },
    halfExtents: options.halfExtents ?? { x: 0.4, y: 0.5 },
    velocity: options.velocity ?? { x: 0, y: 0 },
    gravity: options.gravity ?? 30,
    drag: options.drag ?? 0,
    flags: options.flags ?? {
      onGround: false,
      onCeiling: false,
      onWallL: false,
      onWallR: false,
    },
  };
}

/**
 * Integrates velocity by one fixed step.
 * Applies gravity and drag in-place on the body.
 *
 * @param body - The body to integrate.
 * @param dt   - Step size in seconds.
 */
export function integrateBody(body: Body, dt: number): void {
  // Apply gravity (positive Y = down)
  body.velocity.y += body.gravity * dt;

  // Apply velocity-proportional drag
  if (body.drag > 0) {
    body.velocity.x *= 1 - body.drag * dt;
    body.velocity.y *= 1 - body.drag * dt;
  }
}
