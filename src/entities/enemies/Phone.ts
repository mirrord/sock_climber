import { Enemy } from "./Enemy.js";

/** AI states for the Phone enemy. */
export type PhoneState = "Vibrate" | "Dash";

/**
 * Phone — vibrates in place, then dashes a short burst.
 *
 * State machine:
 * - `Vibrate` → stands still for `VIBRATE_TIME` seconds (visually jitters),
 *               then transitions to `Dash`.
 * - `Dash`    → rushes at `DASH_SPEED` toward the player for `DASH_TIME` seconds
 *               (or until hitting a wall), then returns to `Vibrate`.
 */
export class Phone extends Enemy {
  static readonly VIBRATE_TIME = 1.0; // seconds
  static readonly DASH_TIME = 0.3; // seconds
  static readonly DASH_SPEED = 10; // m/s

  private _state: PhoneState = "Vibrate";
  private _timer = Phone.VIBRATE_TIME;

  constructor(position: { x: number; y: number }) {
    super({ position, halfW: 0.3, halfH: 0.5, maxHp: 2, gaugeReward: 1 });
  }

  get state(): PhoneState {
    return this._state;
  }

  protected override onSpawn(): void {
    this._state = "Vibrate";
    this._timer = Phone.VIBRATE_TIME;
  }

  protected updateAI(dt: number, playerX: number, _playerY: number): void {
    this._timer -= dt;

    switch (this._state) {
      case "Vibrate":
        this.body.velocity.x = 0;
        if (this._timer <= 0) {
          const dir = (Math.sign(playerX - this.body.position.x) || 1) as 1 | -1;
          this.body.velocity.x = dir * Phone.DASH_SPEED;
          this._state = "Dash";
          this._timer = Phone.DASH_TIME;
        }
        break;

      case "Dash":
        if (this._timer <= 0 || this.body.flags.onWallL || this.body.flags.onWallR) {
          this.body.velocity.x = 0;
          this._state = "Vibrate";
          this._timer = Phone.VIBRATE_TIME;
        }
        break;
    }
  }
}
