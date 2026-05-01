import * as THREE from "three";

/**
 * PlayerAnimator — sprite-sheet driven animation state machine for the player.
 *
 * Each animation is a horizontal strip of equally-sized frames. Frames are
 * cropped from the source texture using `texture.offset.x` (each frame is
 * `1 / frames` of the sheet width). Rendering pixel-art crisply requires
 * `NearestFilter` and disabling mipmaps.
 *
 * The animator does not own the player mesh; it produces the per-frame
 * material/size which `SpritePool.syncPlayer` applies.
 *
 * Falls back to `idle` when a `pickState`-selected sheet has not been
 * registered. The fall pose is intentionally folded into `jump` (the
 * airborne sheet holds on its last frame); `dash` and `hurt` are not
 * registered as separate sheets and currently render as their underlying
 * locomotion state.
 */

/** Logical animation state. */
export type PlayerAnimState =
  | "idle"
  | "walk"
  | "jump"
  | "wallSlide"
  | "wallKick"
  | "crouch"
  | "crouchAttack"
  | "aerialCrouchAttack"
  | "attack"
  | "hurt"
  | "dashStartup"
  | "dash"
  | "dashExit";

/**
 * Per-state runtime data — built once when a sheet is registered.
 * @internal
 */
export interface AnimDef {
  readonly texture: THREE.Texture;
  readonly material: THREE.MeshBasicMaterial;
  readonly frames: number;
  readonly worldW: number;
  readonly worldH: number;
  readonly fps: number;
  readonly loop: boolean;
  /** When true, the strip is played back-to-front (last frame first). */
  readonly reversed?: boolean;
}

/** Inputs read by the animator each tick to pick the active state. */
export interface PlayerAnimInputs {
  readonly isAttacking: boolean;
  readonly isCrouching: boolean;
  readonly isGrounded: boolean;
  readonly velocityX: number;
  /** True while the player is in the wall-slide locomotion state. */
  readonly isWallSliding?: boolean;
  /** True for the brief input-lock window after a wall kick fires. */
  readonly isWallKicking?: boolean;
  /** True while the player's dash burst is active. */
  readonly isDashing?: boolean;
  /**
   * Seconds of post-hit invulnerability remaining. When > 0 the animator
   * may select a `hurt` sheet (currently falls back to the underlying
   * locomotion state because no hurt sheet is registered).
   */
  readonly iFrameTimer?: number;
}

/**
 * Pixels-per-world-unit reference. The 64×64 idle frame represents a
 * 1×1 world-unit area, so all other frame dimensions in pixels divide
 * through this constant to derive the rendered world size.
 *
 * Reduced from 64 → 51.2 (= 64 / 1.25) to scale every registered player
 * sprite sheet uniformly 25 % larger in world units without editing each
 * frame size in `main.ts`.
 */
const PX_PER_UNIT = 51.2;

/** |vx| above this counts as "moving" for picking the walk state. */
const WALK_VX_THRESHOLD = 0.1;

export class PlayerAnimator {
  private readonly _defs = new Map<PlayerAnimState, AnimDef>();
  private _state: PlayerAnimState = "idle";
  private _frame = 0;
  private _accum = 0;
  /**
   * Dash animation phase. Tracked across update() calls so the startup
   * sheet plays once on dash entry, the dash loop sustains for the body
   * of the dash, and the (reversed-startup) exit sheet plays once after
   * the dash burst ends.
   */
  private _dashPhase: "none" | "startup" | "loop" | "exit" = "none";
  private _wasDashing = false;
  /**
   * True while a one-shot `hurt` animation is playing. Triggered on the
   * rising edge of `iFrameTimer` (i.e. the moment a hit lands) and cleared
   * when the non-looping `hurt` sheet completes its final frame.
   */
  private _hurtPlaying = false;
  private _prevIFrameTimer = 0;

  /**
   * Register a sprite sheet for one animation state.
   *
   * @param state    - Logical animation state.
   * @param texture  - Loaded `THREE.Texture`. Filtering is reconfigured for
   *                   crisp pixel-art rendering.
   * @param frames   - Number of frames in the horizontal strip.
   * @param frameW   - Width of one frame in pixels.
   * @param frameH   - Height of one frame in pixels.
   * @param fps      - Playback rate.
   * @param loop     - When `false`, the animation holds on the last frame.
   */
  setSheet(
    state: PlayerAnimState,
    texture: THREE.Texture,
    frames: number,
    frameW: number,
    frameH: number,
    fps: number,
    loop: boolean,
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
    this._defs.set(state, {
      texture,
      material,
      frames,
      worldW: frameW / PX_PER_UNIT,
      worldH: frameH / PX_PER_UNIT,
      fps,
      loop,
    });
    // Auto-derive the dash exit sheet from the dash startup sheet so the
    // exit animation renders the same frames in reverse without a second
    // texture asset. A cloned texture is required so its UV `offset.x`
    // can be advanced independently of the startup sheet's offset.
    if (state === "dashStartup") {
      const exitTex = texture.clone();
      exitTex.magFilter = THREE.NearestFilter;
      exitTex.minFilter = THREE.NearestFilter;
      exitTex.generateMipmaps = false;
      exitTex.colorSpace = THREE.SRGBColorSpace;
      exitTex.wrapS = THREE.ClampToEdgeWrapping;
      exitTex.wrapT = THREE.ClampToEdgeWrapping;
      exitTex.repeat.set(1 / frames, 1);
      exitTex.offset.set((frames - 1) / frames, 0);
      exitTex.needsUpdate = true;
      const exitMat = new THREE.MeshBasicMaterial({
        map: exitTex,
        transparent: true,
        depthWrite: false,
      });
      this._defs.set("dashExit", {
        texture: exitTex,
        material: exitMat,
        frames,
        worldW: frameW / PX_PER_UNIT,
        worldH: frameH / PX_PER_UNIT,
        fps,
        loop: false,
        reversed: true,
      });
    }
  }

