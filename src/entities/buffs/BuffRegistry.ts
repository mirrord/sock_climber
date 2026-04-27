import type { Buff } from "./Buff.js";
import { LowGravitySock } from "./LowGravitySock.js";
import { SpeedSock } from "./SpeedSock.js";
import { SlowFloodSock } from "./SlowFloodSock.js";
import { HighJumpSock } from "./HighJumpSock.js";
import { PowerSock } from "./PowerSock.js";
import { RapidStrikeSock } from "./RapidStrikeSock.js";

/** Tag identifying each buff pickup variant. */
export type BuffTag =
  | "LowGravitySock"
  | "SpeedSock"
  | "SlowFloodSock"
  | "HighJumpSock"
  | "PowerSock"
  | "RapidStrikeSock";

/** Per-type metadata used by the level generator. */
export interface BuffSpec {
  /** Factory: create a new pickup instance at the given world position. */
  factory: (position: { x: number; y: number }) => Buff;
  /** Human-readable description for debug / UI. */
  description: string;
}

/** Registry mapping every buff tag to its spec. */
export const BUFF_REGISTRY: Readonly<Record<BuffTag, BuffSpec>> = {
  LowGravitySock: {
    factory: (pos) => new LowGravitySock(pos),
    description: "Reduces gravity for a short time.",
  },
  SpeedSock: {
    factory: (pos) => new SpeedSock(pos),
    description: "Increases horizontal speed.",
  },
  SlowFloodSock: {
    factory: (pos) => new SlowFloodSock(pos),
    description: "Slows the death-plane ascent.",
  },
  HighJumpSock: {
    factory: (pos) => new HighJumpSock(pos),
    description: "Increases jump height.",
  },
  PowerSock: {
    factory: (pos) => new PowerSock(pos),
    description: "Doubles damage dealt.",
  },
  RapidStrikeSock: {
    factory: (pos) => new RapidStrikeSock(pos),
    description: "Increases attack speed.",
  },
};

/**
 * Spawn a buff pickup by tag at the given world position.
 *
 * @param tag      - Which buff type to create.
 * @param position - Spawn position in world units.
 */
export function spawnBuff(tag: BuffTag, position: { x: number; y: number }): Buff {
  return BUFF_REGISTRY[tag].factory(position);
}
