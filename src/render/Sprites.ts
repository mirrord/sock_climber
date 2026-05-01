import * as THREE from "three";
import type { Player } from "../entities/Player.js";
import { getBody, getIFrameTimer, getSpriteVariant } from "../entities/access.js";
import type { SpawnedEntity } from "../level/Generator.js";
import type { TileWorld } from "../physics/TileWorld.js";
import type { EntityTag } from "../level/Chunks.js";
import { CLIMB_DIR_VERTICAL, type ClimbDir } from "../level/Axis.js";
import type { Path } from "../level/Path.js";
import { PlayerAnimator } from "./PlayerSprite.js";

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Default visible half-extent (world units) used when callers don't supply
 * the camera's actual climb / lateral half. Matches the legacy `HALF_H`
 * fallback in `GameCamera`.
 */
const HALF_H = 10;
/** Extra tile rows above/below the viewport to include in the tile mesh. */
const TILE_ROW_BUFFER = 2;
/**
 * Maximum tile instances in the InstancedMesh.
 * World width = 12, visible rows ≈ 24, buffer = 4 → ≤ 336; rounded up.
 */
const MAX_TILE_INSTANCES = 512;

// ─── Color palette (MeshBasicMaterial colours per tag or special key) ────────

const TAG_COLOR: Readonly<Record<string, number>> = {
  // Player
  Player: 0xffffff,
  // Enemies
  Keys: 0xffff00,
  Wallet: 0x00ff66,
  Phone: 0x4488ff,
  Lipstick: 0xff00cc,
  Headphones: 0xaa44ff,
  // Obstacles
  Gum: 0x8b4513,
  DustBunny: 0x999999,
  Lighter: 0xff8800,
  Pen: 0x00aaaa,
  DryerSheet: 0xfff8c8,
  // Buffs — white so loaded sprite textures render unmodulated.
  LowGravitySock: 0xffffff,
  SpeedSock: 0xffffff,
  SlowFloodSock: 0xffffff,
  HighJumpSock: 0xffffff,
  PowerSock: 0xffffff,
  RapidStrikeSock: 0xffffff,
  SoftenerBuff: 0xfff8c8,
  // Boss
  BossLaundry: 0xddccaa,
  BossLaundryThrow: 0xddccaa,
  BossLaundryChase: 0xeebb88,
  BossLaundryTelegraph: 0xffaa66,
  BossLaundryJump: 0xffaa66,
  BossLaundryDizzy: 0xff6688,
};

/** Fallback colour when a tag is not found in the palette (bright magenta = obvious placeholder). */
const DEFAULT_COLOR = 0xff00ff;

// ─── Z-layer ordering ─────────────────────────────────────────────────────────

const Z_LAYER = {
  tile: 0,
  obstacle: 0.4,
  enemy: 0.5,
  buff: 0.6,
  player: 1.0,
  deathPlane: 0.9,
} as const;

// ─── Local interfaces for structural typing (avoids deep entity imports) ──────

interface BuffLike {
  readonly id: number;
  readonly position: Readonly<{ x: number; y: number }>;
  readonly halfW: number;
  readonly halfH: number;
}

/**
 * Per-tag sprite-sheet animation state for non-player entities (buff
 * pickups, obstacles, enemies). The texture/material are shared by every
 * live entity of that tag, so advancing `texture.offset.x` once per frame
 * animates all instances simultaneously.
 * @internal
 */
interface EntitySpriteAnim {
  readonly texture: THREE.Texture;
  readonly material: THREE.MeshBasicMaterial;
  readonly frames: number;
  readonly worldW: number;
  readonly worldH: number;
  readonly fps: number;
  accum: number;
  frame: number;
}

/** Pixels-per-world-unit reference for entity sprites (matches PlayerAnimator).
 *  Reduced from 64 → 51.2 (= 64 / 1.25) to scale every entity sprite sheet
 *  uniformly 25 % larger without editing each frame size in `main.ts`. */
const ENTITY_PX_PER_UNIT = 51.2;

// ─── SpritePool ───────────────────────────────────────────────────────────────

