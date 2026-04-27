import * as THREE from "three";

// ─── Effect definitions (zero-allocation pre-computed velocity tables) ────────

/**
 * Dust burst — 4 particles that scatter upward and outward when the player
 * lands.  Velocities are in Three.js world space (Y+ = up on screen).
 */
const DUST_VEL = [
  { vx: -1.5, vy: 2.0 },
  { vx: 1.5, vy: 2.0 },
  { vx: -0.5, vy: 3.0 },
  { vx: 0.5, vy: 3.0 },
] as const;

/**
 * Spring puff — 6 particles in an even radial burst when a spring releases.
 * Velocities approximate a unit circle × speed.
 */
const SPRING_VEL = [
  { vx: 3.0, vy: 0.0 },
  { vx: 1.5, vy: 2.6 },
  { vx: -1.5, vy: 2.6 },
  { vx: -3.0, vy: 0.0 },
  { vx: -1.5, vy: -2.6 },
  { vx: 1.5, vy: -2.6 },
] as const;

/** Particle lifetime in seconds. */
const LIFETIME = 0.3;

/** Total particles in the pool.  Enough for 4 dust + 6 spring simultaneously. */
const POOL_SIZE = 24;

/** Z layer for particles (above sprites, below HUD). */
const PARTICLE_Z = 0.8;

// ─── Internal slot type ───────────────────────────────────────────────────────

interface Slot {
  vx: number;
  vy: number;
  life: number;
  active: boolean;
}

// ─── ParticleSystem ───────────────────────────────────────────────────────────

/**
 * ParticleSystem — pooled particles for dust-on-land and spring-puff effects.
 *
 * All particle meshes are pre-allocated in the constructor and kept in the
 * scene permanently (invisible when idle).  The free-list uses push/pop on a
 * pre-sized array; after warmup no heap allocation occurs during gameplay.
 *
 * Wire events from the caller:
 * ```ts
 * bus.on("onLand",          () => ps.emit("dust",       x, y));
 * bus.on("onSpringRelease", () => ps.emit("springPuff", x, y));
 * ```
 */
export class ParticleSystem {
  private readonly _slots: Slot[];
  private readonly _meshes: THREE.Mesh[];
  /** Stack of free slot indices. */
  private readonly _free: number[];

  /** @param scene - Scene to add particle meshes to at construction time. */
  constructor(scene: THREE.Scene) {
    const geo = new THREE.PlaneGeometry(0.15, 0.15);
    const mat = new THREE.MeshBasicMaterial({ color: 0xdddddd });

    this._slots = [];
    this._meshes = [];
    this._free = [];

    for (let i = 0; i < POOL_SIZE; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.position.z = PARTICLE_Z;
      scene.add(mesh);
      this._meshes.push(mesh);
      this._slots.push({ vx: 0, vy: 0, life: 0, active: false });
      this._free.push(i);
    }
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Number of currently active (visible) particles.
   * Exposed for testing.
   */
  get activeCount(): number {
    return POOL_SIZE - this._free.length;
  }

  /**
   * Emit a particle burst at the given world position.
   *
   * @param effect - `"dust"` (4 particles) or `"springPuff"` (6 particles).
   * @param worldX - Burst origin X in world units.
   * @param worldY - Burst origin Y in world units (Y+ = down).
   */
  emit(effect: "dust" | "springPuff", worldX: number, worldY: number): void {
    const vels = effect === "dust" ? DUST_VEL : SPRING_VEL;
    const screenY = -worldY; // Y-flip: world Y+ = down → Three.js Y+ = up

    for (const vel of vels) {
      const idx = this._free.pop();
      if (idx === undefined) break; // pool exhausted — skip gracefully

      const slot = this._slots[idx]!;
      slot.vx = vel.vx;
      slot.vy = vel.vy;
      slot.life = LIFETIME;
      slot.active = true;

      const mesh = this._meshes[idx]!;
      mesh.position.x = worldX;
      mesh.position.y = screenY;
      mesh.visible = true;
    }
  }

  /**
   * Advance all active particles by `dt` seconds.
   *
   * Moves particles along their velocity, decrements lifetime, and reclaims
   * expired slots back to the free list.  Zero per-call allocations after
   * warmup.
   *
   * @param dt - Fixed step size in seconds.
   */
  update(dt: number): void {
    for (let i = 0; i < POOL_SIZE; i++) {
      const slot = this._slots[i]!;
      if (!slot.active) continue;

      slot.life -= dt;
      if (slot.life <= 0) {
        slot.active = false;
        this._meshes[i]!.visible = false;
        this._free.push(i);
        continue;
      }

      const mesh = this._meshes[i]!;
      mesh.position.x += slot.vx * dt;
      mesh.position.y += slot.vy * dt;
    }
  }
}
