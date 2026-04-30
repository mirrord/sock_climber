import type { EventBus, GameEvents } from "../core/EventBus.js";
import type { InputSnapshot } from "../input/InputSnapshot.js";
import type { Player } from "../entities/Player.js";
import { ATTACK_TABLE, attackDuration } from "./AttackTable.js";

/** Minimal interface required for any target that can take damage. */
export interface Damageable {
  readonly id: number;
  readonly position: Readonly<{ x: number; y: number }>;
  readonly halfExtents: Readonly<{ x: number; y: number }>;
  /** Current HP — CombatSystem emits `onKill` when this reaches 0. */
  hp: number;
  /**
   * Apply damage and knockback.
   * @returns `true` if damage was taken; `false` if blocked (e.g. i-frames).
   */
  takeDamage(damage: number, knockbackX: number, knockbackY: number): boolean;
}

/** Internal state for an in-progress player attack. */
interface AttackState {
  attackId: string;
  /** Seconds elapsed since the attack started. */
  elapsed: number;
  /** IDs already hit during this attack — prevents double-hits within one activation. */
  hitTargets: Set<number>;
}

/**
 * CombatSystem — drives player attack frame windows, resolves hitbox vs
 * hurtbox overlaps, and emits `onHit` / `onKill` events.
 *
 * Receiving damage (enemy attacks player) is handled by `Player.takeDamage`,
 * which already enforces i-frames; callers pass damage through there.
 */
export class CombatSystem {
  /** Horizontal recoil speed (m/s) applied to the player on a landed hit. */
  static readonly PLAYER_RECOIL_VX = 2;

  private readonly _bus: EventBus<GameEvents>;
  private _attack: AttackState | null = null;

  constructor(bus: EventBus<GameEvents>) {
    this._bus = bus;
  }

  /**
   * Step the combat system for one fixed timestep.
   *
   * @param dt      - Step size in seconds.
   * @param snap    - Input snapshot for this step.
   * @param player  - The player entity.
   * @param targets - Damageable entities to test against.
   */
  update(
    dt: number,
    snap: InputSnapshot,
    player: Player,
    targets: Damageable[],
  ): void {
    // Start a new attack if idle and Attack is pressed.
    if (this._attack === null && snap.buttonsPressed.has("Attack")) {
      // Aerial-crouch attack when crouching and not grounded.
      const attackId =
        player.isCrouching && player.locomotion !== "Grounded" ? "AerialCrouch" : "Normal";
      this._attack = { attackId, elapsed: 0, hitTargets: new Set() };
      this._bus.emit("onAttack", {});
    }

    if (this._attack === null) return;

    const data = ATTACK_TABLE[this._attack.attackId];
    if (data === undefined) {
      this._attack = null;
      return;
    }

    // Scale time progression by attackSpeedMultiplier so faster-attack buffs
    // (e.g. RapidStrikeSock) shorten every attack phase proportionally. A
    // multiplier of 2 makes the attack progress at 2x speed; <1 slows it.
    const speed = player.effectiveStats.attackSpeedMultiplier;
    this._attack.elapsed += dt * speed;
    const elapsed = this._attack.elapsed;
    const inActive = elapsed >= data.startup && elapsed < data.startup + data.active;

    // Aerial-crouch descent damp during active frames.
    if (inActive && data.aerialCrouchDamp !== undefined && player.body.velocity.y > 0) {
      player.body.velocity.y *= data.aerialCrouchDamp;
    }

    // Resolve hits during the active window.
    if (inActive) {
      const facing = player.facing;
      const hbX = player.body.position.x + data.offsetX * facing;
      const hbY = player.body.position.y + data.offsetY;

      for (const target of targets) {
        if (this._attack.hitTargets.has(target.id)) continue;

        // AABB overlap test.
        const overlapX = Math.abs(hbX - target.position.x) < data.halfW + target.halfExtents.x;
        const overlapY = Math.abs(hbY - target.position.y) < data.halfH + target.halfExtents.y;

        if (overlapX && overlapY) {
          const kbX = data.knockbackX * facing;
          const hit = target.takeDamage(data.damage, kbX, data.knockbackY);
          if (hit) {
            this._attack.hitTargets.add(target.id);
            // Knockback is now applied as velocity inside `target.takeDamage`;
            // the target's hit-stun then lets the physics step carry it back
            // and resolve cleanly against walls (no positional teleport that
            // could embed enemies inside geometry).
            // Apply a small horizontal recoil to the player, opposite the
            // attack direction. Subtle by design — gives weight to hits
            // without disrupting platforming flow.
            player.body.velocity.x -= facing * CombatSystem.PLAYER_RECOIL_VX;
            this._bus.emit("onHit", { entityId: target.id, damage: data.damage });
            if (target.hp <= 0) {
              this._bus.emit("onKill", { entityId: target.id });
            }
          }
        }
      }
    }

    // End attack when all phases are complete.
    if (elapsed >= attackDuration(data)) {
      this._attack = null;
    }
  }

  /** `true` while an attack is in any phase (startup / active / recovery). */
  get isAttacking(): boolean {
    return this._attack !== null;
  }

  /** Elapsed time since the current attack started, or `0` if idle. */
  get attackElapsed(): number {
    return this._attack?.elapsed ?? 0;
  }

  /** Attack ID of the current attack, or an empty string if idle. */
  get currentAttackId(): string {
    return this._attack?.attackId ?? "";
  }
}
