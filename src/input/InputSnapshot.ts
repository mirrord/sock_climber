import type { Action } from "./Actions.js";
import type { Bindings } from "./Bindings.js";

/** Per-axis aggregate input, each component in [-1, 1]. */
export interface InputAxes {
  /** Horizontal movement: negative = left, positive = right. */
  moveX: number;
  /** Spring aim horizontal: negative = left, positive = right. */
  springX: number;
  /** Spring aim vertical: negative = up, positive = down. */
  springY: number;
}

/** Immutable snapshot of input state for a single frame. */
export interface InputSnapshot {
  readonly axes: Readonly<InputAxes>;
  /** Actions held this frame (including the first frame). */
  readonly buttonsDown: ReadonlySet<Action>;
  /** Actions that transitioned down this frame (edge detect). */
  readonly buttonsPressed: ReadonlySet<Action>;
  /** Actions that transitioned up this frame (edge detect). */
  readonly buttonsReleased: ReadonlySet<Action>;
  /** Monotonic timestamp in ms at time of poll. */
  readonly timestamp: number;
}

/** An empty, no-op snapshot — useful as a safe default. */
export const EMPTY_SNAPSHOT: InputSnapshot = {
  axes: { moveX: 0, springX: 0, springY: 0 },
  buttonsDown: new Set(),
  buttonsPressed: new Set(),
  buttonsReleased: new Set(),
  timestamp: 0,
};
