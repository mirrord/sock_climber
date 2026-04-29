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
  /**
   * Pause (in seconds) after hitting a wall in `Patrol` before reversing
   * direction. Gives the wallet a brief "thinking" beat instead of an
   * instantaneous bounce.
   */
  static readonly TURN_DELAY = 0.4; // seconds
  /** Terminal fall speed in m/s. Caps gravity-driven downward velocity. */
  static readonly MAX_FALL_SPEED = 12;

  private _state: WalletState = "Patrol";
  private _patrolDir: 1 | -1 = 1;
  private _chargeTimer = 0;
  /**
   * Remaining seconds of post-wall-hit pause in `Patrol`. While > 0 the
   * wallet stands still; when it hits 0 the patrol direction is committed
   * to the opposite of the wall it touched.
   */
  private _turnDelayTimer = 0;
  /** Direction to face after `_turnDelayTimer` reaches 0. */
  private _pendingTurnDir: 1 | -1 | null = null;

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
    this._turnDelayTimer = 0;
    this._pendingTurnDir = null;
  }

  protected updateAI(dt: number, playerX: number, _playerY: number): void {
    switch (this._state) {
      case "Patrol":
        // Queue a delayed reversal on wall contact rather than turning
        // around immediately. Only re-arm the timer if we're not already
        // mid-pause for this same wall.
        if (this.body.flags.onWallL && this._pendingTurnDir !== 1) {
          this._pendingTurnDir = 1;
          this._turnDelayTimer = Wallet.TURN_DELAY;
        } else if (this.body.flags.onWallR && this._pendingTurnDir !== -1) {
          this._pendingTurnDir = -1;
          this._turnDelayTimer = Wallet.TURN_DELAY;
        }

        if (this._turnDelayTimer > 0) {
          // Stand still while the turn delay elapses.
          this._turnDelayTimer -= dt;
          this.body.velocity.x = 0;
          if (this._turnDelayTimer <= 0 && this._pendingTurnDir !== null) {
            this._patrolDir = this._pendingTurnDir;
            this._pendingTurnDir = null;
            this._turnDelayTimer = 0;
          }
        } else {
          this.body.velocity.x = this._patrolDir * Wallet.PATROL_SPEED;
        }

        // Transition to Charge when player is in range.
        if (Math.abs(playerX - this.body.position.x) < Wallet.DETECTION_RANGE) {
          this._state = "Charge";
          this._chargeTimer = Wallet.CHARGE_DURATION;
          this._turnDelayTimer = 0;
          this._pendingTurnDir = null;
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