/**
 * SpritePool — manages Three.js meshes for all game entities and the tile world.
 *
 * Entity meshes are created lazily on first `syncEntity` call and removed from
 * the scene when their entity no longer appears in `syncAll`.  The tile world
 * uses a single InstancedMesh updated every render frame.  The death plane uses
 * one long thin plane mesh.
 *
 * Zero per-frame allocations during steady-state gameplay after warmup.
 */
export class SpritePool {
  // ─── Entity meshes (id → mesh) ────────────────────────────────────────────
  private readonly _meshes = new Map<number, THREE.Mesh>();

  /** Reusable Set for tracking live entity IDs — prevents per-frame allocation. */
  private readonly _seenThisFrame = new Set<number>();
  /** Reusable array for collecting IDs to remove — prevents per-frame allocation. */
  private readonly _toRemove: number[] = [];

  // ─── Player mesh ──────────────────────────────────────────────────────────
  private _playerMesh: THREE.Mesh | null = null;
  /** Animation state machine — empty until `playerAnimator.setSheet` calls. */
  private readonly _playerAnimator = new PlayerAnimator();

  // ─── Death plane mesh ─────────────────────────────────────────────────────
  private _planeMesh: THREE.Mesh | null = null;

  // ─── Shared unit-plane geometry (scale handles sizing) ────────────────────
  private readonly _geoUnit = new THREE.PlaneGeometry(1, 1);

  // ─── Tile InstancedMesh ───────────────────────────────────────────────────
  private _tileMesh: THREE.InstancedMesh | null = null;
  /** Pre-allocated Object3D for computing tile instance matrices. */
  private readonly _dummy = new THREE.Object3D();
  private readonly _tileMat = new THREE.MeshBasicMaterial({ color: 0x555577 });

  // ─── Material cache (one MeshBasicMaterial per tag/key) ───────────────────
  private readonly _mats = new Map<string, THREE.MeshBasicMaterial>();
  /** Per-tag sprite-sheet animations for non-player entities. */
  private readonly _entityAnims = new Map<string, EntitySpriteAnim>();
  // ─── Hit-flash + i-frame blink state ───────────────────────────────
  /** Bright white material swapped in for the flash duration on a hit. */
  private readonly _flashMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  /** Per-entity remaining hit-flash time in seconds. */
  private readonly _hitFlashTimers = new Map<number, number>();
  private _playerHitFlashTimer = 0;
  /** Duration of the hit-flash overlay in seconds. */
  private static readonly HIT_FLASH_DURATION = 0.1;
  /** Blink toggles per second while i-frames are active (full on/off cycles). */
  private static readonly BLINK_RATE_HZ = 12;
  // ─── Death plane geometry ─────────────────────────────────────────────────
  // Default placeholder: thin red bar spanning the visible world. Replaced
  // with the laundry-pile texture (and matching dimensions) once the image
  // is loaded via `setDeathPlaneTexture`.
  private _planeMat: THREE.MeshBasicMaterial = new THREE.MeshBasicMaterial({
    color: 0xff2222,
  });
  private _planeGeo: THREE.PlaneGeometry = new THREE.PlaneGeometry(100, 0.1);
  /** World coord (lateral axis) at which the death-plane mesh is centred. */
  private _planeCenterLateral = 0;
  /** Offset along climb axis added to the mesh position. Default 0 = mesh
   *  centred on `planePos` (image midpoint = death line). */
  private _planePosOffset = 0;
  /** Climb direction the death plane is rendered for. */
  private _planeDir: ClimbDir = CLIMB_DIR_VERTICAL;
  /**
   * Smoothed mesh rotation for path-mode (level 3). The raw target
   * rotation derived from the local path tangent snaps instantaneously
   * at every bend; we exponentially blend toward the target each frame
   * so the plane visibly "rotates" through corners. `null` until the
   * first path-mode `syncDeathPlane` call, at which point it latches
   * to the target with no blend (avoids a spurious spin on spawn).
   */
  private _planeRotation: number | null = null;

  // ─── Hit-flash / blink API ───────────────────────────────────────────

  /**
   * Trigger a brief white flash on the mesh associated with `entityId`.
   * Called by the gameplay layer in response to `onHit`.
   */
  triggerHitFlash(entityId: number): void {
    this._hitFlashTimers.set(entityId, SpritePool.HIT_FLASH_DURATION);
  }

