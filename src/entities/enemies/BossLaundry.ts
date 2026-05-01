import type { EventBus, GameEvents } from "../../core/EventBus.js";
import { createRNG, type RNG } from "../../core/RNG.js";
import { DustBunny } from "../obstacles/DustBunny.js";
import { SoftenerBuff } from "../buffs/SoftenerBuff.js";
import { Enemy } from "./Enemy.js";

/** AI states for the BossLaundry. */
export type BossLaundryState =
  | "Idle"
  | "Throw"
  | "Chase"
  | "JumpTelegraph"
  | "Jump"
  | "Dizzy";

/**
 * BossLaundry — the level 4 boss. A massive sentient laundry pile that
 * cycles through three offensive behaviours (Throw / Chase / Jump) and
 * is invulnerable except during a 10-second `Dizzy` window triggered by
 * three dryer-sheet hits. The fight ends once the player has landed
 * `MELEE_STRIKES_TO_WIN` melee strikes during dizzy windows
 * (cumulative across multiple windows).
 *
 * The boss spawns dust bunnies and the occasional `SoftenerBuff` pickup
 * during its `Throw` state via the `onBossSpawn` event so `SpawnSystem`
 * can adopt them into the live entity list and the renderer can attach
 * sprites.
 */
export class BossLaundry extends Enemy {
  /** Number of melee hits required to defeat the boss. */
  static readonly MELEE_STRIKES_TO_WIN = 12;
  /** Number of dryer-sheet hits required to enter Dizzy. */
  static readonly SHEETS_TO_DIZZY = 3;
  /** Duration of the Dizzy state in seconds. */
  static readonly DIZZY_DURATION = 10;
  /** Idle pause between behaviours. */
  static readonly IDLE_TIME = 0.6;
  /** Throw windup before bunnies launch. */
  static readonly THROW_WINDUP = 1.0;
  /** Chase duration cap. */
  static readonly CHASE_TIME = 3.0;
  /** Chase orbit radius (m) along the inner perimeter. */
  static readonly CHASE_RADIUS = 16;
  /** Chase angular speed (rad/s). */
  static readonly CHASE_OMEGA = 1.4;
  /** Jump telegraph duration (shake). */
  static readonly JUMP_TELEGRAPH_TIME = 0.7;
  /** Jump airtime (seconds) before landing on the player's column. */
  static readonly JUMP_AIRTIME = 1.0;
  /** Number of dust bunnies launched per Throw. */
  static readonly THROW_COUNT_MIN = 3;
  static readonly THROW_COUNT_MAX = 5;
  /** Probability that one of the spawned projectiles is a Softener pickup. */
  static readonly SOFTENER_DROP_CHANCE = 0.6;

  private _state: BossLaundryState = "Idle";
  private _timer = BossLaundry.IDLE_TIME;
  private _bus: EventBus<GameEvents> | null = null;
  private _rng: RNG = createRNG(0xb055);

  /** Cumulative melee hits landed across all Dizzy windows (0..12). */
  private _meleeStrikesTaken = 0;
  /** Dryer-sheet hits accumulated since last Dizzy (0..3). */
  private _sheetHits = 0;
  /** Last behaviour chosen — used to avoid two-in-a-row repeats. */
  private _lastBehaviour: "Throw" | "Chase" | "Jump" | null = null;
  /** Cached arena centre (set by main.ts via `setArenaCentre`). */
  private _arenaCx = 0;
  private _arenaCy = 0;
  /** Anchor position recorded at the start of a Chase orbit. */
  private _chaseAngle = 0;
  /** Recorded ground-Y to land on for Jump. */
  private _jumpStartY = 0;
  /** Whether `onLevelComplete` has been emitted (idempotency guard). */
  private _completeEmitted = false;

  constructor(position: { x: number; y: number }) {
    super({
      position,
      halfW: 1.875,
      halfH: 1.875,
      maxHp: BossLaundry.MELEE_STRIKES_TO_WIN, // cosmetic; we override takeDamage
      iFrameDuration: 0.0,
      contactDamage: 2,
      contactKnockbackX: 6,
      contactKnockbackY: -6,
      gaugeReward: 0,
      gravity: 30,
    });
  }

  get state(): BossLaundryState {
    return this._state;
  }

  get meleeStrikesTaken(): number {
    return this._meleeStrikesTaken;
  }

  get sheetHits(): number {
    return this._sheetHits;
  }

  /** Render-side sprite variant — sub-sheet swaps per state. */
  get spriteVariant(): string | undefined {
    switch (this._state) {
      case "Throw":
        return "BossLaundryThrow";
      case "Chase":
        return "BossLaundryChase";
      case "JumpTelegraph":
        return "BossLaundryTelegraph";
      case "Jump":
        return "BossLaundryJump";
      case "Dizzy":
        return "BossLaundryDizzy";
      default:
        return undefined;
    }
  }

