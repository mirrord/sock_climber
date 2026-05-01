/**
 * GlitterEffect — celebratory canvas-based particle burst overlaid on a
 * DOM element. Used by `GameOver` to highlight a new-record run.
 *
 * Particles are 4-pointed stars rendered with additive blending. They
 * spawn from random positions across the host element each frame while
 * `start()` has been called and `stop()` has not yet been; existing
 * particles continue animating until they die so a graceful fade-out
 * happens after `stop()`.
 *
 * Self-contained: owns its own `<canvas>`, sizes it to the host via
 * `ResizeObserver`, and uses `requestAnimationFrame` for animation.
 * `destroy()` removes the canvas and tears down all observers /
 * animation frames.
 */
export class GlitterEffect {
  private readonly _host: HTMLElement;
  private readonly _canvas: HTMLCanvasElement;
  private readonly _ctx: CanvasRenderingContext2D | null;
  private readonly _resizeObserver: ResizeObserver | null;
  private readonly _particles: Particle[] = [];
  private _raf: number | null = null;
  private _spawning = false;
  /** Last animation frame time (ms) — used for delta-time integration. */
  private _lastT = 0;
  /** Fractional spawn accumulator so spawn rate is frame-rate independent. */
  private _spawnAccum = 0;

  /** Particles spawned per second while `_spawning` is true. */
  private static readonly SPAWN_RATE = 80;

  constructor(host: HTMLElement) {
    this._host = host;
    this._canvas = document.createElement("canvas");
    // The canvas must NOT receive pointer events — the buttons under it
    // need to remain clickable.
    this._canvas.style.position = "absolute";
    this._canvas.style.inset = "0";
    this._canvas.style.width = "100%";
    this._canvas.style.height = "100%";
    this._canvas.style.pointerEvents = "none";
    this._canvas.style.zIndex = "0";
    this._canvas.classList.add("glitter-canvas");
    // Wrap in try/catch so test environments (jsdom) that don't
    // implement HTMLCanvasElement.getContext don't spam the console.
    // A null context disables rendering — start()/stop() remain safe.
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = this._canvas.getContext("2d");
    } catch {
      ctx = null;
    }
    this._ctx = ctx;

    // Ensure the host can absolutely-position the canvas relative to itself.
    const computed = getComputedStyle(host);
    if (computed.position === "static") {
      host.style.position = "relative";
    }
    host.appendChild(this._canvas);