  /** True once at least one sheet has been registered. */
  hasAny(): boolean {
    return this._defs.size > 0;
  }

  /**
   * Reference width (world units) used for back-edge anchoring. Equal to the
   * registered `idle` sheet's width when present, otherwise falls back to
   * the first registered sheet. Sprites wider than this stay aligned by
   * their back edge (relative to facing) so attack/crouch frames do not
   * appear to shift the character backwards mid-animation.
   */
  get anchorWorldW(): number {
    return this._defs.get("idle")?.worldW ?? this._defs.values().next().value?.worldW ?? 1;
  }

  /** Pick the desired state from current player inputs. */
  pickState(inputs: PlayerAnimInputs): PlayerAnimState {
    // Hurt one-shot has top priority — getting hit interrupts everything.
    if (this._hurtPlaying && this._defs.has("hurt")) return "hurt";
    if (inputs.isAttacking && inputs.isCrouching && !inputs.isGrounded) {
      return "aerialCrouchAttack";
    }
    if (inputs.isAttacking && inputs.isCrouching) return "crouchAttack";
    if (inputs.isAttacking) return "attack";
    if (inputs.isWallKicking) return "wallKick";
    // Dash phase overrides locomotion (but yields to attack / wallKick).
    if (this._dashPhase === "startup" && this._defs.has("dashStartup")) return "dashStartup";
    if (this._dashPhase === "loop" && this._defs.has("dash")) return "dash";
    if (this._dashPhase === "exit" && this._defs.has("dashExit")) return "dashExit";
    if (inputs.isWallSliding) return "wallSlide";
    if (inputs.isCrouching) return "crouch";
    if (!inputs.isGrounded) return "jump";
    if (Math.abs(inputs.velocityX) > WALK_VX_THRESHOLD) return "walk";
    return "idle";
  }

  /**
   * Advance the animation timer and update the active state.
   *
   * Falls back to `idle` if the desired state's sheet has not been loaded
   * yet, so the player still renders during asynchronous texture decode.
   *
   * @returns The active `AnimDef` (texture + material + sizing), or `null`
   *          if no sheets have been registered.
   */
  update(dt: number, inputs: PlayerAnimInputs): AnimDef | null {
    if (this._defs.size === 0) return null;

    // ─── Hurt one-shot trigger ────────────────────────────────────────────
    // The player’s i-frame timer is reset to its full duration whenever a
    // hit lands, so any positive jump in the timer marks a fresh hit.
    const iFrame = inputs.iFrameTimer ?? 0;
    if (iFrame > this._prevIFrameTimer && this._defs.has("hurt")) {
      this._hurtPlaying = true;
    }
    this._prevIFrameTimer = iFrame;

    // ─── Dash phase bookkeeping ─────────────────────────────────────────
    // Drive the startup → loop → exit sequence from rising / falling edges
    // of `inputs.isDashing`. Higher-priority states (attack / wallKick)
    // cancel any in-progress dash phase so the exit sheet does not pop in
    // after an interrupting action.
    const isDashing = !!inputs.isDashing;
    if (isDashing && !this._wasDashing) {
      this._dashPhase = this._defs.has("dashStartup") ? "startup" : "loop";
    } else if (!isDashing && this._wasDashing && this._dashPhase !== "none") {
      this._dashPhase = this._defs.has("dashExit") ? "exit" : "none";
    }
    this._wasDashing = isDashing;
    if (inputs.isAttacking || inputs.isWallKicking) {
      this._dashPhase = "none";
    }

    const desired = this.pickState(inputs);
    const def = this._defs.get(desired) ?? this._defs.get("idle") ?? null;
    if (def === null) return null;

    const effectiveState = this._defs.has(desired) ? desired : "idle";
    if (effectiveState !== this._state) {
      const prev = this._state;
      this._state = effectiveState;
      this._accum = 0;
      // Special case: when leaving any crouch-attack variant (grounded
      // or aerial) into a held crouch, skip straight to the crouch
      // sheet's final frame (the fully crouched pose) rather than
      // replaying the crouch-down animation from frame 0.
      if (
        (prev === "crouchAttack" || prev === "aerialCrouchAttack") &&
        effectiveState === "crouch"
      ) {
        this._frame = Math.max(0, def.frames - 1);
      } else {
        this._frame = 0;
      }
    }

    this._accum += dt;
    const frameDur = 1 / def.fps;
    while (this._accum >= frameDur) {
      this._accum -= frameDur;
      this._frame++;
    }
    const completed = !def.loop && this._frame >= def.frames;
    if (def.loop) {
      this._frame = this._frame % def.frames;
    } else if (this._frame >= def.frames) {
      this._frame = def.frames - 1;
    }
    const displayFrame = def.reversed ? def.frames - 1 - this._frame : this._frame;
    def.texture.offset.x = displayFrame / def.frames;

    // Advance dash phase on non-looping completions.
    if (completed) {
      if (effectiveState === "dashStartup" && this._dashPhase === "startup") {
        this._dashPhase = "loop";
      } else if (effectiveState === "dashExit" && this._dashPhase === "exit") {
        this._dashPhase = "none";
      } else if (effectiveState === "hurt") {
        this._hurtPlaying = false;
      }
    }
    return def;
  }

  // ─── Read-only accessors (testing / debugging) ─────────────────────────

  get state(): PlayerAnimState {
    return this._state;
  }
  get frame(): number {
    return this._frame;
  }
}
