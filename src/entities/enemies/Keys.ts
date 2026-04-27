import { Enemy } from "./Enemy.js";

/** AI states for the Keys enemy. */
export type KeysState = "Idle" | "Telegraph" | "Jump";

/**
 * Keys — hops in an arc toward the player.
 *
 * State machine:
 * - `Idle`      → waits `IDLE_TIME` seconds, then enters `Telegraph`.
 * - `Telegraph` → telegraphs (jingle) for `TELEGRAPH_TIME` seconds, then jumps.
 * - `Jump`      → airborne arc; returns to `Idle` on landing or timeout.
 */
export class Keys extends Enemy {
  static readonly IDLE_TIME = 1.5;
  static readonly TELEGRAPH_TIME = 0.5;
  static readonly JUMP_SPEED = 8; // m/s horizontal toward player
  static readonly JUMP_VY = -12; // m/s upward
  static readonly JUMP_TIMEOUT = 2; // max seconds before returning to Idle

  private _state: KeysState = "Idle";
  private _timer = Keys.IDLE_TIME;

  constructor(position: { x: number; y: number }) {
    super({ position, halfW: 0.3, halfH: 0.3, maxHp: 2, gaugeReward: 1 });
  }

  get state(): KeysState {
    return this._state;
  }

  protected override onSpawn(): void {
    this._state = "Idle";
    this._timer = Keys.IDLE_TIME;
  }

  protected updateAI(dt: number, playerX: number, _playerY: number): void {
    this._timer -= dt;

    switch (this._state) {
      case "Idle":
        this.body.velocity.x = 0;
        if (this._timer <= 0) {
          this._state = "Telegraph";
          this._timer = Keys.TELEGRAPH_TIME;
        }
        break;

      case "Telegraph":
        this.body.velocity.x = 0;
        if (this._timer <= 0) {
          const dir = (Math.sign(playerX - this.body.position.x) || 1) as 1 | -1;
          this.body.velocity.x = dir * Keys.JUMP_SPEED;
          this.body.velocity.y = Keys.JUMP_VY;
          this._state = "Jump";
          this._timer = Keys.JUMP_TIMEOUT;
        }
        break;

      case "Jump":
        if (this.body.flags.onGround || this._timer <= 0) {
          this.body.velocity.x = 0;
          this._state = "Idle";
          this._timer = Keys.IDLE_TIME;
        }
        break;
    }
  }
}