  /** Attach event bus so the boss can publish projectile spawns + completion. */
  attachBus(bus: EventBus<GameEvents>): void {
    this._bus = bus;
  }

  /** Inject a deterministic RNG (called by main.ts after construction). */
  setRng(rng: RNG): void {
    this._rng = rng;
  }

  /** Record the arena centre so Chase orbit + Jump stay inside the room. */
  setArenaCentre(cx: number, cy: number): void {
    this._arenaCx = cx;
    this._arenaCy = cy;
    // Initialise chase angle to the boss's current direction from centre
    // so a transition into Chase doesn't teleport the boss across the room.
    const dx = this.body.position.x - cx;
    const dy = this.body.position.y - cy;
    this._chaseAngle = Math.atan2(dy, dx);
  }

  /**
   * Apply a melee hit. Returns false (no damage, no knockback) outside
   * the Dizzy window so the boss reads as armoured. During Dizzy each
   * hit increments `_meleeStrikesTaken` and emits `onLevelComplete`
   * once the threshold is reached.
   */
  override takeDamage(damage: number, knockbackX: number, knockbackY: number): boolean {
    if (this._state !== "Dizzy") return false;
    if (this._health.iFrameTimer > 0) return false;
    this._meleeStrikesTaken = Math.min(
      BossLaundry.MELEE_STRIKES_TO_WIN,
      this._meleeStrikesTaken + Math.max(1, Math.floor(damage)),
    );
    // Apply a small knockback for feedback but don't move the boss far.
    this.body.velocity.x = knockbackX * 0.25;
    this.body.velocity.y = knockbackY * 0.25;
    this._health.iFrameTimer = 0.25;
    if (
      !this._completeEmitted &&
      this._meleeStrikesTaken >= BossLaundry.MELEE_STRIKES_TO_WIN
    ) {
      this._completeEmitted = true;
      // Boss is "defeated" — keep the body alive so the corpse stays
      // in the world; the run-end logic is driven entirely off the
      // event so timing matches the Victory overlay.
      this._bus?.emit("onLevelComplete", { levelId: 4 });
    }
    return true;
  }

  /**
   * Record a dryer-sheet hit. After `SHEETS_TO_DIZZY` hits the boss
   * enters the Dizzy state for `DIZZY_DURATION` seconds.
   */
  applyDryerSheetHit(): void {
    if (this._state === "Dizzy") return; // already stunned; ignore
    this._sheetHits += 1;
    if (this._sheetHits >= BossLaundry.SHEETS_TO_DIZZY) {
      this._enterDizzy();
    }
  }

  protected override onSpawn(): void {
    this._state = "Idle";
    this._timer = BossLaundry.IDLE_TIME;
    this._meleeStrikesTaken = 0;
    this._sheetHits = 0;
    this._completeEmitted = false;
    this.contactHitbox.active = true;
  }

  protected updateAI(dt: number, playerX: number, playerY: number): void {
    this._timer -= dt;
    switch (this._state) {
      case "Idle":
        this.body.velocity.x = 0;
        if (this._timer <= 0) this._pickBehaviour();
        break;

      case "Throw":
        // Stand still during windup, then launch and return to Idle.
        this.body.velocity.x = 0;
        if (this._timer <= 0) {
          this._launchThrow(playerX, playerY);
          this._state = "Idle";
          this._timer = BossLaundry.IDLE_TIME;
        }
        break;

      case "Chase": {
        // Orbit kinematically along inner perimeter toward the player.
        const dirToPlayer = Math.atan2(
          playerY - this._arenaCy,
          playerX - this._arenaCx,
        );
        // Move chase angle toward the player's bearing.
        const delta = wrapAngle(dirToPlayer - this._chaseAngle);
        const step = Math.sign(delta) * Math.min(
          Math.abs(delta),
          BossLaundry.CHASE_OMEGA * dt,
        );
        this._chaseAngle += step;
        const r = BossLaundry.CHASE_RADIUS;
        this.body.position.x = this._arenaCx + Math.cos(this._chaseAngle) * r;
        this.body.position.y = this._arenaCy + Math.sin(this._chaseAngle) * r;
        this.body.velocity.x = 0;
        this.body.velocity.y = 0;
        const dx = playerX - this.body.position.x;
        const dy = playerY - this.body.position.y;
        if (this._timer <= 0 || dx * dx + dy * dy < 4) {
          this._state = "Idle";
          this._timer = BossLaundry.IDLE_TIME;
        }
        break;
      }

      case "JumpTelegraph":
        // Tiny shake — just nudge horizontal velocity left/right.
        this.body.velocity.x = Math.sin(this._timer * 40) * 0.5;
        if (this._timer <= 0) {
          this._launchJump(playerX);
          this._state = "Jump";
          this._timer = BossLaundry.JUMP_AIRTIME;
        }
        break;

      case "Jump":
        if (this.body.flags.onGround || this._timer <= 0) {
          this.body.velocity.x = 0;
          this._state = "Idle";
          this._timer = BossLaundry.IDLE_TIME;
        }
        break;

      case "Dizzy":
        // Stand still, vulnerable. No contact damage.
        this.body.velocity.x = 0;
        this.contactHitbox.active = false;
        if (this._timer <= 0) {
          this._exitDizzy();
        }
        break;
    }
  }

