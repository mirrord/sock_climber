import type { RNG } from "../core/RNG.js";

/**
 * A 2-D integer point sample.
 */
export interface Sample {
  tx: number;
  ty: number;
}

/**
 * Options for `poissonSample`.
 */
export interface PoissonOptions {
  /** Width of the sampling area in tiles. */
  width: number;
  /** Height of the sampling area in tiles. */
  height: number;
  /**
   * Minimum tile distance between any two accepted samples (Chebyshev / infinity-norm).
   * Must be ≥ 1.
   */
  minDist: number;
  /**
   * 0–1 probability that a candidate is even considered (density gate).
   * Use this to thin the distribution further without changing minDist.
   */
  density: number;
  /** Number of candidate attempts before giving up on a particular active sample. */
  maxAttempts?: number;
}

/**
 * Seeded Poisson-disk-inspired sampler over a 2-D integer grid.
 *
 * Implementation notes:
 * - Uses a simplified dart-throwing approach with an integer occupancy grid.
 * - `minDist` is enforced via a flat occupancy map (good enough for chunk sizes ≤ 20 tiles).
 * - Results are deterministic for a given `rng` state and options.
 */
export function poissonSample(rng: RNG, opts: PoissonOptions): Sample[] {
  const { width, height, minDist, density } = opts;
  const maxAttempts = opts.maxAttempts ?? 30;
  const md2 = minDist * minDist;

  const accepted: Sample[] = [];

  // Flat boolean occupancy grid to check proximity efficiently.
  const occupied = new Uint8Array(width * height);

  function tooClose(tx: number, ty: number): boolean {
    const x0 = Math.max(0, tx - minDist);
    const x1 = Math.min(width - 1, tx + minDist);
    const y0 = Math.max(0, ty - minDist);
    const y1 = Math.min(height - 1, ty + minDist);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (occupied[y * width + x]) {
          const ddx = x - tx;
          const ddy = y - ty;
          if (ddx * ddx + ddy * ddy < md2) return true;
        }
      }
    }
    return false;
  }

  // Active list: samples whose neighbourhood hasn't been fully explored.
  const active: Sample[] = [];

  // Seed with one random point.
  const sx = rng.int(0, width - 1);
  const sy = rng.int(0, height - 1);
  if (rng.next() < density) {
    accepted.push({ tx: sx, ty: sy });
    occupied[sy * width + sx] = 1;
    active.push({ tx: sx, ty: sy });
  }

  while (active.length > 0) {
    const idx = rng.int(0, active.length - 1);
    const base = active[idx]!;
    let placed = false;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Generate a candidate in the annulus [minDist, 2*minDist].
      const angle = rng.next() * Math.PI * 2;
      const radius = minDist + rng.next() * minDist;
      const cx = Math.round(base.tx + Math.cos(angle) * radius);
      const cy = Math.round(base.ty + Math.sin(angle) * radius);

      if (cx < 0 || cx >= width || cy < 0 || cy >= height) continue;
      if (occupied[cy * width + cx]) continue;
      if (tooClose(cx, cy)) continue;
      if (rng.next() >= density) continue;

      accepted.push({ tx: cx, ty: cy });
      occupied[cy * width + cx] = 1;
      active.push({ tx: cx, ty: cy });
      placed = true;
      break;
    }

    if (!placed) {
      // Remove exhausted sample from active list (swap with last).
      active[idx] = active[active.length - 1]!;
      active.pop();
    }
  }

  return accepted;
}
