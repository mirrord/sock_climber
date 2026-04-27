import { Enemy } from "./Enemy.js";

/** AI states for the Lipstick enemy (always rolling). */
export type LipstickState = "Rolling";

/** A trail node — position deposited while rolling. */
export interface TrailNode {
  x: number;
  y: number;
}

/**
 * Lipstick — rolls down slopes/paths and leaves a brief slick trail.
 *
 * Rolls at `ROLL_SPEED` in the current direction; reverses on wall contact.
 * Deposits a trail node every `TRAIL_INTERVAL` seconds (up to `MAX_TRAIL_LENGTH`
 * nodes), representing the slick surface left behind.
 */
export class Lipstick extends Enemy {
  static readonly ROLL_SPEED = 4; // m/s
  static readonly TRAIL_INTERVAL = 0.2; // seconds between trail deposits
  static readonly MAX_TRAIL_LENGTH = 8;

  private _state: LipstickState = "Rolling";
  private _dir: 1 | -1 = 1;
  private readonly _trail: TrailNode[] = [];
  private _trailTimer = 0;

  constructor(position: { x: number; y: number }) {
    super({ position, halfW: 0.25, halfH: 0.25, maxHp: 2, gaugeReward: 1 });
  }

  get state(): LipstickState {
    return this._state;
  }

  /**
   * Read-only snapshot of the current slick trail positions.
   * The level-collision system reads this to apply the slow effect.
   */
  get trail(): ReadonlyArray<Readonly<TrailNode>> {
    return this._trail;
  }

  protected override onSpawn(): void {
    this._dir = 1;
    this._trail.length = 0;
    this._trailTimer = 0;
  }

  protected updateAI(dt: number, _playerX: number, _playerY: number): void {
    // Reverse on wall contact.
    if (this.body.flags.onWallL) this._dir = 1;
    if (this.body.flags.onWallR) this._dir = -1;
    this.body.velocity.x = this._dir * Lipstick.ROLL_SPEED;

    // Deposit a trail node periodically.
    this._trailTimer += dt;
    if (this._trailTimer >= Lipstick.TRAIL_INTERVAL) {
      this._trailTimer = 0;
      this._trail.push({ x: this.body.position.x, y: this.body.position.y });
      if (this._trail.length > Lipstick.MAX_TRAIL_LENGTH) {
        this._trail.shift();
      }
    }
  }
}
