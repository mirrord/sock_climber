import { Enemy } from "./Enemy.js";

/** AI states for the Wallet enemy. */
export type WalletState = "Patrol" | "Charge";

/**
 * Wallet — slides flat and charges horizontally.
 *
 * State machine:
 * - `Patrol` → slides at `PATROL_SPEED` in the current direction; reverses on wall
 *              contact. Transitions to `Charge` when the player enters `DETECTION_RANGE`.
 * - `Charge` → rushes toward the player at `CHARGE_SPEED` for `CHARGE_DURATION` seconds
 *              (or until hitting a wall), then returns to `Patrol`.
 */
export class Wallet extends Enemy {
  static readonly PATROL_SPEED = 1.5; // m/s
  static readonly CHARGE_SPEED = 6; // m/s
  static readonly DETECTION_RANGE = 6; // meters
  static readonly CHARGE_DURATION = 1.5; // seconds
  /** Terminal fall speed in m/s. Caps gravity-driven downward velocity. */
  static readonly MAX_FALL_SPEED = 12;

  private _state: WalletState = "Patrol";
  private _patrolDir: 1 | -1 = 1;
  private _chargeTimer = 0;

  constructor(position: { x: number; y: number }) {
    super({
      position,
      halfW: 0.5,
      halfH: 0.4,
      maxHp: 3,
      contactKnockbackX: 6,
      gaugeReward: 2,
    });
  }

  get state(): WalletState {
    return this._state;
  }

  protected override onSpawn(): void {
    this._state = "Patrol";
    this._patrolDir = 1;
    this._chargeTimer = 0;
  }

  protected updateAI(dt: number, playerX: number, _playerY: number): void {
    switch (this._state) {
      case "Patrol":
        // Reverse on wall contact.
        if (this.body.flags.onWallL) this._patrolDir = 1;
        if (this.body.flags.onWallR) this._patrolDir = -1;
        this.body.velocity.x = this._patrolDir * Wallet.PATROL_SPEED;
        // Transition to Charge when player is in range.
        if (Math.abs(playerX - this.body.position.x) < Wallet.DETECTION_RANGE) {
          this._state = "Charge";
          this._chargeTimer = Wallet.CHARGE_DURATION;
        }
        break;

      case "Charge":
        this._chargeTimer -= dt;
        if (this._chargeTimer <= 0 || this.body.flags.onWallL || this.body.flags.onWallR) {
          this.body.velocity.x = 0;
          this._state = "Patrol";
        } else {
          const dir = (Math.sign(playerX - this.body.position.x) || 1) as 1 | -1;
          this.body.velocity.x = dir * Wallet.CHARGE_SPEED;
        }
        break;
    }

    // Cap downward fall speed.
    if (this.body.velocity.y > Wallet.MAX_FALL_SPEED) {
      this.body.velocity.y = Wallet.MAX_FALL_SPEED;
    }
  }
}