  /** Trigger a brief white flash on the player mesh. */
  triggerPlayerHitFlash(): void {
    this._playerHitFlashTimer = SpritePool.HIT_FLASH_DURATION;
  }

  /**
   * Advance hit-flash timers by `dt` seconds. Call once per render frame.
   * Stale entries (entityId no longer in `_meshes`) are pruned implicitly
   * by the regular sync cycle.
   */
  tick(dt: number): void {
    if (this._playerHitFlashTimer > 0) {
      this._playerHitFlashTimer = Math.max(0, this._playerHitFlashTimer - dt);
    }
    if (this._hitFlashTimers.size > 0) {
      for (const [id, t] of this._hitFlashTimers) {
        const next = t - dt;
        if (next <= 0) this._hitFlashTimers.delete(id);
        else this._hitFlashTimers.set(id, next);
      }
    }
    // Advance per-tag entity sprite animations.
    for (const anim of this._entityAnims.values()) {
      anim.accum += dt;
      const frameDur = 1 / anim.fps;
      while (anim.accum >= frameDur) {
        anim.accum -= frameDur;
        anim.frame = (anim.frame + 1) % anim.frames;
      }
      anim.texture.offset.x = anim.frame / anim.frames;
    }
  }

  /** Helper: blink mesh visibility based on `iFrameTimer` (true = visible). */
  private _blinkVisible(iFrameTimer: number): boolean {
    if (iFrameTimer <= 0) return true;
    // Toggle every (1 / (2 * BLINK_RATE_HZ)) seconds. Hide on odd half-cycles.
    const phase = Math.floor(iFrameTimer * SpritePool.BLINK_RATE_HZ * 2);
    return (phase & 1) === 0;
  }

  // ─── Material helpers ─────────────────────────────────────────────────────

