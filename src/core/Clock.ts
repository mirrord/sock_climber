/**
 * Monotonic time source wrapping `performance.now`.
 * Injectable in tests by passing a custom `now` function.
 */
export interface Clock {
  /** Returns monotonic time in milliseconds. */
  now(): number;
}

/**
 * Creates a real clock backed by `performance.now`.
 */
export function createRealClock(): Clock {
  return { now: () => performance.now() };
}

/**
 * Creates a controllable mock clock for deterministic tests.
 * Time advances only via `advance(ms)`.
 */
export function createMockClock(startMs = 0): Clock & { advance(ms: number): void } {
  let t = startMs;
  return {
    now: () => t,
    advance(ms: number) {
      t += ms;
    },
  };
}
