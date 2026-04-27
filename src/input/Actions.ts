/**
 * All bindable game actions.
 * This is the single source of truth for action names across the engine.
 */
export const ACTIONS = [
  "MoveLeft",
  "MoveRight",
  "Crouch",
  "Jump",
  "Dash",
  "SpringUp",
  "SpringDown",
  "SpringLeft",
  "SpringRight",
  "Attack",
  "ApplyPatch",
  "Pause",
] as const;

export type Action = (typeof ACTIONS)[number];