  // ── State transitions ────────────────────────────────────────────────────

  private _pickBehaviour(): void {
    const choices: Array<"Throw" | "Chase" | "Jump"> = ["Throw", "Chase", "Jump"];
    // Bias toward not repeating the most recent behaviour.
    const filtered = this._lastBehaviour
      ? choices.filter((c) => c !== this._lastBehaviour)
      : choices;
    const pick = filtered[Math.floor(this._rng.next() * filtered.length)] ?? "Throw";
    this._lastBehaviour = pick;
    switch (pick) {
      case "Throw":
        this._state = "Throw";
        this._timer = BossLaundry.THROW_WINDUP;
        break;
      case "Chase":
        this._state = "Chase";
        this._timer = BossLaundry.CHASE_TIME;
        // Recompute current orbit angle so jump there cleanly.
        this._chaseAngle = Math.atan2(
          this.body.position.y - this._arenaCy,
          this.body.position.x - this._arenaCx,
        );
        break;
      case "Jump":
        this._state = "JumpTelegraph";
        this._timer = BossLaundry.JUMP_TELEGRAPH_TIME;
        this._jumpStartY = this.body.position.y;
        break;
    }
  }

  private _enterDizzy(): void {
    this._state = "Dizzy";
    this._timer = BossLaundry.DIZZY_DURATION;
    this._sheetHits = 0;
    this.body.velocity.x = 0;
    this.body.velocity.y = 0;
    this.contactHitbox.active = false;
  }

  private _exitDizzy(): void {
    this._state = "Idle";
    this._timer = BossLaundry.IDLE_TIME;
    this._sheetHits = 0;
    this.contactHitbox.active = true;
  }

  private _launchThrow(playerX: number, playerY: number): void {
    if (!this._bus) return;
    const count = this._rng.int(
      BossLaundry.THROW_COUNT_MIN,
      BossLaundry.THROW_COUNT_MAX,
    );
    for (let i = 0; i < count; i++) {
      // Spread aim around the player so multiple bunnies fan out.
      const aimX = playerX + (this._rng.next() - 0.5) * 4;
      const aimY = playerY + (this._rng.next() - 0.5) * 2;
      const ox = this.body.position.x;
      const oy = this.body.position.y - 1.0; // launch point above body centre
      // Solve ballistic velocity for fixed flight time T.
      const T = 0.9;
      const vx = (aimX - ox) / T;
      const vy = (aimY - oy) / T - 0.5 * DustBunny.BALLISTIC_GRAVITY * T;
      const startPos = { x: ox, y: oy };
      // Final projectile in this volley may be a SoftenerBuff drop.
      const isSoftener =
        i === count - 1 && this._rng.next() < BossLaundry.SOFTENER_DROP_CHANCE;
      if (isSoftener) {
        const buff = new SoftenerBuff({ x: aimX, y: aimY });
        this._bus.emit("onBossSpawn", {
          kind: "buff",
          tag: "SoftenerBuff",
          entity: buff,
          position: { x: aimX, y: aimY },
        });
      } else {
        const bunny = new DustBunny(startPos);
        bunny.setBallistic(vx, vy);
        this._bus.emit("onBossSpawn", {
          kind: "obstacle",
          tag: "DustBunny",
          entity: bunny,
          position: startPos,
        });
      }
    }
  }

  private _launchJump(playerX: number): void {
    // Solve for vy that lands on `_jumpStartY` after JUMP_AIRTIME.
    const T = BossLaundry.JUMP_AIRTIME;
    const g = 30;
    const vy = -0.5 * g * T;
    const dx = playerX - this.body.position.x;
    const vx = Math.max(-12, Math.min(12, dx / T));
    this.body.velocity.x = vx;
    this.body.velocity.y = vy;
    void this._jumpStartY;
  }
}

/** Wrap an angle into the range (-PI, PI]. */
function wrapAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}