    // Track host size changes so the canvas backing store stays in sync
    // with its CSS size (and accounts for devicePixelRatio).
    if (typeof ResizeObserver !== "undefined") {
      this._resizeObserver = new ResizeObserver(() => this._resize());
      this._resizeObserver.observe(host);
    } else {
      this._resizeObserver = null;
    }
    this._resize();
  }

  /**
   * Begin spawning particles. Idempotent — repeated calls are no-ops
   * while the effect is already running.
   */
  start(): void {
    if (this._spawning) return;
    this._spawning = true;
    // Seed a small initial burst so the very first frame already shows
    // the effect, instead of waiting for ~12 ms of accumulator.
    this._burst(24);
    if (this._raf === null) {
      this._lastT = performance.now();
      this._raf = requestAnimationFrame(this._tick);
    }
  }

  /**
   * Stop spawning new particles. Existing particles continue fading out
   * naturally until they die, after which the rAF loop self-cancels.
   */
  stop(): void {
    this._spawning = false;
    this._spawnAccum = 0;
  }

  /**
   * Tear down the effect: stop animation, clear particles, remove the
   * canvas from its host, and disconnect observers.
   */
  destroy(): void {
    this.stop();
    if (this._raf !== null) {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }
    this._particles.length = 0;
    this._resizeObserver?.disconnect();
    this._canvas.parentElement?.removeChild(this._canvas);
  }

  /** Resize the backing store to match the host's CSS size × DPR. */
  private _resize(): void {
    const rect = this._host.getBoundingClientRect();
    const dpr = window.devicePixelRatio ?? 1;
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    if (this._canvas.width !== w) this._canvas.width = w;
    if (this._canvas.height !== h) this._canvas.height = h;
  }

  private readonly _tick = (now: number): void => {
    const ctx = this._ctx;
    if (ctx === null) {
      this._raf = null;
      return;
    }
    const dt = Math.min(0.05, (now - this._lastT) / 1000);
    this._lastT = now;

    // Spawn — frame-rate independent via fractional accumulator.
    if (this._spawning) {
      this._spawnAccum += GlitterEffect.SPAWN_RATE * dt;
      while (this._spawnAccum >= 1) {
        this._spawnAccum -= 1;
        this._spawn();
      }
    }

    // Integrate + cull.
    for (let i = this._particles.length - 1; i >= 0; i--) {
      const p = this._particles[i]!;
      p.age += dt;
      if (p.age >= p.life) {
        this._particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 60 * dt; // gentle gravity (px/s²)
      p.rot += p.rotSpeed * dt;
    }

    // Render.
    const w = this._canvas.width;
    const h = this._canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const dpr = window.devicePixelRatio ?? 1;
    for (const p of this._particles) {
      const t = p.age / p.life;
      // Twinkle: sinusoidal alpha modulation on top of the linear fade.
      const twinkle = 0.5 + 0.5 * Math.sin(p.age * p.twinkleHz * Math.PI * 2);
      const alpha = (1 - t) * twinkle;
      if (alpha <= 0.01) continue;
      drawSparkle(ctx, p.x * dpr, p.y * dpr, p.size * dpr, p.rot, p.hue, alpha);
    }
    ctx.restore();

    // Continue ticking while spawning or while particles linger.
    if (this._spawning || this._particles.length > 0) {
      this._raf = requestAnimationFrame(this._tick);
    } else {
      this._raf = null;
    }
  };

  /** Emit `n` particles at random positions across the host immediately. */
  private _burst(n: number): void {
    for (let i = 0; i < n; i++) this._spawn();
  }

  private _spawn(): void {
    const rect = this._host.getBoundingClientRect();
    // Bias spawns toward the upper third of the overlay where the
    // heading + distance text live, so the sparkle visually celebrates
    // the score rather than uniformly tiling the screen.
    const x = Math.random() * rect.width;
    const y = Math.random() * rect.height * 0.7;
    const angle = Math.random() * Math.PI * 2;
    const speed = 20 + Math.random() * 60;
    this._particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 30, // slight upward drift
      size: 4 + Math.random() * 8,
      rot: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 6,
      hue: pickHue(),
      age: 0,
      life: 0.9 + Math.random() * 1.4,
      twinkleHz: 2 + Math.random() * 4,
    });
  }
}

/** A single live glitter particle. */
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rot: number;
  rotSpeed: number;
  /** HSL hue in degrees. */
  hue: number;
  /** Seconds elapsed since spawn. */
  age: number;
  /** Total lifetime in seconds. */
  life: number;
  /** Twinkle frequency (Hz). */
  twinkleHz: number;
}

/**
 * Festive palette: warm gold, pink, cyan, lavender. Picked from a
 * fixed list rather than a continuous random hue so colours feel
 * intentional rather than muddy.
 */
const HUES = [45, 50, 320, 195, 270, 30] as const;
function pickHue(): number {
  return HUES[Math.floor(Math.random() * HUES.length)]!;
}

/**
 * Draw a 4-point glitter star with a bright core and soft outer rays.
 * Uses two crossed elongated diamonds so the shape reads as a sparkle
 * even at small sizes; the core dot reinforces brightness.
 */
function drawSparkle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  rot: number,
  hue: number,
  alpha: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);

  // Outer rays — long thin diamonds, white with a hue-tinted glow.
  const r = size * 2.2;
  ctx.fillStyle = `hsla(${hue}, 100%, 75%, ${alpha * 0.85})`;
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.lineTo(size * 0.35, 0);
  ctx.lineTo(0, r);
  ctx.lineTo(-size * 0.35, 0);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(-r, 0);
  ctx.lineTo(0, size * 0.35);
  ctx.lineTo(r, 0);
  ctx.lineTo(0, -size * 0.35);
  ctx.closePath();
  ctx.fill();

  // Bright white core.
  ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.45, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
