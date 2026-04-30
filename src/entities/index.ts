export type { Entity } from "./Entity.js";
export { nextEntityId, _resetEntityIds } from "./Entity.js";

export type { Health } from "./components/Health.js";
export { createHealth } from "./components/Health.js";

export type { Hitbox } from "./components/Hitbox.js";
export { createHitbox } from "./components/Hitbox.js";

export type { PlayerStats } from "./components/Stats.js";
export { DEFAULT_PLAYER_STATS } from "./components/Stats.js";

export type { LocomotionState } from "./Player.js";
export { Player } from "./Player.js";

export {
  getBody,
  getIFrameTimer,
  getSpriteVariant,
  attachBusIfSupported,
} from "./access.js";
