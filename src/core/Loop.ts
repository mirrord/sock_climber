import type { Clock } from "./Clock.js";

export interface LoopOptions {
  /** Simulation update frequency in Hz. Default 120. */
  stepHz?: number;
  /** Called each fixed step with the step delta-time in seconds. */
  update: (dt: number) => void;
  /** Called each animation frame with interpolation factor alpha ∈ [0,1). */
  render: (alpha: number) => void;
  /** Time source; defaults to `performance.now`. */
  clock?: Clock;
}

export interface Loop {
  start(): void;
  stop(): void;
  pause(): void;
  resume(): void;
  /** Advance the loop by the given real elapsed time (ms). Used in tests only. */
  readonly stepHz: number;
}

/**
 * Creates a fixed-step game loop.
 *
 * The accumulator pattern:
 *  - Elapsed real time is accumulated each frame.
 *  - For every `stepDt` chunk, `update(stepDt)` is called.
 *  - `render(alpha)` is called once per frame with `alpha = accumulator / stepDt`.
 */
export function createLoop(options: LoopOptions): Loop {
  const stepHz = options.stepHz ?? 120;
  const stepDt = 1 / stepHz;
  const stepMs = stepDt * 1000;

  const clock: Clock = options.clock ?? { now: () => performance.now() };

  let rafId = 0;
  let prevMs = 0;
  let accumulator = 0;
  let paused = false;
  let running = false;

  function tick(nowMs: number): void {
    if (!running) return;

    const rawElapsed = nowMs - prevMs;
    prevMs = nowMs;

    if (paused) {
      // Still drive RAF so we can resume cleanly, but skip physics.
      rafId = requestAnimationFrame(tick);
      return;
    }

    // Clamp to avoid spiral of death after tab-switch.
    const elapsed = Math.min(rawElapsed, stepMs * 8);
    accumulator += elapsed;

    while (accumulator >= stepMs) {
      options.update(stepDt);
      accumulator -= stepMs;
    }

    const alpha = accumulator / stepMs;
    options.render(alpha);

    rafId = requestAnimationFrame(tick);
  }

  return {
    stepHz,
    start() {
      if (running) return;
      running = true;
      paused = false;
      prevMs = clock.now();
      accumulator = 0;
      rafId = requestAnimationFrame(tick);
    },
    stop() {
      running = false;
      if (rafId !== 0) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    },
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
      // Reset prevMs so we don't accumulate the pause gap.
      prevMs = clock.now();
    },
  };
}

/**
 * Manually drives a fixed number of update steps — useful in tests where
 * `requestAnimationFrame` is not available.
 *
 * @param update - The update function to call.
 * @param stepDt - Step size in seconds.
 * @param steps  - Number of steps to run.
 */
export function driveLoop(update: (dt: number) => void, stepDt: number, steps: number): void {
  for (let i = 0; i < steps; i++) {
    update(stepDt);
  }
}
