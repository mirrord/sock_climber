import type { Obstacle } from "./Obstacle.js";
import { Gum } from "./Gum.js";
import { DustBunny } from "./DustBunny.js";
import { Lighter } from "./Lighter.js";
import { Pen } from "./Pen.js";
import { DryerSheet } from "./DryerSheet.js";

/** Tag identifying each obstacle type. */
export type ObstacleTag =
  | "Gum"
  | "DustBunny"
  | "Lighter"
  | "Pen"
  | "DryerSheet";

/** Per-type metadata used by the level generator. */
export interface ObstacleSpec {
  /** Factory: create a new instance at the given world position. */
  factory: (position: { x: number; y: number }) => Obstacle;
  /** Whether this obstacle is a trigger volume (non-solid). */
  isTrigger: boolean;
}

/** Registry mapping every obstacle tag to its spec. */
export const OBSTACLE_REGISTRY: Readonly<Record<ObstacleTag, ObstacleSpec>> = {
  Gum: { factory: (pos) => new Gum(pos), isTrigger: true },
  DustBunny: { factory: (pos) => new DustBunny(pos), isTrigger: false },
  Lighter: { factory: (pos) => new Lighter(pos), isTrigger: false },
  Pen: { factory: (pos) => new Pen(pos), isTrigger: false },
  // DryerSheet is the player projectile — never spawned by level
  // generators, but registered so its tag participates in EntityTag
  // unions (sprite registration, generator filters, etc.).
  DryerSheet: {
    factory: (pos) => new DryerSheet(pos, 1),
    isTrigger: true,
  },
};

/**
 * Spawn an obstacle by tag at the given world position.
 *
 * @param tag      - Which obstacle type to create.
 * @param position - Spawn position in world units.
 */
export function spawnObstacle(tag: ObstacleTag, position: { x: number; y: number }): Obstacle {
  return OBSTACLE_REGISTRY[tag].factory(position);
}
