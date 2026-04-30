import type { Enemy } from "./Enemy.js";
import { Keys } from "./Keys.js";
import { Wallet } from "./Wallet.js";
import { Phone } from "./Phone.js";
import { Lipstick } from "./Lipstick.js";
import { Headphones } from "./Headphones.js";
import { BossLaundry } from "./BossLaundry.js";

/** Tag identifying each enemy type. */
export type EnemyTag =
  | "Keys"
  | "Wallet"
  | "Phone"
  | "Lipstick"
  | "Headphones"
  | "BossLaundry";

/** Per-type metadata used by the level generator. */
export interface EnemySpec {
  /** Factory: create a new instance at the given world position. */
  factory: (position: { x: number; y: number }) => Enemy;
  /** Upgrade gauge fill awarded to the player on kill. */
  gaugeReward: number;
}

/** Registry mapping every enemy tag to its spec. */
export const ENEMY_REGISTRY: Readonly<Record<EnemyTag, EnemySpec>> = {
  Keys: { factory: (pos) => new Keys(pos), gaugeReward: 1 },
  Wallet: { factory: (pos) => new Wallet(pos), gaugeReward: 2 },
  Phone: { factory: (pos) => new Phone(pos), gaugeReward: 1 },
  Lipstick: { factory: (pos) => new Lipstick(pos), gaugeReward: 1 },
  Headphones: { factory: (pos) => new Headphones(pos), gaugeReward: 1 },
  BossLaundry: { factory: (pos) => new BossLaundry(pos), gaugeReward: 0 },
};

/**
 * Spawn an enemy by tag at the given world position.
 *
 * @param tag      - Which enemy type to create.
 * @param position - Spawn position in world units.
 */
export function spawnEnemy(tag: EnemyTag, position: { x: number; y: number }): Enemy {
  return ENEMY_REGISTRY[tag].factory(position);
}
