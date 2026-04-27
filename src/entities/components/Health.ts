/** Health state for an entity. Supports multiple HP containers with i-frames. */
export interface Health {
  /** Total HP containers (max HP). */
  containers: number;
  /** Current HP (0 = dead). */
  current: number;
  /** Seconds remaining on the i-frame window (0 = not in i-frames). */
  iFrameTimer: number;
  /** Total i-frame duration triggered on each hit, in seconds. */
  iFrameDuration: number;
}

/**
 * Creates a Health component with the given container count.
 * @param containers   - Maximum HP.
 * @param iFrameDuration - I-frame window per hit in seconds.
 */
export function createHealth(containers: number, iFrameDuration = 1): Health {
  return {
    containers,
    current: containers,
    iFrameTimer: 0,
    iFrameDuration,
  };
}