  private _matFor(key: string): THREE.MeshBasicMaterial {
    let mat = this._mats.get(key);
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({ color: TAG_COLOR[key] ?? DEFAULT_COLOR });
      this._mats.set(key, mat);
    }
    return mat;
  }

  /**
   * Swap a loaded texture into the material for a given tag.
   * Pass `null` to revert to the solid-colour placeholder.
   * This is a no-op if the material has not been created yet (first `sync*`
   * call has not occurred for that tag).
   *
   * @param tag     - Entity tag or `"Player"` / `"tile"`.
   * @param texture - Loaded Three.js texture, or `null` to remove.
   */
  setTexture(tag: EntityTag | "Player" | "tile", texture: THREE.Texture | null): void {
    if (tag === "tile") {
      this._tileMat.map = texture;
      this._tileMat.needsUpdate = true;
      return;
    }
    // Create the material on demand so textures applied before the first
    // entity of this tag spawns still take effect when meshes appear.
    const mat = this._matFor(tag as string);
    mat.map = texture;
    mat.needsUpdate = true;
  }

  /**
   * Register an animated sprite-sheet for an entity tag (buff pickup,
   * obstacle, or enemy). The texture is sliced horizontally into `frames`
   * equal-width frames; `tick(dt)` advances the active frame and updates
   * `texture.offset.x` so every live mesh sharing this tag's material
   * renders the same animated frame.
   *
   * @param tag    - Entity tag.
   * @param texture - Loaded `THREE.Texture`. Filtering is reconfigured for
   *                  crisp pixel-art rendering.
   * @param frames  - Number of frames in the horizontal strip.
   * @param frameW  - Width of one frame in pixels.
   * @param frameH  - Height of one frame in pixels.
   * @param fps     - Playback rate.
   */
  setEntitySheet(
    tag: EntityTag | string,
    texture: THREE.Texture,
    frames: number,
    frameW: number,
    frameH: number,
    fps: number,
  ): void {
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.repeat.set(1 / frames, 1);
    texture.offset.set(0, 0);
    texture.needsUpdate = true;
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    });
    // Replace the cached per-tag material so `_matFor(tag)` returns the
    // animated material for subsequent meshes (and existing meshes are
    // re-pointed at it inside `_syncEntity`).
    const prev = this._mats.get(tag as string);
    if (prev) prev.dispose();
    this._mats.set(tag as string, material);
    this._entityAnims.set(tag as string, {
      texture,
      material,
      frames,
      worldW: frameW / ENTITY_PX_PER_UNIT,
      worldH: frameH / ENTITY_PX_PER_UNIT,
      fps,
      accum: 0,
      frame: 0,
    });
  }

  // ─── Player ───────────────────────────────────────────────────────────────

  /**
   * Update (or create) the player mesh.
   *
   * @param player       - Player entity; facing direction and half-extents are read.
   * @param scene        - Three.js scene.
   * @param renderX      - Interpolated world X.
   * @param renderY      - Interpolated world Y (Y+ = down in world space).
   * @param dt           - Render-frame delta time (seconds). Used to advance
   *                       the sprite-sheet animation. Defaults to 0 so unit
   *                       tests that omit it still work.
   * @param isAttacking  - True when `CombatSystem.isAttacking` for the
   *                       current frame. Drives `attack` / `crouchAttack`.
   */
  syncPlayer(
    player: Player,
    scene: THREE.Scene,
    renderX: number,
    renderY: number,
    dt = 0,
    isAttacking = false,
  ): void {
    if (!this._playerMesh) {
      this._playerMesh = new THREE.Mesh(this._geoUnit, this._matFor("Player"));
      this._playerMesh.position.z = Z_LAYER.player;
      scene.add(this._playerMesh);
    }
    const def = this._playerAnimator.update(dt, {
      isAttacking,
      isCrouching: player.isCrouching,
      isGrounded: player.locomotion === "Grounded",
      velocityX: player.body.velocity.x,
      isWallSliding: player.locomotion === "WallSliding",
      isWallKicking: player.wallKickLockTimer > 0,
    });
    let baseMat: THREE.Material;
    if (def !== null) {
      baseMat = def.material;
      // Anchor by feet: bottom of sprite aligns with bottom of body so
      // taller crouch / attack sheets stay visually planted on the ground.
      const halfH = player.body.halfExtents.y;
      const yOffset = halfH - def.worldH / 2;
      // Anchor by back edge (relative to facing): wider attack / crouch
      // frames keep the same back-edge X as the idle sprite, so the
      // character does not appear to shift backwards on attack startup
      // and forwards again on attack end. The mesh is centred at its
      // local origin, so a sprite of width `worldW` has its back edge at
      // `meshX - facing * worldW/2`. Solving for meshX given the desired
      // back-edge X = `renderX - facing * anchorW/2` yields the offset
      // below.
      const anchorW = this._playerAnimator.anchorWorldW;
      // Default: anchor by back edge (relative to facing). For the wall-slide
      // sprite the strip should hug the facing side (the wall the player is
      // pressed against), so flip the offset sign in that state.
      const anchorToFront =
        this._playerAnimator.state === "jump" ||
        this._playerAnimator.state === "wallSlide" ||
        this._playerAnimator.state === "wallKick";
      const xOffset = anchorToFront
        ? (player.facing * (anchorW - def.worldW)) / 2
        : (player.facing * (def.worldW - anchorW)) / 2;
      this._playerMesh.position.x = renderX + xOffset;
      this._playerMesh.position.y = -(renderY + yOffset);
      this._playerMesh.scale.set(player.facing * def.worldW, def.worldH, 1);
    } else {
      // Fallback: solid-colour rectangle sized to the body (legacy path).
      const hw = player.body.halfExtents.x;
      const hh = player.body.halfExtents.y;
      baseMat = this._matFor("Player");
      this._playerMesh.position.x = renderX;
      this._playerMesh.position.y = -renderY;
      this._playerMesh.scale.set(player.facing * hw * 2, hh * 2, 1);
    }

    // Hit-flash overlay swaps in a white material; restore animation
    // material when done. Only apply the flash when the player is rendered
    // as the legacy solid-colour rectangle — the white material has no
    // texture, so swapping it in over a sprite-sheet animation would
    // briefly render a bare white square. The i-frame blink below still
    // provides hit feedback for the sprite-driven path.
    const flashing = def === null && this._playerHitFlashTimer > 0;
    this._playerMesh.material = flashing ? this._flashMat : baseMat;
    // I-frame blink: hide on odd phases.
    this._playerMesh.visible = this._blinkVisible(player.iFrameTimer);
  }

  /**
   * Animator used to drive player sprite-sheet animations. Call
   * `setSheet(...)` for each loaded texture during startup.
   */
  get playerAnimator(): PlayerAnimator {
    return this._playerAnimator;
  }

  // ─── Entity sync (enemies / obstacles / buffs) ────────────────────────────

  /**
   * Sync all live entity meshes to match `entities`, creating new meshes for
   * newly spawned entities and removing meshes for despawned ones.
   *
   * Call once per render frame.
   *
   * @param entities - Current live entity list from `SpawnSystem.liveEntities`.
   * @param scene    - Three.js scene.
   */
  syncAll(entities: readonly SpawnedEntity[], scene: THREE.Scene): void {
    this._seenThisFrame.clear();
    for (const e of entities) {
      this._syncEntity(e, scene);
      this._seenThisFrame.add(e.entity.id);
    }

    // Collect stale IDs.  Cannot delete while iterating the map.
    this._toRemove.length = 0;
    for (const id of this._meshes.keys()) {
      if (!this._seenThisFrame.has(id)) {
        this._toRemove.push(id);
      }
    }
    for (const id of this._toRemove) {
      this._removeMesh(id, scene);
    }
  }

  /** @internal */
  private _syncEntity(spawned: SpawnedEntity, scene: THREE.Scene): void {
    const { id, x, y, hw, hh } = this._boundsOf(spawned);
    const zLayer = Z_LAYER[spawned.kind as keyof typeof Z_LAYER] ?? 0.3;

    let mesh = this._meshes.get(id);
    if (!mesh) {
      mesh = new THREE.Mesh(this._geoUnit, this._matFor(spawned.tag as string));
      mesh.position.z = zLayer;
      scene.add(mesh);
      this._meshes.set(id, mesh);
    }
    mesh.position.x = x;
    mesh.position.y = -y; // Y-flip
    // Entities with a registered sprite-sheet render at the sheet's natural
    // pixel dimensions instead of the body's collision half-extents, so the
    // visible art is independent of the hitbox size.
    //
    // An entity may optionally expose `spriteVariant` (a string returned by
    // a getter or method) to render an alternate sheet for the current
    // frame — e.g. Keys returns `"KeysTelegraph"` while telegraphing so
    // the jingle animation plays. The variant key falls back to the tag
    // if it isn't registered with `setEntitySheet`.
    const variant = getSpriteVariant(spawned.entity);
    const animKey =
      variant !== undefined && this._entityAnims.has(variant)
        ? variant
        : (spawned.tag as string);
    const anim = this._entityAnims.get(animKey);
    let scaleX: number;
    let scaleY: number;
    if (anim) {
      scaleX = anim.worldW;
      scaleY = anim.worldH;
      // Re-point the mesh at the (possibly hot-swapped) animated material.
      if (mesh.material !== anim.material) mesh.material = anim.material;
    } else {
      scaleX = hw * 2;
      scaleY = hh * 2;
    }
    // Enemies face the direction they're moving; obstacles & buffs do not flip.
    if (spawned.kind === "enemy") {
      const enemyBody = getBody(spawned.entity);
      if (enemyBody !== null && enemyBody.velocity.x < 0) scaleX = -scaleX;
    }
    mesh.scale.set(scaleX, scaleY, 1);

    // Hit flash + i-frame blink (enemies only).
    if (spawned.kind === "enemy") {
      const flashing = (this._hitFlashTimers.get(id) ?? 0) > 0;
      const baseMat = anim ? anim.material : this._matFor(spawned.tag as string);
      mesh.material = flashing ? this._flashMat : baseMat;
      const iFrameTimer = getIFrameTimer(spawned.entity);
      mesh.visible = this._blinkVisible(iFrameTimer);
    }
  }

  /** @internal */
  private _removeMesh(id: number, scene: THREE.Scene): void {
    const mesh = this._meshes.get(id);
    if (mesh) {
      scene.remove(mesh);
      this._meshes.delete(id);
    }
  }

  // ─── Death plane ──────────────────────────────────────────────────────────

  /**
   * Update (or create) the death-plane mesh.
   *
   * @param planeY    - Current death-plane world Y (Y+ = down).
   * @param scene     - Three.js scene.
   * @param rumbling  - When true, jitter the mesh slightly horizontally and
   *                    vertically to indicate the plane is about to start
   *                    moving. Set to false once the plane is in motion.
   */
  syncDeathPlane(
    planePos: number,
    scene: THREE.Scene,
    rumbling = false,
    path: Path | null = null,
  ): void {
    if (!this._planeMesh) {
      this._planeMesh = new THREE.Mesh(this._planeGeo, this._planeMat);
      this._planeMesh.position.z = Z_LAYER.deathPlane;
      scene.add(this._planeMesh);
    }
    let xJitter = 0;
    let yJitter = 0;
    if (rumbling) {
      // Small randomised jitter — amplitude in world units. Two independent
      // axes give a noisy shake. No allocation, no time dependency.
      const AMP = 0.08;
      xJitter = (Math.random() - 0.5) * 2 * AMP;
      yJitter = (Math.random() - 0.5) * 2 * AMP;
    }
    if (this._planeDir.axis === "y") {
      // Vertical climb: mesh is a horizontal bar. Position X = lateral centre, Y = -planePos (Y-flip).
      this._planeMesh.position.x = this._planeCenterLateral + xJitter;
      this._planeMesh.position.y = -(planePos + this._planePosOffset) + yJitter;
    } else if (this._planeDir.axis === "x") {
      // Horizontal climb: mesh is a vertical strip (rotated 90°). Position X = planePos, Y = -lateral centre.
      this._planeMesh.position.x = planePos + this._planePosOffset + xJitter;
      this._planeMesh.position.y = -this._planeCenterLateral + yJitter;
    } else {
      // Path climb (level 3): project the death-plane `s` to world
      // space via the live Path. The plane mesh is rotated so its
      // long edge is perpendicular to the local path tangent.
      if (path !== null) {
        const { position, tangent } = path.projectS(planePos);
        // The corridor interior is an odd number of tiles wide
        // (CORRIDOR_HALF_WIDTH * 2 + 1 = 19), centred on the path
        // centreline. Tile cells extend from worldX to worldX+1, so
        // the geometric centre of the wall-to-wall span sits half a
        // tile *outboard* of the path centreline along the local
        // perpendicular. Without this offset the death-plane image
        // appears shifted toward one wall.
        //
        // Perp in path space is (-tangent.y, tangent.x); the renderer
        // flips world Y, so the perpendicular in render space is
        // (-tangent.y, -tangent.x).
        const LATERAL_TILE_OFFSET = 0.5;
        const perpRenderX = -tangent.y;
        const perpRenderY = -tangent.x;
        this._planeMesh.position.x =
          position.x + perpRenderX * LATERAL_TILE_OFFSET + xJitter;
        this._planeMesh.position.y =
          -position.y + perpRenderY * LATERAL_TILE_OFFSET + yJitter;
        // Geometry is (lateralExtent, planeThickness) — the mesh's
        // local +Y axis is the "front" / leading edge of the texture.
        // We want that leading edge to point along the local tangent
        // (the direction the plane is chasing) in render space.
        //
        // Render space flips physics-Y, so the visual tangent is
        // `t_r = (tangent.x, -tangent.y)`. A rotation θ around +Z maps
        // the mesh's +Y_local to `(-sin θ, cos θ)`. Setting that equal
        // to `t_r` gives `θ = atan2(-tangent.x, -tangent.y)`:
        //   tangent (0,-1) → 0       (north chase, horizontal bar)
        //   tangent (1, 0) → -π/2    (east chase, leading edge → +X)
        //   tangent (0, 1) → π       (south chase, leading edge → -Y)
        //   tangent (-1,0) → +π/2    (west chase, leading edge → -X)
        //
        // (The previous formula `atan2(tangent.x, -tangent.y)` had the
        // wrong sign, which made the plane appear to turn the wrong
        // way through bends.)
        const target = Math.atan2(-tangent.x, -tangent.y);
        if (this._planeRotation === null) {
          this._planeRotation = target;
        } else {
          // Shortest-arc delta so we never spin "the long way round"
          // when the target wraps across ±π.
          let delta = target - this._planeRotation;
          while (delta > Math.PI) delta -= 2 * Math.PI;
          while (delta < -Math.PI) delta += 2 * Math.PI;
          // Exponential blend factor: ~12% per frame ≈ visible turn
          // over ~10 frames (~165 ms at 60 fps). Frame-rate-dependent
          // but the death plane only rotates infrequently (at bends)
          // so the slight variation is unnoticeable in practice.
          this._planeRotation += delta * 0.12;
        }
        this._planeMesh.rotation.z = this._planeRotation;
      }
    }
  }

  /**
   * Apply the death-plane texture and resize the mesh to span `worldWidth`,
   * preserving the texture's aspect ratio.  The mesh is centred horizontally
   * at `centerX` and vertically on `planeY` so that the image's vertical
   * midpoint coincides with the actual death-plane boundary.
   *
   * Safe to call before the first `syncDeathPlane`.
   *
   * @param texture    - Loaded Three.js texture (must have `image` populated).
   * @param worldWidth - Desired mesh width in world units.
   * @param centerX    - World X at which to centre the mesh.
   */
  setDeathPlaneTexture(
    texture: THREE.Texture,
    lateralExtent: number,
    lateralCenter: number,
    climbDir: ClimbDir = CLIMB_DIR_VERTICAL,
  ): void {
    const img = texture.image as { width: number; height: number } | undefined;
    const aspect = img && img.width > 0 && img.height > 0 ? img.width / img.height : 1;
    const planeThickness = lateralExtent / aspect;

    // Replace geometry sized to span the lateral extent. For vertical
    // climb the mesh is a horizontal bar (lateralExtent wide ×
    // planeThickness tall). For horizontal climb the mesh is a vertical
    // strip (planeThickness wide × lateralExtent tall) — same image,
    // with its texture rotated 90° so its long edge is parallel to the
    // death wall while preserving aspect ratio. For path-mode (level 3)
    // the mesh is built as a horizontal bar; the per-frame rotation in
    // `syncDeathPlane` aligns it perpendicular to the local path
    // tangent.
    this._planeGeo.dispose();
    this._planeGeo =
      climbDir.axis === "x"
        ? new THREE.PlaneGeometry(planeThickness, lateralExtent)
        : new THREE.PlaneGeometry(lateralExtent, planeThickness);

    // Rotate the texture itself for horizontal climb so the image's long
    // edge runs along the corridor's lateral (Y) axis. Rotating the mesh
    // would swap world-space dimensions and squash the strip onto a thin
    // band, which is what previously caused the death plane to fail to
    // span the full corridor height in level 2.
    texture.center.set(0.5, 0.5);
    texture.rotation = climbDir.axis === "x" ? -Math.PI / 2 : 0;
    texture.needsUpdate = true;

    // Replace material with a transparent textured one (PNG has alpha).
    this._planeMat.dispose();
    this._planeMat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    });

    this._planeCenterLateral = lateralCenter;
    this._planeDir = climbDir;

    if (this._planeMesh) {
      this._planeMesh.geometry = this._planeGeo;
      this._planeMesh.material = this._planeMat;
      // For x/y climb the mesh is never rotated (texture rotation
      // handles image orientation). For path mode the rotation is
      // recomputed each frame in syncDeathPlane.
      if (climbDir.axis !== "path") {
        this._planeMesh.rotation.z = 0;
      }
    }
    // Drop any stale smoothed rotation so the first path-mode sync
    // after a level switch latches to the new tangent without blending
    // through whatever angle the previous level happened to leave us at.
    this._planeRotation = null;
  }

  // ─── Tiles ────────────────────────────────────────────────────────────────

  /**
   * Rebuild the tile InstancedMesh for the visible range around `cameraWorldY`.
   *
   * Scans only the visible tile rows (camera centre ± HALF_H ± buffer), so the
   * cost is O(visible_width × visible_rows) ≈ O(288) per frame — acceptable.
   *
   * @param world        - Tile world (source of truth for solid tiles).
   * @param scene        - Three.js scene.
   * @param cameraWorldY - Camera centre world Y from `GameCamera.worldY`.
   */
  syncTiles(
    world: TileWorld,
    scene: THREE.Scene,
    cameraWorldClimb: number,
    climbDir: ClimbDir = CLIMB_DIR_VERTICAL,
    cameraWorldLateral = 0,
    climbHalf: number = HALF_H,
    lateralHalf: number = HALF_H,
  ): void {
    if (!this._tileMesh) {
      this._tileMesh = new THREE.InstancedMesh(
        this._geoUnit,
        this._tileMat,
        MAX_TILE_INSTANCES,
      );
      this._tileMesh.position.z = Z_LAYER.tile;
      // Instances are manually culled to the visible range in this method,
      // but the InstancedMesh's bounding sphere is derived from the unit-
      // plane geometry at the mesh origin (0, 0, 0). Once the camera
      // moves far enough from the origin, Three.js frustum-culls the
      // entire mesh and the walls vanish visually (physics is
      // unaffected). Disable frustum culling — per-instance culling above
      // already keeps the draw bounded.
      this._tileMesh.frustumCulled = false;
      scene.add(this._tileMesh);
    }

    // Visible band along the climb axis.
    const minClimb = Math.floor(cameraWorldClimb - climbHalf - TILE_ROW_BUFFER);
    const maxClimb = Math.ceil(cameraWorldClimb + climbHalf + TILE_ROW_BUFFER);

    let count = 0;
    if (climbDir.axis === "y") {
      // Climb axis = Y: iterate the visible band of rows, full world width per row.
      const minTy = minClimb;
      const maxTy = maxClimb;
      for (let ty = minTy; ty <= maxTy && count < MAX_TILE_INSTANCES; ty++) {
        for (let tx = 0; tx < world.width && count < MAX_TILE_INSTANCES; tx++) {
          if (world.solidAt(tx, ty)) {
            this._dummy.position.set(tx + 0.5, -(ty + 0.5), 0);
            this._dummy.updateMatrix();
            this._tileMesh.setMatrixAt(count, this._dummy.matrix);
            count++;
          }
        }
      }
    } else if (climbDir.axis === "x") {
      // Climb axis = X: iterate the visible band of columns, full corridor
      // height per column.  The corridor is only ~12 tiles tall in level 2
      // so a single full scan is cheap.
      const minTx = minClimb;
      const maxTx = maxClimb;
      const tyLo = world.yMin;
      const tyHi = world.yMin + world.height - 1;
      for (let tx = minTx; tx <= maxTx && count < MAX_TILE_INSTANCES; tx++) {
        for (let ty = tyLo; ty <= tyHi && count < MAX_TILE_INSTANCES; ty++) {
          if (world.solidAt(tx, ty)) {
            this._dummy.position.set(tx + 0.5, -(ty + 0.5), 0);
            this._dummy.updateMatrix();
            this._tileMesh.setMatrixAt(count, this._dummy.matrix);
            count++;
          }
        }
      }
    } else {
      // Path-mode (level 3) and arena-mode (level 4, axis === "none"):
      // the camera moves freely in 2-D world space; iterate a square
      // neighbourhood around the camera centre.
      const halfWView = Math.ceil(lateralHalf + TILE_ROW_BUFFER);
      const minTx = Math.floor(cameraWorldLateral - halfWView);
      const maxTx = Math.ceil(cameraWorldLateral + halfWView);
      const minTy = minClimb;
      const maxTy = maxClimb;
      for (let ty = minTy; ty <= maxTy && count < MAX_TILE_INSTANCES; ty++) {
        for (let tx = minTx; tx <= maxTx && count < MAX_TILE_INSTANCES; tx++) {
          if (world.solidAt(tx, ty)) {
            this._dummy.position.set(tx + 0.5, -(ty + 0.5), 0);
            this._dummy.updateMatrix();
            this._tileMesh.setMatrixAt(count, this._dummy.matrix);
            count++;
          }
        }
      }
    }

    this._tileMesh.count = count;
    this._tileMesh.instanceMatrix.needsUpdate = true;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Extract position and half-extents from any SpawnedEntity without importing
   * the concrete entity classes.
   */
  private _boundsOf(
    spawned: SpawnedEntity,
  ): { id: number; x: number; y: number; hw: number; hh: number } {
    if (spawned.kind === "buff") {
      const b = spawned.entity as unknown as BuffLike;
      return { id: b.id, x: b.position.x, y: b.position.y, hw: b.halfW, hh: b.halfH };
    }
    // Non-buff entities (enemies, obstacles, projectiles) always have a body.
    const body = getBody(spawned.entity)!;
    return {
      id: spawned.entity.id,
      x: body.position.x,
      y: body.position.y,
      hw: body.halfExtents.x,
      hh: body.halfExtents.y,
    };
  }
}
